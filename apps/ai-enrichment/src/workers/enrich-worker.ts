import { Worker, type Job } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';
import type pino from 'pino';
import { EnrichJobSchema, type EnrichJob, type EnrichmentResult } from '../schema.js';
import type { EnrichmentService } from '../service.js';
import { getConfig } from '../config.js';

export interface EnrichWorkerDeps {
  service: EnrichmentService;
  logger: pino.Logger;
}

export function createEnrichWorker(deps: EnrichWorkerDeps): Worker<EnrichJob, EnrichmentResult> {
  const { service, logger } = deps;
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  const queueName = QUEUES.ENRICH_REALTIME.replace(/:/g, '-');

  const worker = new Worker<EnrichJob, EnrichmentResult>(
    queueName,
    async (job: Job<EnrichJob>) => {
      logger.info(
        { jobId: job.id, iocId: job.data.iocId, iocType: job.data.iocType },
        'Processing enrichment job',
      );

      const parsed = EnrichJobSchema.safeParse(job.data);
      if (!parsed.success) {
        logger.error({ jobId: job.id, errors: parsed.error.issues }, 'Invalid enrichment job data');
        return {
          vtResult: null, abuseipdbResult: null,
          enrichedAt: new Date().toISOString(),
          enrichmentStatus: 'failed' as const,
          failureReason: 'Invalid job data',
          externalRiskScore: null,
        };
      }

      return service.enrichIOC(parsed.data);
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
      concurrency: config.TI_ENRICHMENT_CONCURRENCY,
      limiter: { max: 10, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Enrichment job failed (BullMQ)');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Enrich worker error');
  });

  logger.info('Enrich worker started');
  return worker;
}
