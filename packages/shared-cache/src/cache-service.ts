/**
 * @module @etip/shared-cache/cache-service
 * @description Type-safe cache service wrapping Redis with tenant-aware
 * key building, TTL management, and cache-aside (getOrSet) pattern.
 */
import type Redis from 'ioredis';
import { CACHE_PREFIX } from './cache-ttl.js';

/** Options for cache set operations */
export interface CacheSetOptions {
  /** TTL in seconds. If omitted, key never expires. */
  ttl?: number;
}

/**
 * CacheService provides type-safe caching with tenant namespacing.
 *
 * All keys are namespaced: `etip:{tenantId}:{resource}:{id}`
 * This ensures complete tenant isolation at the cache level.
 *
 * @example
 * ```typescript
 * const cache = new CacheService(redisClient);
 *
 * // Simple get/set
 * await cache.set('tenant-1', 'dashboard:widgets', data, { ttl: 3600 });
 * const widgets = await cache.get<DashboardData>('tenant-1', 'dashboard:widgets');
 *
 * // Cache-aside pattern
 * const result = await cache.getOrSet('tenant-1', 'ioc:8.8.8.8', 3600, async () => {
 *   return await fetchFromDatabase('8.8.8.8');
 * });
 *
 * // Invalidation
 * await cache.invalidate('tenant-1', 'dashboard:widgets');
 * await cache.invalidateTenant('tenant-1'); // flush all tenant keys
 * ```
 */
export class CacheService {
  constructor(private readonly redis: Redis) {}

  /**
   * Build a namespaced cache key.
   *
   * @param tenantId - Tenant identifier
   * @param resource - Resource path (e.g., 'dashboard:widgets', 'ioc:8.8.8.8')
   * @returns Full cache key string
   */
  buildKey(tenantId: string, resource: string): string {
    return `${CACHE_PREFIX}:${tenantId}:${resource}`;
  }

  /**
   * Build a global (non-tenant) cache key.
   *
   * @param resource - Resource path (e.g., 'session:abc-123')
   * @returns Full cache key string
   */
  buildGlobalKey(resource: string): string {
    return `${CACHE_PREFIX}:${resource}`;
  }

  /**
   * Retrieve a cached value. Returns null if key doesn't exist or is expired.
   *
   * @param tenantId - Tenant identifier
   * @param resource - Resource path
   * @returns Parsed value or null
   */
  async get<T>(tenantId: string, resource: string): Promise<T | null> {
    const key = this.buildKey(tenantId, resource);
    return this.getRaw<T>(key);
  }

  /**
   * Retrieve a cached value by full key (for global/session keys).
   *
   * @param key - Full cache key
   * @returns Parsed value or null
   */
  async getRaw<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  /**
   * Store a value in the cache with optional TTL.
   *
   * @param tenantId - Tenant identifier
   * @param resource - Resource path
   * @param value - Value to cache (will be JSON-serialized)
   * @param options - Cache options (ttl in seconds)
   */
  async set<T>(
    tenantId: string,
    resource: string,
    value: T,
    options?: CacheSetOptions
  ): Promise<void> {
    const key = this.buildKey(tenantId, resource);
    await this.setRaw(key, value, options);
  }

  /**
   * Store a value by full key (for global/session keys).
   *
   * @param key - Full cache key
   * @param value - Value to cache
   * @param options - Cache options (ttl in seconds)
   */
  async setRaw<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const serialized = JSON.stringify(value);
    if (options?.ttl && options.ttl > 0) {
      await this.redis.setex(key, options.ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  /**
   * Cache-aside pattern: get from cache, or compute + store if missing.
   *
   * @param tenantId - Tenant identifier
   * @param resource - Resource path
   * @param ttl - TTL in seconds for the cached value
   * @param factory - Async function to compute the value if cache miss
   * @returns Cached or freshly computed value
   */
  async getOrSet<T>(
    tenantId: string,
    resource: string,
    ttl: number,
    factory: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(tenantId, resource);
    if (cached !== null) return cached;

    const fresh = await factory();
    await this.set(tenantId, resource, fresh, { ttl });
    return fresh;
  }

  /**
   * Delete a single cache key.
   *
   * @param tenantId - Tenant identifier
   * @param resource - Resource path
   * @returns Number of keys deleted (0 or 1)
   */
  async invalidate(tenantId: string, resource: string): Promise<number> {
    const key = this.buildKey(tenantId, resource);
    return this.redis.del(key);
  }

  /**
   * Delete ALL cached keys for a tenant using SCAN (non-blocking).
   * Uses SCAN to avoid blocking Redis with KEYS command in production.
   *
   * @param tenantId - Tenant identifier
   * @returns Total number of keys deleted
   */
  async invalidateTenant(tenantId: string): Promise<number> {
    const pattern = `${CACHE_PREFIX}:${tenantId}:*`;
    let cursor = '0';
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH', pattern,
        'COUNT', 100
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        const deleted = await this.redis.del(...keys);
        totalDeleted += deleted;
      }
    } while (cursor !== '0');

    return totalDeleted;
  }

  /**
   * Delete a cache entry by full key.
   *
   * @param key - Full cache key
   * @returns Number of keys deleted
   */
  async invalidateRaw(key: string): Promise<number> {
    return this.redis.del(key);
  }

  /**
   * Check if a cache key exists.
   *
   * @param tenantId - Tenant identifier
   * @param resource - Resource path
   * @returns true if key exists
   */
  async exists(tenantId: string, resource: string): Promise<boolean> {
    const key = this.buildKey(tenantId, resource);
    const result = await this.redis.exists(key);
    return result === 1;
  }

  /**
   * Get remaining TTL for a key in seconds.
   *
   * @param tenantId - Tenant identifier
   * @param resource - Resource path
   * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(tenantId: string, resource: string): Promise<number> {
    const key = this.buildKey(tenantId, resource);
    return this.redis.ttl(key);
  }

  /**
   * Ping Redis to check connectivity.
   *
   * @returns 'PONG' if connected
   */
  async ping(): Promise<string> {
    return this.redis.ping();
  }
}
