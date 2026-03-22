/**
 * Redis Enrichment Cache — Type-specific TTLs for enrichment results (#6).
 * Reduces VT/AbuseIPDB API calls by 60-80% for repeated IOCs.
 * Cache key: enrichment:{iocType}:{normalizedValue}
 * Disabled gracefully when Redis is unavailable.
 */

import type { Redis } from 'ioredis';
import type pino from 'pino';
import type { EnrichmentResult } from './schema.js';

/** TTLs in seconds per IOC type (from skill 06 spec) */
export const CACHE_TTLS: Record<string, number> = {
  hash_md5: 7 * 86400,     // 7 days
  hash_sha1: 7 * 86400,
  hash_sha256: 7 * 86400,
  hash_sha512: 7 * 86400,
  domain: 24 * 3600,       // 24 hours
  fqdn: 24 * 3600,
  ip: 3600,                // 1 hour
  ipv6: 3600,
  url: 12 * 3600,          // 12 hours
  cve: 12 * 3600,          // 12 hours
  email: 24 * 3600,
};

const DEFAULT_TTL = 3600; // 1 hour fallback
const KEY_PREFIX = 'enrichment:';

export class EnrichmentCache {
  private available = true;

  constructor(
    private readonly redis: Redis | null,
    private readonly logger: pino.Logger,
    private readonly ttlOverrides?: Partial<Record<string, number>>,
  ) {
    if (!redis) {
      this.available = false;
      this.logger.info('Enrichment cache disabled — no Redis connection');
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  private buildKey(iocType: string, normalizedValue: string): string {
    return `${KEY_PREFIX}${iocType}:${normalizedValue}`;
  }

  private getTtl(iocType: string): number {
    return this.ttlOverrides?.[iocType] ?? CACHE_TTLS[iocType] ?? DEFAULT_TTL;
  }

  /** Get cached enrichment result. Returns null on miss or error. */
  async get(iocType: string, normalizedValue: string): Promise<EnrichmentResult | null> {
    if (!this.available || !this.redis) return null;

    try {
      const key = this.buildKey(iocType, normalizedValue);
      const raw = await this.redis.get(key);
      if (!raw) return null;

      this.logger.debug({ iocType, normalizedValue }, 'Cache hit');
      return JSON.parse(raw) as EnrichmentResult;
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'Cache get failed — treating as miss');
      return null;
    }
  }

  /** Store enrichment result with type-specific TTL. */
  async set(iocType: string, normalizedValue: string, result: EnrichmentResult): Promise<void> {
    if (!this.available || !this.redis) return;

    try {
      const key = this.buildKey(iocType, normalizedValue);
      const ttl = this.getTtl(iocType);
      await this.redis.setex(key, ttl, JSON.stringify(result));
      this.logger.debug({ iocType, normalizedValue, ttl }, 'Cache set');
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'Cache set failed — continuing without cache');
    }
  }

  /** Invalidate a specific IOC cache entry. */
  async invalidate(iocType: string, normalizedValue: string): Promise<void> {
    if (!this.available || !this.redis) return;

    try {
      const key = this.buildKey(iocType, normalizedValue);
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn({ error: (err as Error).message }, 'Cache invalidate failed');
    }
  }
}
