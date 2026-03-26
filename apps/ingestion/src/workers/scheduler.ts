import cron from 'node-cron';
import type { Queue } from 'bullmq';
import type pino from 'pino';
import type { FeedRepository } from '../repository.js';
import { mapFeedTypeToQueue } from '../queue.js';
import type { CustomizationClient, FeedQuota } from '../services/customization-client.js';
import { cronToMinutes } from '../cron-utils.js';

// TODO: admin-service queue monitor needs update for per-type queues
// (currently watches single etip-feed-fetch; now there are 4 per-type queues)

export interface SchedulerDeps {
  repo: FeedRepository;
  /** Per-type queue map: queue name -> Queue instance */
  queues: Map<string, Queue>;
  logger: pino.Logger;
  /** Optional: customization client for plan-based schedule clamping */
  customizationClient?: CustomizationClient;
}

interface ScheduledFeed {
  id: string;
  tenantId: string;
  schedule: string;
  feedType: string;
}

const SYNC_INTERVAL_CRON = '*/5 * * * *'; // Re-sync active feeds every 5 minutes

/** Retry state per feed */
interface FeedRetryState {
  failCount: number;
  lastFailAt: number;
}

/** Circuit breaker state for customization-client */
interface CircuitBreakerState {
  failures: number;
  firstFailAt: number;
  openUntil: number;       // timestamp when circuit closes again
}

export const BACKOFF_BASE_MS = 30_000;       // 30s initial delay
export const BACKOFF_CAP_MS = 300_000;       // 5 min max delay
export const CB_THRESHOLD = 3;              // 3 failures to trip
export const CB_WINDOW_MS = 5 * 60 * 1000;  // 5 min failure window
export const CB_OPEN_MS = 5 * 60 * 1000;    // 5 min open duration

export class FeedScheduler {
  private readonly jobs = new Map<string, cron.ScheduledTask>();
  private syncTask: cron.ScheduledTask | null = null;
  private running = false;

  /** Per-feed retry tracking */
  readonly retryState = new Map<string, FeedRetryState>();

  /** Circuit breaker for customization-client quota fetches */
  readonly circuitBreaker: CircuitBreakerState = {
    failures: 0,
    firstFailAt: 0,
    openUntil: 0,
  };

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

    // Fetch per-tenant quotas for schedule clamping (with circuit breaker)
    const tenantQuotas = new Map<string, FeedQuota>();
    if (this.deps.customizationClient) {
      const now = Date.now();
      const cb = this.circuitBreaker;

      if (cb.openUntil > now) {
        // Circuit is open — skip quota fetches entirely, use defaults
        this.deps.logger.debug('Circuit breaker open for customization-client, skipping quota fetch');
      } else {
        const tenantIds = [...new Set(activeFeeds.map((f) => f.tenantId))];
        for (const tid of tenantIds) {
          try {
            tenantQuotas.set(tid, await this.deps.customizationClient.getFeedQuota(tid));
            // Success — reset circuit breaker
            cb.failures = 0;
            cb.firstFailAt = 0;
          } catch (err) {
            this.deps.logger.warn(
              { tenantId: tid, error: (err as Error).message },
              'Quota fetch failed, using defaults',
            );
            // Track circuit breaker failures
            if (cb.failures === 0 || now - cb.firstFailAt > CB_WINDOW_MS) {
              cb.failures = 1;
              cb.firstFailAt = now;
            } else {
              cb.failures += 1;
            }
            if (cb.failures >= CB_THRESHOLD) {
              cb.openUntil = now + CB_OPEN_MS;
              this.deps.logger.warn('Circuit breaker open for customization-client');
            }
          }
        }
      }
    }

    // Add or update jobs for active feeds
    for (const feed of activeFeeds) {
      const existing = this.jobs.get(feed.id);

      if (existing) {
        // Already scheduled -- skip (schedule changes picked up on next sync via re-register)
        continue;
      }

      // Clamp schedule to plan minimum if needed
      let effectiveSchedule = feed.schedule;
      const quota = tenantQuotas.get(feed.tenantId);
      if (quota) {
        const feedMins = cronToMinutes(feed.schedule);
        const planMins = cronToMinutes(quota.minFetchInterval);
        if (feedMins > 0 && planMins > 0 && feedMins < planMins) {
          this.deps.logger.info(
            { feedId: feed.id, original: feed.schedule, clamped: quota.minFetchInterval, plan: quota.planId },
            `Feed schedule clamped: ${feed.schedule} → ${quota.minFetchInterval} (${quota.displayName} plan limit)`,
          );
          effectiveSchedule = quota.minFetchInterval;
        }
      }

      if (!cron.validate(effectiveSchedule)) {
        this.deps.logger.warn({ feedId: feed.id, schedule: effectiveSchedule }, 'Invalid cron expression -- skipping');
        continue;
      }

      const task = cron.schedule(effectiveSchedule, () => {
        this.enqueueFetch(feed.id, feed.tenantId, feed.feedType).catch((err) => {
          this.deps.logger.error({ feedId: feed.id, error: (err as Error).message }, 'Failed to enqueue feed fetch');
        });
      });

      this.jobs.set(feed.id, task);
      this.deps.logger.info({ feedId: feed.id, schedule: effectiveSchedule }, 'Cron job registered');
    }

    this.deps.logger.info({ activeFeeds: activeFeeds.length, scheduledJobs: this.jobs.size }, 'Feed sync completed');
  }

  private async enqueueFetch(feedId: string, tenantId: string, feedType: string): Promise<void> {
    // Check backoff — skip if feed is in retry delay window
    const retry = this.retryState.get(feedId);
    if (retry && retry.failCount > 0) {
      const delay = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, retry.failCount - 1));
      const elapsed = Date.now() - retry.lastFailAt;
      if (elapsed < delay) {
        this.deps.logger.debug(
          { feedId, failCount: retry.failCount, delayMs: delay, elapsedMs: elapsed },
          'Feed in backoff window, skipping enqueue',
        );
        return;
      }
    }

    const queueName = mapFeedTypeToQueue(feedType);
    const queue = this.deps.queues.get(queueName);
    if (!queue) {
      this.deps.logger.error({ feedId, feedType, queueName }, 'No queue found for feed type');
      return;
    }

    try {
      await queue.add(
        queueName,
        { feedId, tenantId, triggeredBy: 'schedule' },
        { jobId: `sched-${feedId}-${Date.now()}` },
      );
      // Success — reset retry state
      this.retryState.delete(feedId);
      this.deps.logger.debug({ feedId, tenantId, feedType, queueName }, 'Scheduled feed fetch enqueued to per-type queue');
    } catch (err) {
      // Track failure for backoff
      const state = this.retryState.get(feedId) ?? { failCount: 0, lastFailAt: 0 };
      state.failCount += 1;
      state.lastFailAt = Date.now();
      this.retryState.set(feedId, state);
      const delay = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, state.failCount - 1));
      this.deps.logger.warn(
        { feedId, failCount: state.failCount, nextRetryMs: delay, error: (err as Error).message },
        'Feed enqueue failed, applying exponential backoff',
      );
      throw err;
    }
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
