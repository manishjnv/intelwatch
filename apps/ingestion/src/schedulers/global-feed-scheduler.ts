/**
 * @module GlobalFeedScheduler
 * @description Cron-based scheduler for global feed processing (DECISION-029 Phase B1).
 * Every 5 minutes, checks all enabled GlobalFeedCatalog entries and enqueues
 * fetch jobs to the appropriate FEED_FETCH_GLOBAL_* queues.
 *
 * Gated by TI_GLOBAL_PROCESSING_ENABLED env var.
 */
import type { Queue } from 'bullmq';
import type pino from 'pino';
import type { PrismaClient } from '@prisma/client';
import { QUEUES } from '@etip/shared-utils';

export interface GlobalSchedulerDeps {
  db: PrismaClient;
  queues: Record<string, Queue>;
  logger: pino.Logger;
}

/** Map feed type to the global queue name */
const FEED_TYPE_TO_QUEUE: Record<string, string> = {
  rss: QUEUES.FEED_FETCH_GLOBAL_RSS,
  nvd: QUEUES.FEED_FETCH_GLOBAL_NVD,
  stix: QUEUES.FEED_FETCH_GLOBAL_STIX,
  taxii: QUEUES.FEED_FETCH_GLOBAL_STIX,
  rest: QUEUES.FEED_FETCH_GLOBAL_REST,
  rest_api: QUEUES.FEED_FETCH_GLOBAL_REST,
  misp: QUEUES.FEED_FETCH_GLOBAL_REST,
};

const TICK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class GlobalFeedScheduler {
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(private readonly deps: GlobalSchedulerDeps) {}

  start(): void {
    const enabled = process.env.TI_GLOBAL_PROCESSING_ENABLED === 'true';
    if (!enabled) {
      this.deps.logger.info('Global feed scheduler: DISABLED (TI_GLOBAL_PROCESSING_ENABLED != true)');
      return;
    }

    this.running = true;

    // Immediate first tick
    this.tick().catch((err) => {
      this.deps.logger.error({ error: (err as Error).message }, 'Global scheduler initial tick failed');
    });

    this.interval = setInterval(() => {
      this.tick().catch((err) => {
        this.deps.logger.error({ error: (err as Error).message }, 'Global scheduler tick failed');
      });
    }, TICK_INTERVAL_MS);

    this.deps.logger.info('Global feed scheduler: ENABLED — ticking every 5 minutes');
  }

  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.deps.logger.info('Global feed scheduler stopped');
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Check if a feed is due for fetching based on schedule and lastFetchAt */
  isDue(schedule: string, lastFetchAt: Date | null): boolean {
    if (!lastFetchAt) return true; // First fetch

    // Parse simple cron intervals: */N * * * * → every N minutes
    const match = schedule.match(/^\*\/(\d+)\s/);
    if (match && match[1]) {
      const intervalMs = parseInt(match[1], 10) * 60 * 1000;
      return Date.now() - lastFetchAt.getTime() >= intervalMs;
    }

    // For complex cron expressions, use a simple 30-minute default check
    const defaultIntervalMs = 30 * 60 * 1000;
    return Date.now() - lastFetchAt.getTime() >= defaultIntervalMs;
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    const entries = await this.deps.db.globalFeedCatalog.findMany({
      where: { enabled: true },
      select: { id: true, feedType: true, schedule: true, lastFetchAt: true },
    });

    let enqueued = 0;

    for (const entry of entries) {
      if (!this.isDue(entry.schedule, entry.lastFetchAt)) continue;

      const queueName = FEED_TYPE_TO_QUEUE[entry.feedType] ?? QUEUES.FEED_FETCH_GLOBAL_RSS;
      const queue = this.deps.queues[queueName];
      if (!queue) {
        this.deps.logger.warn({ feedType: entry.feedType, queueName }, 'No queue found for global feed type');
        continue;
      }

      try {
        await queue.add(`global-fetch-${entry.id}`, { globalFeedId: entry.id }, {
          jobId: `global-sched-${entry.id}-${Date.now()}`,
        });
        enqueued++;
      } catch (err) {
        this.deps.logger.error(
          { globalFeedId: entry.id, error: (err as Error).message },
          'Failed to enqueue global feed fetch',
        );
      }
    }

    this.deps.logger.info({ totalFeeds: entries.length, enqueued }, 'Global scheduler: tick completed');
  }
}
