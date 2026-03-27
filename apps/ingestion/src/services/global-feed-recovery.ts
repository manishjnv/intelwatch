/**
 * @module services/global-feed-recovery
 * @description Recovers stale feeds, stuck articles, and unenriched IOCs.
 * Runs on a 6-hour cron, gated by TI_GLOBAL_PROCESSING_ENABLED.
 */
import type { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h before re-enabling a failed feed
const STUCK_THRESHOLD_MS = 60 * 60 * 1000; // 1h = stuck
const MAX_REENQUEUE = 500; // cap per run to avoid queue flood
const CRON_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

export interface RecoveryResult {
  staleFeeds: { recovered: number; stillBroken: number };
  stuckArticles: { recovered: number };
  unenrichedIocs: { enqueued: number };
}

export class GlobalFeedRecovery {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly enrichQueue?: Queue,
    private readonly logger?: { info: (...args: unknown[]) => void },
  ) {}

  async recoverStaleFeeds(): Promise<{ recovered: number; stillBroken: number }> {
    const cutoff = new Date(Date.now() - COOLDOWN_MS);
    const brokenFeeds = await this.prisma.globalFeedCatalog.findMany({
      where: { enabled: false, consecutiveFailures: { gte: 5 } },
    });

    let recovered = 0;
    let stillBroken = 0;

    for (const feed of brokenFeeds) {
      const lastFetch = feed.lastFetchAt;
      if (lastFetch && lastFetch < cutoff) {
        await this.prisma.globalFeedCatalog.update({
          where: { id: feed.id },
          data: { enabled: true, consecutiveFailures: 0 },
        });
        this.logger?.info(`Feed recovery: re-enabled ${feed.name} after 24h cooldown`);
        recovered++;
      } else {
        stillBroken++;
      }
    }

    return { recovered, stillBroken };
  }

  async recoverStuckArticles(): Promise<{ recovered: number }> {
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
    const result = await this.prisma.globalArticle.updateMany({
      where: { pipelineStatus: 'normalizing', createdAt: { lt: cutoff } },
      data: { pipelineStatus: 'pending' },
    });
    if (result.count > 0) {
      this.logger?.info(`Article recovery: reset ${result.count} stuck articles`);
    }
    return { recovered: result.count };
  }

  async recoverUnenrichedIocs(): Promise<{ enqueued: number }> {
    if (!this.enrichQueue) return { enqueued: 0 };

    const cutoff = new Date(Date.now() - COOLDOWN_MS);
    const staleIocs = await this.prisma.globalIoc.findMany({
      where: { enrichedAt: null, createdAt: { lt: cutoff } },
      select: { id: true },
      take: MAX_REENQUEUE,
    });

    for (const ioc of staleIocs) {
      await this.enrichQueue.add(QUEUES.ENRICH_GLOBAL, { globalIocId: ioc.id }, { priority: 10 });
    }

    if (staleIocs.length > 0) {
      this.logger?.info(`IOC recovery: enqueued ${staleIocs.length} unenriched IOCs`);
    }
    return { enqueued: staleIocs.length };
  }

  async runAll(): Promise<RecoveryResult> {
    const [staleFeeds, stuckArticles, unenrichedIocs] = await Promise.all([
      this.recoverStaleFeeds(),
      this.recoverStuckArticles(),
      this.recoverUnenrichedIocs(),
    ]);
    return { staleFeeds, stuckArticles, unenrichedIocs };
  }

  startRecoveryCron(): void {
    if (process.env.TI_GLOBAL_PROCESSING_ENABLED !== 'true') return;
    this.timer = setInterval(() => void this.runAll(), CRON_INTERVAL_MS);
    this.logger?.info('Global feed recovery cron started (every 6h)');
  }

  stopRecoveryCron(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
