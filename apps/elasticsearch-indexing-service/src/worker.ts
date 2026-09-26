import { Worker, Queue } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';
import type { IocIndexer } from './ioc-indexer.js';
import { IocIndexJobSchema } from './schemas.js';
import { getLogger } from './logger.js';

/**
 * BullMQ worker that consumes IOC index jobs from the etip-ioc-indexed queue.
 *
 * Job payload shape: { iocId, tenantId, action: 'index'|'update'|'delete', payload? }
 */
export class IocIndexWorker {
  private worker: Worker;
  private queue: Queue;

  constructor(
    redisUrl: string,
    private readonly indexer: IocIndexer,
  ) {
    const connection = parseRedisUrl(redisUrl);

    this.queue = new Queue(QUEUES.IOC_INDEX, { connection });

    this.worker = new Worker(
      QUEUES.IOC_INDEX,
      async (job) => {
        await this.processJob(job.data);
      },
      {
        connection,
        concurrency: 5,
      },
    );

    this.worker.on('failed', (job, err) => {
      getLogger().error({ jobId: job?.id, err }, 'IOC index job failed');
    });

    this.worker.on('error', (err) => {
      getLogger().error({ err }, 'IOC index worker error');
    });
  }

  /** Process a single IOC index job. Invalid/unknown jobs are logged and dropped (job completes). */
  private async processJob(data: unknown): Promise<void> {
    const parsed = IocIndexJobSchema.safeParse(data);
    if (!parsed.success) {
      const jobId = (data as { iocId?: unknown } | null)?.iocId;
      getLogger().warn({ jobId, issues: parsed.error.issues }, 'Invalid IOC index job payload — dropping');
      return;
    }

    // Index name comes from the job's tenantId; a payload claiming another tenant/IOC is a producer bug.
    const p = 'payload' in parsed.data ? parsed.data.payload : undefined;
    if ((p?.tenantId !== undefined && p.tenantId !== parsed.data.tenantId) ||
        (p?.iocId !== undefined && p.iocId !== parsed.data.iocId)) {
      getLogger().warn({ jobId: parsed.data.iocId }, 'IOC index job payload tenantId/iocId mismatch — dropping');
      return;
    }

    switch (parsed.data.action) {
      case 'index': {
        const { iocId, tenantId, payload } = parsed.data;
        await this.indexer.indexIOC(tenantId, iocId, payload);
        break;
      }
      case 'update': {
        const { iocId, tenantId, payload, iocType } = parsed.data;
        await this.indexer.updateIOC(tenantId, iocId, payload, iocType);
        break;
      }
      case 'delete': {
        const { iocId, tenantId } = parsed.data;
        await this.indexer.deleteIOC(tenantId, iocId);
        break;
      }
    }
  }

  /** Returns the total number of pending + active jobs in the queue. */
  async getQueueDepth(): Promise<number> {
    const [waiting, active, delayed] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
      this.queue.getDelayed(),
    ]);
    return waiting.length + active.length + delayed.length;
  }

  /** Gracefully shut down the worker and queue connection. */
  async stop(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

/** Parse a Redis URL string into BullMQ connection options. */
function parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password || undefined,
      db: u.pathname && u.pathname !== '/' ? parseInt(u.pathname.slice(1), 10) : undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}
