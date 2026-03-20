/**
 * @module @etip/shared-cache
 * @description Redis caching layer for ETIP with tenant isolation,
 * TTL management, and cache-aside pattern support.
 *
 * @example
 * ```typescript
 * import { createRedisClient, CacheService, CACHE_TTL } from '@etip/shared-cache';
 *
 * const redis = createRedisClient(process.env.REDIS_URL);
 * const cache = new CacheService(redis);
 *
 * await cache.set('tenant-1', 'dashboard:overview', data, {
 *   ttl: CACHE_TTL.dashboard,
 * });
 * ```
 */

export { createRedisClient, disconnectRedis } from './redis-client.js';
export { CacheService, type CacheSetOptions } from './cache-service.js';
export { CACHE_TTL, CACHE_PREFIX, KEY_PATTERNS } from './cache-ttl.js';
