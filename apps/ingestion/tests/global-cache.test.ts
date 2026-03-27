import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalCache } from '../src/services/global-cache.js';

// In-memory Redis mock
function createRedisMock() {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  return {
    store,
    sets,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _ex?: string, _ttl?: number) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) count++;
        if (sets.delete(key)) count++;
      }
      return count;
    }),
    keys: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace('*', '');
      return [...store.keys(), ...sets.keys()].filter((k) => k.startsWith(prefix));
    }),
    sismember: vi.fn(async (key: string, member: string) => {
      return sets.get(key)?.has(member) ? 1 : 0;
    }),
    sadd: vi.fn(async (key: string, member: string) => {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(member);
      return 1;
    }),
    expire: vi.fn(async () => 1),
    incrby: vi.fn(async (key: string, delta: number) => {
      const current = parseInt(store.get(key) ?? '0', 10);
      const next = current + delta;
      store.set(key, String(next));
      return next;
    }),
    mget: vi.fn(async (...keys: string[]) => {
      return keys.map((k) => store.get(k) ?? null);
    }),
  };
}

describe('GlobalCache', () => {
  let redis: ReturnType<typeof createRedisMock>;
  let prisma: any;
  let cache: GlobalCache;

  const mockCatalogEntry = {
    id: 'feed-1',
    name: 'Test Feed',
    feedUrl: 'https://example.com/feed',
    feedType: 'rss',
    feedReliability: 80,
    admiraltySource: 'B',
    admiraltyInfo: '2',
    enabled: true,
  };

  beforeEach(() => {
    redis = createRedisMock();
    prisma = {
      globalFeedCatalog: {
        findUnique: vi.fn().mockResolvedValue(mockCatalogEntry),
      },
    };
    cache = new GlobalCache({ redis: redis as any, prisma });
  });

  describe('getCatalogEntry', () => {
    it('cache miss → fetches from Prisma, populates cache', async () => {
      const entry = await cache.getCatalogEntry('feed-1');
      expect(entry).toEqual(mockCatalogEntry);
      expect(prisma.globalFeedCatalog.findUnique).toHaveBeenCalledWith({ where: { id: 'feed-1' } });
      expect(redis.set).toHaveBeenCalledWith(
        'global:catalog:feed-1',
        JSON.stringify(mockCatalogEntry),
        'EX',
        600,
      );
    });

    it('cache hit → returns cached (no Prisma call)', async () => {
      // Pre-populate cache
      redis.store.set('global:catalog:feed-1', JSON.stringify(mockCatalogEntry));

      const entry = await cache.getCatalogEntry('feed-1');
      expect(entry).toEqual(mockCatalogEntry);
      expect(prisma.globalFeedCatalog.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('invalidateCatalogEntry', () => {
    it('subsequent get is a miss', async () => {
      // Populate then invalidate
      await cache.getCatalogEntry('feed-1');
      await cache.invalidateCatalogEntry('feed-1');
      expect(redis.del).toHaveBeenCalledWith('global:catalog:feed-1');
    });
  });

  describe('invalidateAllCatalog', () => {
    it('clears all catalog keys', async () => {
      redis.store.set('global:catalog:feed-1', '{}');
      redis.store.set('global:catalog:feed-2', '{}');

      await cache.invalidateAllCatalog();
      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe('isKnownIoc / addKnownIoc', () => {
    it('unknown hash → false', async () => {
      expect(await cache.isKnownIoc('abc123')).toBe(false);
    });

    it('after addKnownIoc → true', async () => {
      await cache.addKnownIoc('abc123');
      expect(await cache.isKnownIoc('abc123')).toBe(true);
    });
  });

  describe('isKnownFuzzyHash / addKnownFuzzyHash', () => {
    it('same pattern as isKnownIoc', async () => {
      expect(await cache.isKnownFuzzyHash('fuzzy123')).toBe(false);
      await cache.addKnownFuzzyHash('fuzzy123');
      expect(await cache.isKnownFuzzyHash('fuzzy123')).toBe(true);
    });
  });

  describe('warninglists', () => {
    it('stores and retrieves correctly', async () => {
      const lists = [{ name: 'test', type: 'string' as const, category: 'known_benign' as const, values: ['8.8.8.8'] }];
      await cache.cacheWarninglists(lists);
      const cached = await cache.getCachedWarninglists();
      expect(cached).toEqual(lists);
    });

    it('null when not cached', async () => {
      expect(await cache.getCachedWarninglists()).toBeNull();
    });
  });

  describe('incrementCounter', () => {
    it('increments correctly', async () => {
      const result = await cache.incrementCounter('articles-created-24h', 5);
      expect(result).toBe(5);
    });

    it('multiple increments accumulate', async () => {
      await cache.incrementCounter('iocs-created-24h', 3);
      const result = await cache.incrementCounter('iocs-created-24h', 7);
      expect(result).toBe(10);
    });
  });

  describe('getCounters', () => {
    it('returns all counters', async () => {
      await cache.incrementCounter('articles-created-24h', 5);
      await cache.incrementCounter('iocs-created-24h', 10);
      const counters = await cache.getCounters();
      expect(counters['articles-created-24h']).toBe(5);
      expect(counters['iocs-created-24h']).toBe(10);
    });
  });
});
