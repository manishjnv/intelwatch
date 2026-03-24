/**
 * @module services/analytics-store
 * @description In-memory cache for dashboard analytics data.
 * Per DECISION-013: in-memory state for Phase 7 validation.
 */

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

/** Generic in-memory cache with TTL. */
export class AnalyticsStore {
  private cache = new Map<string, CacheEntry<unknown>>();

  /** Get cached value if still fresh. */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  /** Store value with TTL in seconds. */
  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.cache.set(key, { data, cachedAt: Date.now(), ttlMs: ttlSeconds * 1000 });
  }

  /** Get or compute: returns cached value or runs fetcher and caches result. */
  async getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await fetcher();
    this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  /** Invalidate a specific key. */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /** Invalidate all keys matching a prefix. */
  invalidatePrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) { this.cache.delete(key); count++; }
    }
    return count;
  }

  /** Purge all expired entries. */
  purgeExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > entry.ttlMs) { this.cache.delete(key); count++; }
    }
    return count;
  }

  /** Total entries in cache. */
  size(): number { return this.cache.size; }

  /** Clear all cache. */
  clear(): void { this.cache.clear(); }
}
