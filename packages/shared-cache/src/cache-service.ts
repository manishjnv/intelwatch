import type Redis from 'ioredis';
import { CACHE_PREFIX } from './cache-ttl.js';

export interface CacheSetOptions { ttl?: number; }

export class CacheService {
  constructor(private readonly redis: Redis) {}

  buildKey(tenantId: string, resource: string): string { return `${CACHE_PREFIX}:${tenantId}:${resource}`; }
  buildGlobalKey(resource: string): string { return `${CACHE_PREFIX}:${resource}`; }

  async get<T>(tenantId: string, resource: string): Promise<T | null> { return this.getRaw<T>(this.buildKey(tenantId, resource)); }

  async getRaw<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    try { return JSON.parse(raw) as T; } catch { return raw as unknown as T; }
  }

  async set<T>(tenantId: string, resource: string, value: T, options?: CacheSetOptions): Promise<void> {
    await this.setRaw(this.buildKey(tenantId, resource), value, options);
  }

  async setRaw<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const s = JSON.stringify(value);
    if (options?.ttl && options.ttl > 0) { await this.redis.setex(key, options.ttl, s); } else { await this.redis.set(key, s); }
  }

  async getOrSet<T>(tenantId: string, resource: string, ttl: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(tenantId, resource);
    if (cached !== null) return cached;
    const fresh = await factory();
    await this.set(tenantId, resource, fresh, { ttl });
    return fresh;
  }

  async invalidate(tenantId: string, resource: string): Promise<number> { return this.redis.del(this.buildKey(tenantId, resource)); }

  async invalidateTenant(tenantId: string): Promise<number> {
    const pattern = `${CACHE_PREFIX}:${tenantId}:*`;
    let cursor = '0'; let total = 0;
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) total += await this.redis.del(...keys);
    } while (cursor !== '0');
    return total;
  }

  async invalidateRaw(key: string): Promise<number> { return this.redis.del(key); }
  async exists(tenantId: string, resource: string): Promise<boolean> { return (await this.redis.exists(this.buildKey(tenantId, resource))) === 1; }
  async ttl(tenantId: string, resource: string): Promise<number> { return this.redis.ttl(this.buildKey(tenantId, resource)); }
  async ping(): Promise<string> { return this.redis.ping(); }
}
