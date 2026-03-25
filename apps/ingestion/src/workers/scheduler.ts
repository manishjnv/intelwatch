import cron from 'node-cron';
import type { Queue } from 'bullmq';
import type pino from 'pino';
import type { FeedRepository } from '../repository.js';
import { mapFeedTypeToQueue } from '../queue.js';

// TODO: admin-service queue monitor needs update for per-type queues
// (currently watches single etip-feed-fetch; now there are 4 per-type queues)

export interface SchedulerDeps {
  repo: FeedRepository;
  /** Per-type queue map: queue name -> Queue instance */
  queues: Map<string, Queue>;
  logger: pino.Logger;
}

interface ScheduledFeed {
  id: string;
  tenantId: string;
  schedule: string;
  feedType: string;
}

const SYNC_INTERVAL_CRON = '*/5 * * * *'; // Re-sync active feeds every 5 minutes

export class FeedScheduler {
  private readonly jobs = new Map<string, cron.ScheduledTask>();
  private syncTask: cron.ScheduledTask | null = null;
  private running = false;

  constructor(private readonly deps: SchedulerDeps) {}

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.deps.logger.info('Feed scheduler starting');

    // Initial sync -- catch errors so missing DB tables don't crash the service
    try {
      await this.syncFeeds();
    } catch (err) {
      this.deps.logger.warn({ error: (err as Error).message }, 'Initial feed sync failed -- will retry on next interval');
    }

    // Periodic re-sync to pick up new/updated/deleted feeds
    this.syncTask = cron.schedule(SYNC_INTERVAL_CRON, () => {
      this.syncFeeds().catch((err) => {
        this.deps.logger.error({ error: (err as Error).message }, 'Feed sync failed');
      });
    });

    this.deps.logger.info({ syncInterval: SYNC_INTERVAL_CRON }, 'Feed scheduler started');
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.syncTask) {
      this.syncTask.stop();
      this.syncTask = null;
    }

    for (const [feedId, task] of this.jobs) {
      task.stop();
      this.deps.logger.debug({ feedId }, 'Cron job stopped');
    }
    this.jobs.clear();

    this.deps.logger.info('Feed scheduler stopped');
  }

  get activeJobCount(): number {
    return this.jobs.size;
  }

  async syncFeeds(): Promise<void> {
    const activeFeeds = await this.getActiveFeeds();
    const activeFeedIds = new Set(activeFeeds.map((f) => f.id));

    // Remove jobs for feeds that are no longer active
    for (const [feedId, task] of this.jobs) {
      if (!activeFeedIds.has(feedId)) {
        task.stop();
        this.jobs.delete(feedId);
        this.deps.logger.info({ feedId }, 'Cron job removed (feed no longer active)');
      }
    }

    // Add or update jobs for active feeds
    for (const feed of activeFeeds) {
      const existing = this.jobs.get(feed.id);

      if (existing) {
        // Already scheduled -- skip (schedule changes picked up on next sync via re-register)
        continue;
      }

      if (!cron.validate(feed.schedule)) {
        this.deps.logger.warn({ feedId: feed.id, schedule: feed.schedule }, 'Invalid cron expression -- skipping');
        continue;
      }

      const task = cron.schedule(feed.schedule, () => {
        this.enqueueFetch(feed.id, feed.tenantId, feed.feedType).catch((err) => {
          this.deps.logger.error({ feedId: feed.id, error: (err as Error).message }, 'Failed to enqueue feed fetch');
        });
      });

      this.jobs.set(feed.id, task);
      this.deps.logger.info({ feedId: feed.id, schedule: feed.schedule }, 'Cron job registered');
    }

    this.deps.logger.info({ activeFeeds: activeFeeds.length, scheduledJobs: this.jobs.size }, 'Feed sync completed');
  }

  private async enqueueFetch(feedId: string, tenantId: string, feedType: string): Promise<void> {
    const queueName = mapFeedTypeToQueue(feedType);
    const queue = this.deps.queues.get(queueName);
    if (!queue) {
      this.deps.logger.error({ feedId, feedType, queueName }, 'No queue found for feed type');
      return;
    }

    await queue.add(
      queueName,
      { feedId, tenantId, triggeredBy: 'schedule' },
      { jobId: `sched-${feedId}-${Date.now()}` },
    );
    this.deps.logger.debug({ feedId, tenantId, feedType, queueName }, 'Scheduled feed fetch enqueued to per-type queue');
  }

  private async getActiveFeeds(): Promise<ScheduledFeed[]> {
    const feeds = await this.deps.repo.findAllActive();
    return feeds
      .filter((f) => f.schedule != null)
      .map((f) => ({
        id: f.id,
        tenantId: f.tenantId,
        schedule: f.schedule as string,
        feedType: f.feedType,
      }));
  }
}
