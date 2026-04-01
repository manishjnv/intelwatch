/**
 * @module bloom
 * @description Per-tenant Bloom filter manager for IOC deduplication.
 * Manages one Bloom filter per tenant + a global filter.
 * Provides warm-up from PostgreSQL, auto-rebuild, and metrics.
 */
import {
  createBloomFilter,
  type BloomFilter,
  type BloomFilterStats,
  type BloomRedisClient,
} from '@etip/shared-utils';
import type pino from 'pino';

// ── Metrics ────────────────────────────────────────────────────────

export interface BloomMetrics {
  checkTotal: number;
  hitTotal: number;
  missTotal: number;
  falsePositiveTotal: number;
}

const metrics: BloomMetrics = { checkTotal: 0, hitTotal: 0, missTotal: 0, falsePositiveTotal: 0 };

/** Get current bloom filter metrics (for admin/monitoring) */
export function getBloomMetrics(): BloomMetrics {
  return { ...metrics };
}

/** Reset metrics (for testing) */
export function resetBloomMetrics(): void {
  metrics.checkTotal = 0;
  metrics.hitTotal = 0;
  metrics.missTotal = 0;
  metrics.falsePositiveTotal = 0;
}

// ── Per-Tenant Bloom Manager ───────────────────────────────────────

/** Default: 1M items per tenant, 0.1% FP rate (~1.44MB in Redis) */
const DEFAULT_EXPECTED_ITEMS = 1_000_000;
const DEFAULT_FP_RATE = 0.0001;

/** Threshold at which we log a warning (90% of expected capacity) */
const CAPACITY_WARNING_RATIO = 0.9;

/** Threshold FP rate that triggers auto-rebuild suggestion */
const FP_REBUILD_THRESHOLD = 0.01;

/** How often to log periodic stats (every N checks) */
const STATS_LOG_INTERVAL = 1000;

export interface BloomManagerOptions {
  redis: BloomRedisClient;
  logger: pino.Logger;
  expectedItems?: number;
  falsePositiveRate?: number;
}

export interface BloomCheckResult {
  /** true = probably exists (bloom hit), false = definitely new */
  probablyExists: boolean;
  /** Whether this was a false positive (only known after DB upsert) */
  wasFalsePositive?: boolean;
}

/**
 * Manages per-tenant and global Bloom filters for IOC deduplication.
 * Thread-safe for concurrent normalization workers (Redis-backed).
 */
export class BloomManager {
  private readonly filters = new Map<string, BloomFilter>();
  private readonly redis: BloomRedisClient;
  private readonly logger: pino.Logger;
  private readonly expectedItems: number;
  private readonly falsePositiveRate: number;

  constructor(opts: BloomManagerOptions) {
    this.redis = opts.redis;
    this.logger = opts.logger;
    this.expectedItems = opts.expectedItems ?? DEFAULT_EXPECTED_ITEMS;
    this.falsePositiveRate = opts.falsePositiveRate ?? DEFAULT_FP_RATE;
  }

  /** Get or create a Bloom filter for the given tenant */
  private getFilter(tenantId: string): BloomFilter {
    let filter = this.filters.get(tenantId);
    if (!filter) {
      filter = createBloomFilter({
        redis: this.redis,
        name: `iocs:${tenantId}`,
        expectedItems: this.expectedItems,
        falsePositiveRate: this.falsePositiveRate,
      });
      this.filters.set(tenantId, filter);
    }
    return filter;
  }

  /**
   * Check if an IOC dedupe hash probably exists in the Bloom filter.
   * Returns true if the hash is probably already known (bloom hit).
   */
  async check(tenantId: string, dedupeHash: string): Promise<boolean> {
    const filter = this.getFilter(tenantId);
    const result = await filter.mightContain(dedupeHash);
    metrics.checkTotal++;
    if (result) {
      metrics.hitTotal++;
    } else {
      metrics.missTotal++;
    }
    // Periodic stats logging
    if (metrics.checkTotal % STATS_LOG_INTERVAL === 0) {
      this.logger.info(
        { bloomMetrics: getBloomMetrics() },
        'Bloom filter periodic stats',
      );
    }
    return result;
  }

  /**
   * Add an IOC dedupe hash to the Bloom filter (after successful DB upsert).
   */
  async add(tenantId: string, dedupeHash: string): Promise<void> {
    const filter = this.getFilter(tenantId);
    await filter.add(dedupeHash);
  }

  /**
   * Record a false positive: bloom said "probably exists" but DB said new.
   * Used to track accuracy and decide when to rebuild.
   */
  recordFalsePositive(): void {
    metrics.falsePositiveTotal++;
  }

  /**
   * Warm up the Bloom filter for a tenant from existing DB hashes.
   * Loads all dedupeHash values and batch-adds them to the filter.
   * Call on service boot or via admin endpoint.
   */
  async warmUp(
    tenantId: string,
    fetchHashes: (tenantId: string, skip: number, take: number) => Promise<string[]>,
  ): Promise<{ loaded: number; elapsed: number }> {
    const start = Date.now();
    const filter = this.getFilter(tenantId);
    let loaded = 0;
    const BATCH = 1000;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const hashes = await fetchHashes(tenantId, skip, BATCH);
      if (hashes.length === 0) { hasMore = false; break; }
      await filter.addBatch(hashes);
      loaded += hashes.length;
      skip += BATCH;

      if (loaded % 10_000 === 0) {
        this.logger.info({ tenantId, loaded }, 'Bloom warm-up progress');
      }
    }

    const elapsed = Date.now() - start;
    this.logger.info({ tenantId, loaded, elapsedMs: elapsed }, 'Bloom filter warm-up complete');
    return { loaded, elapsed };
  }

  /**
   * Reset and rebuild a tenant's Bloom filter from DB.
   * Use when FP rate exceeds threshold or after capacity warning.
   */
  async rebuild(
    tenantId: string,
    fetchHashes: (tenantId: string, skip: number, take: number) => Promise<string[]>,
  ): Promise<{ loaded: number; elapsed: number }> {
    const filter = this.getFilter(tenantId);
    await filter.reset();
    this.filters.delete(tenantId); // Force fresh filter creation
    return this.warmUp(tenantId, fetchHashes);
  }

  /** Get stats for a tenant's Bloom filter */
  async getStats(tenantId: string): Promise<BloomFilterStats & { metrics: BloomMetrics; needsRebuild: boolean }> {
    const filter = this.getFilter(tenantId);
    const stats = await filter.stats();
    const needsRebuild =
      stats.expectedFP > FP_REBUILD_THRESHOLD ||
      stats.itemCount > this.expectedItems * CAPACITY_WARNING_RATIO;

    if (needsRebuild) {
      this.logger.warn(
        { tenantId, expectedFP: stats.expectedFP, itemCount: stats.itemCount, capacity: this.expectedItems },
        'Bloom filter approaching capacity or FP threshold — consider rebuild',
      );
    }

    return { ...stats, metrics: getBloomMetrics(), needsRebuild };
  }
}
