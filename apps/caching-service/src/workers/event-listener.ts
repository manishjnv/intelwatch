/**
 * @module workers/event-listener
 * @description BullMQ worker that consumes cache invalidation events.
 * Other services push {tenantId, eventType} jobs to QUEUES.CACHE_INVALIDATE.
 * This worker forwards them to CacheInvalidator.recordEvent() for debounced invalidation.
 */
import { Worker, type Job } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';
import type { CacheInvalidator } from '../services/cache-invalidator.js';
import { getLogger } from '../logger.js';

/** Payload schema for cache invalidation jobs. */
export interface CacheInvalidatePayload {
  tenantId: string;
  eventType: string;
  /** Optional severity for severity-aware invalidation (#1). */
  severity?: string;
}

export interface EventListenerDeps {
  cacheInvalidator: CacheInvalidator;
  redisUrl: string;
  concurrency?: number;
}

/**
 * BullMQ worker listening on QUEUES.CACHE_INVALIDATE.
 * Forwards events to CacheInvalidator for debounced batch invalidation.
 */
export class EventListenerWorker {
  private worker: Worker | null = null;
  private readonly deps: EventListenerDeps;

  constructor(deps: EventListenerDeps) {
    this.deps = deps;
  }

  /** Start the BullMQ worker. */
  start(): void {
    const logger = getLogger();
    const redisOpts = this.parseRedisUrl(this.deps.redisUrl);

    this.worker = new Worker(
      QUEUES.CACHE_INVALIDATE,
      async (job: Job<CacheInvalidatePayload>) => {
        const { tenantId, eventType } = job.data;
        if (!tenantId || !eventType) {
          logger.warn({ jobId: job.id }, 'Invalid cache invalidation payload — missing tenantId or eventType');
          return;
        }
        this.deps.cacheInvalidator.recordEvent(eventType, tenantId, {
          severity: job.data.severity,
        });
      },
      {
        connection: redisOpts,
        prefix: 'etip',
        concurrency: this.deps.concurrency ?? 10,
      },
    );

    this.worker.on('completed', (job) => {
      logger.debug({ jobId: job.id }, 'Cache invalidation event processed');
    });

    this.worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err: err.message }, 'Cache invalidation event failed');
    });

    logger.info({ queue: QUEUES.CACHE_INVALIDATE }, 'Event listener worker started');
  }

  /** Stop the worker gracefully. */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      getLogger().info('Event listener worker stopped');
    }
  }

  /** Parse Redis URL to ioredis connection options. */
  private parseRedisUrl(url: string): { host: string; port: number; db?: number } {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      db: parsed.pathname.length > 1 ? parseInt(parsed.pathname.slice(1), 10) : undefined,
    };
  }
}
