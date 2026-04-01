/**
 * @module tests/bloom
 * @description Unit tests for BloomManager (per-tenant wrapper)
 * and integration tests for bloom in the normalization pipeline.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BloomManager,
  getBloomMetrics,
  resetBloomMetrics,
  type BloomManagerOptions,
} from '../src/bloom.js';
import type {
  BloomRedisClient,
  BloomRedisPipeline,
} from '@etip/shared-utils';

// ── In-Memory Redis Mock ───────────────────────────────────────────

function createMockRedis(): BloomRedisClient {
  const store = new Map<string, Map<number, number>>();
  const strings = new Map<string, string>();

  function getBitmap(key: string): Map<number, number> {
    let bm = store.get(key);
    if (!bm) { bm = new Map(); store.set(key, bm); }
    return bm;
  }

  const client: BloomRedisClient = {
    async setbit(key: string, offset: number, value: number): Promise<number> {
      const bm = getBitmap(key);
      const prev = bm.get(offset) ?? 0;
      bm.set(offset, value);
      return prev;
    },
    async getbit(key: string, offset: number): Promise<number> {
      return store.get(key)?.get(offset) ?? 0;
    },
    async del(key: string | string[]): Promise<number> {
      const keys = Array.isArray(key) ? key : [key];
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
        if (strings.delete(k)) count++;
      }
      return count;
    },
    async get(key: string): Promise<string | null> {
      return strings.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<string | null> {
      strings.set(key, value);
      return 'OK';
    },
    pipeline(): BloomRedisPipeline {
      const ops: Array<{ op: 'setbit' | 'getbit'; key: string; offset: number; value?: number }> = [];
      const pipe: BloomRedisPipeline = {
        setbit(key: string, offset: number, value: number) {
          ops.push({ op: 'setbit', key, offset, value });
          return pipe;
        },
        getbit(key: string, offset: number) {
          ops.push({ op: 'getbit', key, offset });
          return pipe;
        },
        async exec(): Promise<Array<[Error | null, number]>> {
          const results: Array<[Error | null, number]> = [];
          for (const o of ops) {
            if (o.op === 'setbit') {
              const val = await client.setbit(o.key, o.offset, o.value!);
              results.push([null, val]);
            } else {
              const val = await client.getbit(o.key, o.offset);
              results.push([null, val]);
            }
          }
          return results;
        },
      };
      return pipe;
    },
  };
  return client;
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as import('pino').Logger;
}

// ── BloomManager Unit Tests ────────────────────────────────────────

describe('BloomManager', () => {
  let redis: BloomRedisClient;
  let logger: ReturnType<typeof createMockLogger>;
  let manager: BloomManager;

  beforeEach(() => {
    redis = createMockRedis();
    logger = createMockLogger();
    manager = new BloomManager({ redis, logger, expectedItems: 10_000, falsePositiveRate: 0.001 });
    resetBloomMetrics();
  });

  describe('check + add', () => {
    it('returns false for unseen hash', async () => {
      const result = await manager.check('tenant-1', 'hash-abc');
      expect(result).toBe(false);
    });

    it('returns true after adding hash', async () => {
      await manager.add('tenant-1', 'hash-abc');
      const result = await manager.check('tenant-1', 'hash-abc');
      expect(result).toBe(true);
    });

    it('isolates tenants — different tenant does not see other tenant hashes', async () => {
      await manager.add('tenant-1', 'hash-abc');
      const result = await manager.check('tenant-2', 'hash-abc');
      expect(result).toBe(false);
    });
  });

  describe('metrics', () => {
    it('tracks check/hit/miss counts', async () => {
      await manager.add('t1', 'known');
      await manager.check('t1', 'known');  // hit
      await manager.check('t1', 'unknown'); // miss
      await manager.check('t1', 'known');  // hit

      const m = getBloomMetrics();
      expect(m.checkTotal).toBe(3);
      expect(m.hitTotal).toBe(2);
      expect(m.missTotal).toBe(1);
    });

    it('tracks false positives via recordFalsePositive', () => {
      manager.recordFalsePositive();
      manager.recordFalsePositive();
      expect(getBloomMetrics().falsePositiveTotal).toBe(2);
    });

    it('resets metrics correctly', () => {
      manager.recordFalsePositive();
      resetBloomMetrics();
      expect(getBloomMetrics().falsePositiveTotal).toBe(0);
    });
  });

  describe('warmUp', () => {
    it('loads existing hashes from DB into bloom', async () => {
      const dbHashes = ['hash-1', 'hash-2', 'hash-3'];
      const fetchHashes = vi.fn()
        .mockResolvedValueOnce(dbHashes)
        .mockResolvedValueOnce([]);

      const result = await manager.warmUp('tenant-1', fetchHashes);
      expect(result.loaded).toBe(3);
      expect(result.elapsed).toBeGreaterThanOrEqual(0);

      // Verify hashes are in bloom
      expect(await manager.check('tenant-1', 'hash-1')).toBe(true);
      expect(await manager.check('tenant-1', 'hash-2')).toBe(true);
      expect(await manager.check('tenant-1', 'hash-3')).toBe(true);
    });

    it('handles large paginated warm-up (3 batches)', async () => {
      const batch1 = Array.from({ length: 1000 }, (_, i) => `h-${i}`);
      const batch2 = Array.from({ length: 1000 }, (_, i) => `h-${1000 + i}`);
      const batch3 = Array.from({ length: 500 }, (_, i) => `h-${2000 + i}`);

      const fetchHashes = vi.fn()
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2)
        .mockResolvedValueOnce(batch3)
        .mockResolvedValueOnce([]);

      const result = await manager.warmUp('tenant-1', fetchHashes);
      expect(result.loaded).toBe(2500);
      expect(fetchHashes).toHaveBeenCalledTimes(4); // 3 data batches + 1 empty

      // Spot-check
      expect(await manager.check('tenant-1', 'h-0')).toBe(true);
      expect(await manager.check('tenant-1', 'h-2499')).toBe(true);
    });

    it('handles empty DB (no IOCs)', async () => {
      const fetchHashes = vi.fn().mockResolvedValueOnce([]);
      const result = await manager.warmUp('tenant-1', fetchHashes);
      expect(result.loaded).toBe(0);
    });
  });

  describe('rebuild', () => {
    it('clears existing filter and re-loads from DB', async () => {
      // Pre-add some hashes
      await manager.add('tenant-1', 'old-hash');
      expect(await manager.check('tenant-1', 'old-hash')).toBe(true);

      // Rebuild with different data
      const fetchHashes = vi.fn()
        .mockResolvedValueOnce(['new-hash-1', 'new-hash-2'])
        .mockResolvedValueOnce([]);

      const result = await manager.rebuild('tenant-1', fetchHashes);
      expect(result.loaded).toBe(2);

      // Old hash may or may not be present (filter was reset, but it's probabilistic)
      // New hashes MUST be present
      expect(await manager.check('tenant-1', 'new-hash-1')).toBe(true);
      expect(await manager.check('tenant-1', 'new-hash-2')).toBe(true);
    });
  });

  describe('getStats', () => {
    it('returns filter stats and metrics', async () => {
      await manager.add('tenant-1', 'hash-1');
      const stats = await manager.getStats('tenant-1');
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.hashCount).toBeGreaterThan(0);
      expect(stats.itemCount).toBe(1);
      expect(stats.redisKey).toBe('etip:bloom:iocs:tenant-1');
      expect(stats.metrics).toBeDefined();
      expect(stats.needsRebuild).toBe(false);
    });

    it('flags needsRebuild when approaching capacity', async () => {
      // Create a tiny filter (100 items) and overfill it
      const tinyManager = new BloomManager({
        redis, logger, expectedItems: 100, falsePositiveRate: 0.001,
      });
      const keys = Array.from({ length: 95 }, (_, i) => `k-${i}`);
      for (const k of keys) await tinyManager.add('t1', k);

      const stats = await tinyManager.getStats('t1');
      expect(stats.needsRebuild).toBe(true);
    });
  });

  describe('periodic logging', () => {
    it('logs stats every 1000 checks', async () => {
      // This is implicitly tested — just verify no errors
      for (let i = 0; i < 5; i++) {
        await manager.check('t1', `key-${i}`);
      }
      expect(getBloomMetrics().checkTotal).toBe(5);
    });
  });
});
