import { Queue, Worker, type Job } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import { z } from 'zod';
import type pino from 'pino';
import { getConfig } from './config.js';
import type { GraphService } from './service.js';

// ─── Job Schema ──────────────────────────────────────────────────

export const GraphSyncJobSchema = z.object({
  tenantId: z.string().uuid(),
  action: z.enum(['upsert_node', 'create_relationship', 'propagate']),
  nodeType: z.string().optional(),
  nodeId: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  fromNodeId: z.string().optional(),
  toNodeId: z.string().optional(),
  relationshipType: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type GraphSyncJob = z.infer<typeof GraphSyncJobSchema>;

// ─── Queue (Producer) ────────────────────────────────────────────

let _queue: Queue | null = null;

/** Creates the GRAPH_SYNC queue producer. */
export function createGraphSyncQueue(): Queue {
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');
  const queueName = QUEUES.GRAPH_SYNC.replace(/:/g, '-');

  _queue = new Queue(queueName, {
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  return _queue;
}

/** Returns the GRAPH_SYNC queue. Throws if not initialized. */
export function getGraphSyncQueue(): Queue {
  if (!_queue) throw new AppError(500, 'Graph sync queue not initialized', 'QUEUE_NOT_INITIALIZED');
  return _queue;
}

/** Closes the GRAPH_SYNC queue. */
export async function closeGraphSyncQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

// ─── Worker (Consumer) ───────────────────────────────────────────

export interface GraphWorkerDeps {
  service: GraphService;
  logger: pino.Logger;
}

/** Creates the GRAPH_SYNC BullMQ worker. */
export function createGraphSyncWorker(deps: GraphWorkerDeps): Worker<GraphSyncJob> {
  const { service, logger } = deps;
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');
  const queueName = QUEUES.GRAPH_SYNC.replace(/:/g, '-');

  const worker = new Worker<GraphSyncJob>(
    queueName,
    async (job: Job<GraphSyncJob>) => {
      logger.info({ jobId: job.id, action: job.data.action, tenantId: job.data.tenantId }, 'Processing graph sync job');

      const parsed = GraphSyncJobSchema.safeParse(job.data);
      if (!parsed.success) {
        logger.error({ jobId: job.id, errors: parsed.error.issues }, 'Invalid graph sync job data');
        return;
      }

      const data = parsed.data;

      switch (data.action) {
        case 'upsert_node': {
          if (!data.nodeType || !data.properties) {
            logger.warn({ jobId: job.id }, 'upsert_node missing nodeType or properties');
            return;
          }
          await service.createNode(data.tenantId, {
            nodeType: data.nodeType as 'IOC',
            properties: { ...data.properties, id: data.nodeId },
          });
          // Auto-propagate after upsert if node has risk score
          const riskScore = Number(data.properties['riskScore'] ?? 0);
          if (riskScore > 0 && data.nodeId) {
            await service.triggerPropagation(data.tenantId, data.nodeId, config.TI_GRAPH_PROPAGATION_MAX_DEPTH);
          }
          break;
        }

        case 'create_relationship': {
          if (!data.fromNodeId || !data.toNodeId || !data.relationshipType) {
            logger.warn({ jobId: job.id }, 'create_relationship missing required fields');
            return;
          }
          await service.createRelationship(data.tenantId, {
            fromNodeId: data.fromNodeId,
            toNodeId: data.toNodeId,
            type: data.relationshipType as 'USES',
            confidence: data.confidence ?? 0.5,
            properties: data.properties,
          });
          break;
        }

        case 'propagate': {
          if (!data.nodeId) {
            logger.warn({ jobId: job.id }, 'propagate missing nodeId');
            return;
          }
          await service.triggerPropagation(data.tenantId, data.nodeId, config.TI_GRAPH_PROPAGATION_MAX_DEPTH);
          break;
        }
      }
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
      concurrency: config.TI_GRAPH_WORKER_CONCURRENCY,
      limiter: { max: 20, duration: 60_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Graph sync job failed');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Graph sync worker error');
  });

  logger.info('Graph sync worker started');
  return worker;
}
