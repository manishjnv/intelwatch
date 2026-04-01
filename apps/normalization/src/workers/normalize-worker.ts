import { Worker, type Job } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';
import type pino from 'pino';
import { NormalizeBatchJobSchema, type NormalizeBatchJob } from '../schema.js';
import { NormalizationService, type NormalizationResult } from '../service.js';
import type { IOCRepository } from '../repository.js';
import type { BloomManager } from '../bloom.js';
import { getConfig } from '../config.js';

export interface NormalizeWorkerDeps {
  repo: IOCRepository;
  logger: pino.Logger;
  bloomManager?: BloomManager;
}

export function createNormalizeWorker(deps: NormalizeWorkerDeps): Worker<NormalizeBatchJob, NormalizationResult> {
  const { repo, logger, bloomManager } = deps;
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  const service = new NormalizationService(repo, logger);
  if (bloomManager) {
    service.setBloomManager(bloomManager);
  }

  const worker = new Worker<NormalizeBatchJob, NormalizationResult>(
    QUEUES.NORMALIZE,
    async (job: Job<NormalizeBatchJob>) => {
      logger.info(
        { jobId: job.id, articleId: job.data.articleId, iocCount: job.data.iocs.length },
        'Processing normalization job',
      );

      // Validate job data
      const parsed = NormalizeBatchJobSchema.safeParse(job.data);
      if (!parsed.success) {
        logger.error({ jobId: job.id, errors: parsed.error.issues }, 'Invalid normalization job data');
        return { created: 0, updated: 0, skipped: 0, filtered: 0, reactivated: 0, errors: job.data.iocs?.length ?? 0 };
      }

      return service.normalizeBatch(parsed.data);
    },
    {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: password || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      },
      concurrency: config.TI_NORMALIZATION_CONCURRENCY,
      limiter: { max: 20, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Normalization job failed (BullMQ)');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Normalize worker error');
  });

  logger.info('Normalize worker started');
  return worker;
}
