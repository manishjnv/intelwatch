import { Worker, Queue, type Job } from 'bullmq';
import { getLogger } from '../logger.js';
import type { IntegrationStore } from './integration-store.js';
import type { SiemAdapter } from './siem-adapter.js';
import type { WebhookService } from './webhook-service.js';
import type { TriggerEvent } from '../schemas/integration.js';

/** Shape of jobs on the etip:integration-push queue. */
export interface IntegrationPushJob {
  tenantId: string;
  event: TriggerEvent;
  payload: Record<string, unknown>;
}

/**
 * BullMQ worker that consumes the etip:integration-push queue.
 * For each event, finds all enabled integrations matching the trigger
 * and dispatches to the appropriate adapter (SIEM, webhook, or both).
 */
export class EventRouter {
  private worker: Worker | null = null;
  private queue: Queue | null = null;

  constructor(
    private readonly store: IntegrationStore,
    private readonly siemAdapter: SiemAdapter,
    private readonly webhookService: WebhookService,
    private readonly redisUrl: string,
  ) {}

  /** Start the BullMQ worker. */
  start(): void {
    const logger = getLogger();
    const connection = this.parseRedisConnection(this.redisUrl);

    this.queue = new Queue('etip:integration-push', { connection });

    this.worker = new Worker(
      'etip:integration-push',
      async (job: Job<IntegrationPushJob>) => {
        await this.processJob(job);
      },
      {
        connection,
        concurrency: 5,
        limiter: { max: 20, duration: 1000 },
      },
    );

    this.worker.on('completed', (job) => {
      logger.debug({ jobId: job.id }, 'Integration push job completed');
    });

    this.worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, error: err.message }, 'Integration push job failed');
    });

    logger.info('EventRouter worker started on etip:integration-push');
  }

  /** Stop the worker gracefully. */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  /** Enqueue a push job (for programmatic use from routes). */
  async enqueue(job: IntegrationPushJob): Promise<string | undefined> {
    if (!this.queue) return undefined;
    const added = await this.queue.add('push', job, {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    return added.id;
  }

  /** Process a single integration push job. */
  async processJob(job: Job<IntegrationPushJob>): Promise<void> {
    const logger = getLogger();
    const { tenantId, event, payload } = job.data;

    const integrations = this.store.getEnabledForTrigger(tenantId, event);
    if (integrations.length === 0) {
      logger.debug({ tenantId, event }, 'No integrations match this event');
      return;
    }

    logger.info({ tenantId, event, count: integrations.length }, 'Routing event to integrations');

    const results = await Promise.allSettled(
      integrations.map(async (integration) => {
        // SIEM push
        if (integration.siemConfig) {
          await this.siemAdapter.push(
            integration.id, tenantId, integration.siemConfig,
            payload, integration.fieldMappings, event,
          );
        }

        // Webhook push
        if (integration.webhookConfig) {
          await this.webhookService.send(
            integration.id, tenantId, integration.webhookConfig,
            event, payload,
          );
        }
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      logger.warn({ tenantId, event, failed: failed.length }, 'Some integrations failed');
    }
  }

  /** Parse Redis URL into BullMQ connection options. */
  private parseRedisConnection(url: string): { host: string; port: number; password?: string } {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined,
      };
    } catch {
      return { host: 'localhost', port: 6379 };
    }
  }
}
