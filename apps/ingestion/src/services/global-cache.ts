/**
 * @module GlobalCache
 * @description Redis caching layer for global pipeline hot paths.
 * Caches catalog entries, known IOC hashes, warninglists, and stats counters.
 * Reduces Prisma queries at scale (10K+ articles/day).
 * DECISION-029 Phase F.
 */

import type { Redis } from 'ioredis';
import type { WarninglistEntry } from '@etip/shared-normalization';

export interface CatalogEntry {
  id: string;
  name: string;
  feedUrl: string;
  feedType: string;
  feedReliability: number;
  admiraltySource: string;
  admiraltyInfo: string;
  enabled: boolean;
  [key: string]: unknown;
}

export interface GlobalCacheDeps {
  redis: Redis;
  prisma?: { globalFeedCatalog: { findUnique: (args: any) => Promise<any> } };
}

const CATALOG_PREFIX = 'global:catalog:';
const KNOWN_IOCS_KEY = 'global:known-iocs';
const KNOWN_FUZZY_KEY = 'global:known-fuzzy-iocs';
const WARNINGLIST_KEY = 'global:warninglists';
const STATS_PREFIX = 'global:stats:';

const CATALOG_TTL = 600;        // 10 min
const KNOWN_IOC_TTL = 86400;    // 24h
const WARNINGLIST_TTL = 3600;   // 1h
const STATS_TTL = 86400;        // 24h

export class GlobalCache {
  private redis: Redis;
  private prisma?: GlobalCacheDeps['prisma'];

  constructor(deps: GlobalCacheDeps) {
    this.redis = deps.redis;
    this.prisma = deps.prisma;
  }

  // ── Feed Catalog Cache ──────────────────────────────────────

  async getCatalogEntry(feedId: string): Promise<CatalogEntry | null> {
    const key = CATALOG_PREFIX + feedId;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    if (!this.prisma) return null;
    const entry = await this.prisma.globalFeedCatalog.findUnique({ where: { id: feedId } });
    if (!entry) return null;

    await this.redis.set(key, JSON.stringify(entry), 'EX', CATALOG_TTL);
    return entry as CatalogEntry;
  }

  async invalidateCatalogEntry(feedId: string): Promise<void> {
    await this.redis.del(CATALOG_PREFIX + feedId);
  }

  async invalidateAllCatalog(): Promise<void> {
    const keys = await this.redis.keys(CATALOG_PREFIX + '*');
    if (keys.length > 0) await this.redis.del(...keys);
  }

  // ── Known IOC Dedupe Cache ──────────────────────────────────

  async isKnownIoc(dedupeHash: string): Promise<boolean> {
    return (await this.redis.sismember(KNOWN_IOCS_KEY, dedupeHash)) === 1;
  }

  async addKnownIoc(dedupeHash: string): Promise<void> {
    await this.redis.sadd(KNOWN_IOCS_KEY, dedupeHash);
    await this.redis.expire(KNOWN_IOCS_KEY, KNOWN_IOC_TTL);
  }

  // ── Fuzzy Dedupe Cache ──────────────────────────────────────

  async isKnownFuzzyHash(fuzzyHash: string): Promise<boolean> {
    return (await this.redis.sismember(KNOWN_FUZZY_KEY, fuzzyHash)) === 1;
  }

  async addKnownFuzzyHash(fuzzyHash: string): Promise<void> {
    await this.redis.sadd(KNOWN_FUZZY_KEY, fuzzyHash);
    await this.redis.expire(KNOWN_FUZZY_KEY, KNOWN_IOC_TTL);
  }

  // ── Warninglist Cache ───────────────────────────────────────

  async cacheWarninglists(lists: WarninglistEntry[]): Promise<void> {
    await this.redis.set(WARNINGLIST_KEY, JSON.stringify(lists), 'EX', WARNINGLIST_TTL);
  }

  async getCachedWarninglists(): Promise<WarninglistEntry[] | null> {
    const cached = await this.redis.get(WARNINGLIST_KEY);
    return cached ? JSON.parse(cached) : null;
  }

  // ── Stats Counters ──────────────────────────────────────────

  async incrementCounter(key: string, delta = 1): Promise<number> {
    const redisKey = STATS_PREFIX + key;
    const result = await this.redis.incrby(redisKey, delta);
    await this.redis.expire(redisKey, STATS_TTL);
    return result;
  }

  async getCounters(): Promise<Record<string, number>> {
    const keys = await this.redis.keys(STATS_PREFIX + '*');
    if (keys.length === 0) return {};

    const values = await this.redis.mget(...keys);
    const result: Record<string, number> = {};
    for (let i = 0; i < keys.length; i++) {
      const shortKey = keys[i]!.replace(STATS_PREFIX, '');
      result[shortKey] = parseInt(values[i] ?? '0', 10);
    }
    return result;
  }
}
