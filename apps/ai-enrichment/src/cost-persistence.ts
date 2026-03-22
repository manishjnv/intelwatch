/**
 * Cost Persistence (#14) — Periodic Redis flush/reload for cost data.
 * Wraps EnrichmentCostTracker (frozen, DECISION-013) without modifying it.
 * Flushes aggregate stats every 60s; reloads tenant spend on startup.
 */

import type pino from 'pino';
import type { EnrichmentCostTracker, AggregateStats } from './cost-tracker.js';

const REDIS_KEY_STATS = 'etip:enrichment:cost:stats';
const REDIS_KEY_TENANT_PREFIX = 'etip:enrichment:cost:tenant:';
const DEFAULT_FLUSH_INTERVAL_MS = 60_000; // 60 seconds
const STATS_TTL_SECONDS = 86400 * 7;     // 7 days
const TENANT_TTL_SECONDS = 86400;        // 24 hours

/** Periodic cost data persistence layer around in-memory CostTracker */
/** Redis client interface — uses import('ioredis') default type */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RedisClient = any;

export class CostPersistence {
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private baselineStats: AggregateStats | null = null;

  constructor(
    private readonly redis: RedisClient | null,
    private readonly costTracker: EnrichmentCostTracker,
    private readonly logger: pino.Logger,
    private readonly flushIntervalMs: number = DEFAULT_FLUSH_INTERVAL_MS,
  ) {}

  /** Load previous cost stats and tenant spend from Redis on startup */
  async loadFromRedis(): Promise<void> {
    if (!this.redis) return;

    try {
      const raw = await this.redis.get(REDIS_KEY_STATS);
      if (raw) {
        this.baselineStats = JSON.parse(raw);
        this.logger.info(
          { totalCost: this.baselineStats?.totalCostUsd },
          'Cost stats loaded from Redis',
        );
      }

      // Restore tenant spends
      const keys = await this.redis.keys(`${REDIS_KEY_TENANT_PREFIX}*`);
      for (const key of keys) {
        const tenantId = key.replace(REDIS_KEY_TENANT_PREFIX, '');
        const spend = Number(await this.redis.get(key) ?? 0);
        if (spend > 0) {
          this.costTracker.addTenantSpend(tenantId, spend);
        }
      }

      if (keys.length > 0) {
        this.logger.info({ tenantCount: keys.length }, 'Tenant spend restored from Redis');
      }
    } catch (err) {
      this.logger.warn(
        { error: (err as Error).message },
        'Failed to load cost stats from Redis — starting fresh',
      );
    }
  }

  /** Flush current cost stats to Redis */
  async flushToRedis(): Promise<void> {
    if (!this.redis) return;

    try {
      const stats = this.costTracker.getAggregateStats();
      await this.redis.set(REDIS_KEY_STATS, JSON.stringify(stats), 'EX', STATS_TTL_SECONDS);
      this.logger.debug(
        { totalCost: stats.totalCostUsd, iocs: stats.totalIOCsEnriched },
        'Cost stats flushed to Redis',
      );
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'Failed to flush cost stats to Redis');
    }
  }

  /** Persist a tenant's current spend to Redis */
  async flushTenantSpend(tenantId: string): Promise<void> {
    if (!this.redis) return;

    try {
      const spend = this.costTracker.getTenantSpend(tenantId);
      if (spend > 0) {
        await this.redis.set(
          `${REDIS_KEY_TENANT_PREFIX}${tenantId}`,
          String(spend),
          'EX',
          TENANT_TTL_SECONDS,
        );
      }
    } catch (err) {
      this.logger.warn({ error: (err as Error).message, tenantId }, 'Failed to flush tenant spend');
    }
  }

  /** Get the baseline stats loaded from Redis (null if none) */
  getBaselineStats(): AggregateStats | null {
    return this.baselineStats;
  }

  /** Start periodic flush interval */
  startPeriodicFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => void this.flushToRedis(), this.flushIntervalMs);
    this.logger.info({ intervalMs: this.flushIntervalMs }, 'Cost persistence periodic flush started');
  }

  /** Stop periodic flush and do a final flush */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushToRedis();
  }
}
