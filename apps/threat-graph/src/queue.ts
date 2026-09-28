import { Queue, Worker, type Job } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import { z } from 'zod';
import type pino from 'pino';
import { getConfig } from './config.js';
import type { GraphService } from './service.js';
import type { IocSyncService } from './services/ioc-sync-service.js';
import { NODE_TYPES, RelationshipTypeSchema } from './schemas/graph.js';

// ─── Job Schema ──────────────────────────────────────────────────
// S171 P3b: discriminated union. sync_ioc is the new IOC→graph sync path;
// upsert_node/create_relationship/propagate are the pre-existing actions.

const SyncIocJobSchema = z.object({
  action: z.literal('sync_ioc'),
  tenantId: z.string().uuid(),
  iocId: z.string().uuid(),
});

const UpsertNodeJobSchema = z.object({
  action: z.literal('upsert_node'),
  tenantId: z.string().uuid(),
  nodeType: z.string(),
  nodeId: z.string(),
  properties: z.record(z.unknown()),
});

const CreateRelationshipJobSchema = z.object({
  action: z.literal('create_relationship'),
  tenantId: z.string().uuid(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  relationshipType: RelationshipTypeSchema,
  confidence: z.number().min(0).max(1).optional(),
  properties: z.record(z.unknown()).optional(),
});

const PropagateJobSchema = z.object({
  action: z.literal('propagate'),
  tenantId: z.string().uuid(),
  nodeId: z.string(),
});

export const GraphSyncJobSchema = z.discriminatedUnion('action', [
  SyncIocJobSchema, UpsertNodeJobSchema, CreateRelationshipJobSchema, PropagateJobSchema,
]);

export type GraphSyncJob = z.infer<typeof GraphSyncJobSchema>;

const NODE_TYPE_SET = new Set<string>(NODE_TYPES);

// ─── Queue (Producer) ────────────────────────────────────────────

let _queue: Queue | null = null;

/** Creates the GRAPH_SYNC queue producer. */
export function createGraphSyncQueue(): Queue {
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');
  _queue = new Queue(QUEUES.GRAPH_SYNC, {
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
  iocSync: IocSyncService;
  logger: pino.Logger;
}

/** Creates the GRAPH_SYNC BullMQ worker. */
export function createGraphSyncWorker(deps: GraphWorkerDeps): Worker<GraphSyncJob> {
  const { service, iocSync, logger } = deps;
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');
  const worker = new Worker<GraphSyncJob>(
    QUEUES.GRAPH_SYNC,
    async (job: Job<GraphSyncJob>) => {
      logger.info({ jobId: job.id, action: job.data.action, tenantId: job.data.tenantId }, 'Processing graph sync job');

      const parsed = GraphSyncJobSchema.safeParse(job.data);
      if (!parsed.success) {
        logger.error({ jobId: job.id, errors: parsed.error.issues }, 'Invalid graph sync job data');
        return;
      }

      const data = parsed.data;

      switch (data.action) {
        // Sync paths deliberately do NOT trigger BFS risk propagation: hub actors link hundreds of IOCs, so
        // per-event BFS is O(hub size) queries and inflates scores by association. IOC→entity risk is
        // covered deterministically by rollupEntityRisk; explicit `propagate` jobs / the API still propagate.
        case 'sync_ioc': {
          await iocSync.syncIoc(data.tenantId, data.iocId);
          break;
        }

        case 'upsert_node': {
          // Legacy producer (e.g. ai-enrichment) sending a raw IOC type as nodeType —
          // route it through the real IOC sync path instead of trusting client-provided properties.
          if (!NODE_TYPE_SET.has(data.nodeType)) {
            logger.debug({ jobId: job.id, nodeType: data.nodeType }, 'Legacy upsert_node — routing through sync_ioc');
            await iocSync.syncIoc(data.tenantId, data.nodeId);
            break;
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
          await service.createRelationship(data.tenantId, {
            fromNodeId: data.fromNodeId,
            toNodeId: data.toNodeId,
            type: data.relationshipType,
            confidence: data.confidence ?? 0.5,
            source: 'auto-detected',
            properties: data.properties,
          });
          break;
        }

        case 'propagate': {
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
