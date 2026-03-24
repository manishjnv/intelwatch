/**
 * @module services/cache-manager
 * @description Cache management service wrapping shared-cache CacheService
 * with admin operations (INFO, SCAN, namespace stats, warming).
 */
import type { Redis } from 'ioredis';
import type { CacheService } from '@etip/shared-cache';
import { getLogger } from '../logger.js';

/** Redis INFO stats parsed result. */
export interface CacheStats {
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRate: number;
  usedMemoryBytes: number;
  usedMemoryHuman: string;
  totalKeys: number;
  connectedClients: number;
  uptimeSeconds: number;
}

/** Namespace breakdown entry. */
export interface NamespaceEntry {
  namespace: string;
  keyCount: number;
}

/** Key listing result with SCAN cursor. */
export interface KeyListResult {
  keys: string[];
  cursor: string;
  hasMore: boolean;
}

/** Cache warming result. */
export interface WarmResult {
  success: boolean;
  widgetsWarmed: number;
  durationMs: number;
  error?: string;
}

export interface CacheManagerDeps {
  redis: Redis;
  cacheService: CacheService;
}

/**
 * Admin-level cache management operations.
 * Wraps shared-cache CacheService for tenant ops, adds direct ioredis
 * for INFO/SCAN commands not available through the CacheService API.
 */
export class CacheManager {
  private readonly redis: Redis;
  private readonly cacheService: CacheService;

  constructor(deps: CacheManagerDeps) {
    this.redis = deps.redis;
    this.cacheService = deps.cacheService;
  }

  /** Parse Redis INFO output to extract cache statistics. */
  async getStats(): Promise<CacheStats> {
    const [statsInfo, memoryInfo, clientsInfo, serverInfo] = await Promise.all([
      this.redis.info('stats'),
      this.redis.info('memory'),
      this.redis.info('clients'),
      this.redis.info('server'),
    ]);

    const hits = this.parseInfoValue(statsInfo, 'keyspace_hits');
    const misses = this.parseInfoValue(statsInfo, 'keyspace_misses');
    const total = hits + misses;

    return {
      keyspaceHits: hits,
      keyspaceMisses: misses,
      hitRate: total > 0 ? Math.round((hits / total) * 10000) / 100 : 0,
      usedMemoryBytes: this.parseInfoValue(memoryInfo, 'used_memory'),
      usedMemoryHuman: this.parseInfoString(memoryInfo, 'used_memory_human') ?? '0B',
      totalKeys: await this.redis.dbsize(),
      connectedClients: this.parseInfoValue(clientsInfo, 'connected_clients'),
      uptimeSeconds: this.parseInfoValue(serverInfo, 'uptime_in_seconds'),
    };
  }

  /** Get cache key breakdown by namespace (second segment of etip:tenantId:namespace:...). */
  async getNamespaces(): Promise<NamespaceEntry[]> {
    const nsMap = new Map<string, number>();
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'etip:*', 'COUNT', 500);
      cursor = nextCursor;
      for (const key of keys) {
        const parts = key.split(':');
        const ns = (parts.length >= 3 ? parts[2] : 'unknown') ?? 'unknown';
        nsMap.set(ns, (nsMap.get(ns) ?? 0) + 1);
      }
    } while (cursor !== '0');

    return Array.from(nsMap.entries())
      .map(([namespace, keyCount]) => ({ namespace, keyCount }))
      .sort((a, b) => b.keyCount - a.keyCount);
  }

  /** List cache keys matching a prefix with SCAN-based pagination. */
  async listKeys(prefix: string, cursor: string = '0', count: number = 100): Promise<KeyListResult> {
    const pattern = prefix ? `${prefix}*` : 'etip:*';
    const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    return {
      keys,
      cursor: nextCursor,
      hasMore: nextCursor !== '0',
    };
  }

  /** Invalidate a single cache key. Returns 1 if deleted, 0 if not found. */
  async invalidateKey(key: string): Promise<number> {
    return this.redis.del(key);
  }

  /** Invalidate all keys matching a prefix using SCAN + batch DEL. */
  async invalidateByPrefix(prefix: string): Promise<number> {
    let cursor = '0';
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        const deleted = await this.redis.del(...keys);
        totalDeleted += deleted;
      }
    } while (cursor !== '0');

    return totalDeleted;
  }

  /** Invalidate all cache entries for a tenant. Delegates to shared-cache. */
  async invalidateTenant(tenantId: string): Promise<number> {
    return this.cacheService.invalidateTenant(tenantId);
  }

  /** Pre-warm dashboard cache by calling analytics-service. */
  async warmDashboard(analyticsUrl: string): Promise<WarmResult> {
    const logger = getLogger();
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${analyticsUrl}/api/v1/analytics`, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        return { success: false, widgetsWarmed: 0, durationMs: Date.now() - start, error: `HTTP ${res.status}` };
      }
      const body = await res.json() as { data?: { widgets?: Record<string, unknown> } };
      const widgetCount = body.data?.widgets ? Object.keys(body.data.widgets).length : 0;
      logger.info({ widgetCount, durationMs: Date.now() - start }, 'Dashboard cache warmed');
      return { success: true, widgetsWarmed: widgetCount, durationMs: Date.now() - start };
    } catch (err) {
      const msg = (err as Error).message;
      logger.warn({ err: msg }, 'Dashboard warming failed');
      return { success: false, widgetsWarmed: 0, durationMs: Date.now() - start, error: msg };
    }
  }

  /** Check Redis connectivity. */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /** Parse a numeric value from Redis INFO output. */
  private parseInfoValue(info: string, key: string): number {
    const match = info.match(new RegExp(`^${key}:(\\d+)`, 'm'));
    return match?.[1] ? parseInt(match[1], 10) : 0;
  }

  /** Parse a string value from Redis INFO output. */
  private parseInfoString(info: string, key: string): string | null {
    const match = info.match(new RegExp(`^${key}:(.+)$`, 'm'));
    return match?.[1]?.trim() ?? null;
  }
}
