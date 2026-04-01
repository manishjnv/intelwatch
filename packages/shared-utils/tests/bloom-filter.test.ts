/**
 * @module @etip/shared-utils/tests/bloom-filter
 * @description Unit tests for Redis-backed Bloom filter.
 * Uses in-memory bitmap mock — no real Redis needed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  murmurhash3,
  optimalBitCount,
  optimalHashCount,
  createBloomFilter,
  type BloomRedisClient,
  type BloomRedisPipeline,
} from '../src/bloom-filter.js';

// ── In-Memory Redis Mock (bitmap) ──────────────────────────────────

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
      const bm = store.get(key);
      return bm?.get(offset) ?? 0;
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

// ── Murmurhash3 Tests ──────────────────────────────────────────────

describe('murmurhash3', () => {
  it('returns a 32-bit unsigned integer', () => {
    const h = murmurhash3('hello', 0);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('is deterministic — same input + seed = same output', () => {
    expect(murmurhash3('test-key', 42)).toBe(murmurhash3('test-key', 42));
  });

  it('different seeds produce different hashes', () => {
    const h1 = murmurhash3('test-key', 0);
    const h2 = murmurhash3('test-key', 1);
    expect(h1).not.toBe(h2);
  });

  it('different keys produce different hashes', () => {
    const h1 = murmurhash3('alpha', 0);
    const h2 = murmurhash3('bravo', 0);
    expect(h1).not.toBe(h2);
  });

  it('handles empty string', () => {
    const h = murmurhash3('', 0);
    expect(h).toBeGreaterThanOrEqual(0);
  });

  it('handles long strings (SHA-256 hex)', () => {
    const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const h = murmurhash3(sha, 0);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

// ── Optimal Parameter Calculation ──────────────────────────────────

describe('optimalBitCount', () => {
  it('calculates correct bit count for 1M items at 0.1% FP', () => {
    const m = optimalBitCount(1_000_000, 0.001);
    // Formula: m = -(n * ln(p)) / (ln(2)^2) ≈ 14,377,588
    expect(m).toBeGreaterThan(14_000_000);
    expect(m).toBeLessThan(15_000_000);
  });

  it('calculates correct bit count for 5M items at 0.1% FP', () => {
    const m = optimalBitCount(5_000_000, 0.001);
    // ~71.8M bits = ~8.6MB
    expect(m).toBeGreaterThan(70_000_000);
    expect(m).toBeLessThan(73_000_000);
  });

  it('larger FP rate = smaller filter', () => {
    const small = optimalBitCount(1_000_000, 0.01);
    const large = optimalBitCount(1_000_000, 0.001);
    expect(small).toBeLessThan(large);
  });
});

describe('optimalHashCount', () => {
  it('calculates correct k for 1M items at 0.1% FP', () => {
    const m = optimalBitCount(1_000_000, 0.001);
    const k = optimalHashCount(m, 1_000_000);
    // k = (m/n) * ln(2) ≈ 10
    expect(k).toBeGreaterThanOrEqual(9);
    expect(k).toBeLessThanOrEqual(11);
  });

  it('returns at least 1', () => {
    const k = optimalHashCount(1, 1_000_000);
    expect(k).toBeGreaterThanOrEqual(1);
  });
});

// ── Bloom Filter Core Operations ───────────────────────────────────

describe('createBloomFilter', () => {
  let redis: BloomRedisClient;

  beforeEach(() => {
    redis = createMockRedis();
  });

  function makeFilter(n = 10_000, fp = 0.001) {
    return createBloomFilter({
      redis,
      name: 'test',
      expectedItems: n,
      falsePositiveRate: fp,
    });
  }

  describe('add + mightContain', () => {
    it('returns true for added key', async () => {
      const bloom = makeFilter();
      await bloom.add('key-1');
      expect(await bloom.mightContain('key-1')).toBe(true);
    });

    it('returns true for multiple added keys', async () => {
      const bloom = makeFilter();
      await bloom.add('alpha');
      await bloom.add('bravo');
      await bloom.add('charlie');
      expect(await bloom.mightContain('alpha')).toBe(true);
      expect(await bloom.mightContain('bravo')).toBe(true);
      expect(await bloom.mightContain('charlie')).toBe(true);
    });

    it('returns false for unseen key (high probability)', async () => {
      const bloom = makeFilter();
      await bloom.add('existing');
      // Single unseen key — false positive extremely unlikely
      expect(await bloom.mightContain('never-added')).toBe(false);
    });
  });

  describe('addBatch', () => {
    it('adds multiple keys in batch', async () => {
      const bloom = makeFilter();
      await bloom.addBatch(['a', 'b', 'c', 'd', 'e']);
      expect(await bloom.mightContain('a')).toBe(true);
      expect(await bloom.mightContain('c')).toBe(true);
      expect(await bloom.mightContain('e')).toBe(true);
    });

    it('handles empty batch', async () => {
      const bloom = makeFilter();
      await bloom.addBatch([]);
      const s = await bloom.stats();
      expect(s.itemCount).toBe(0);
    });

    it('handles batch larger than chunk size (>500)', async () => {
      const bloom = makeFilter(100_000);
      const keys = Array.from({ length: 700 }, (_, i) => `key-${i}`);
      await bloom.addBatch(keys);
      // Spot-check
      expect(await bloom.mightContain('key-0')).toBe(true);
      expect(await bloom.mightContain('key-699')).toBe(true);
      const s = await bloom.stats();
      expect(s.itemCount).toBe(700);
    });
  });

  describe('false positive rate', () => {
    it('stays below configured threshold (10K items, test 10K unseen)', async () => {
      const N = 10_000;
      const bloom = makeFilter(N, 0.001);

      // Add N items
      const addedKeys = Array.from({ length: N }, (_, i) => `added-${i}`);
      await bloom.addBatch(addedKeys);

      // All added items MUST be found
      let allFound = true;
      for (let i = 0; i < 100; i++) { // Spot-check 100
        if (!(await bloom.mightContain(`added-${i}`))) { allFound = false; break; }
      }
      expect(allFound).toBe(true);

      // Test N unseen items — count false positives
      let falsePositives = 0;
      for (let i = 0; i < N; i++) {
        if (await bloom.mightContain(`unseen-${i}`)) falsePositives++;
      }

      const fpRate = falsePositives / N;
      // Allow up to 0.2% (2x the configured 0.1%)
      expect(fpRate).toBeLessThan(0.002);
    });
  });

  describe('reset', () => {
    it('clears all bits — previously added key returns false', async () => {
      const bloom = makeFilter();
      await bloom.add('key-1');
      expect(await bloom.mightContain('key-1')).toBe(true);

      await bloom.reset();
      expect(await bloom.mightContain('key-1')).toBe(false);
    });

    it('resets item counter to 0', async () => {
      const bloom = makeFilter();
      await bloom.add('key-1');
      await bloom.reset();
      const s = await bloom.stats();
      expect(s.itemCount).toBe(0);
    });
  });

  describe('stats', () => {
    it('returns correct size and hashCount', async () => {
      const bloom = makeFilter(1_000_000, 0.001);
      const s = await bloom.stats();
      expect(s.size).toBeGreaterThan(14_000_000);
      expect(s.hashCount).toBeGreaterThanOrEqual(9);
      expect(s.hashCount).toBeLessThanOrEqual(11);
      expect(s.redisKey).toBe('etip:bloom:test');
    });

    it('tracks item count after adds', async () => {
      const bloom = makeFilter();
      await bloom.add('a');
      await bloom.add('b');
      await bloom.addBatch(['c', 'd', 'e']);
      const s = await bloom.stats();
      expect(s.itemCount).toBe(5);
    });

    it('expectedFP is 0 when empty', async () => {
      const bloom = makeFilter();
      const s = await bloom.stats();
      expect(s.expectedFP).toBe(0);
      expect(s.itemCount).toBe(0);
    });

    it('expectedFP increases as items are added', async () => {
      const bloom = makeFilter(100);
      const s1 = await bloom.stats();
      await bloom.addBatch(Array.from({ length: 50 }, (_, i) => `k-${i}`));
      const s2 = await bloom.stats();
      expect(s2.expectedFP).toBeGreaterThan(s1.expectedFP);
    });
  });

  describe('Redis key naming', () => {
    it('uses etip:bloom:{name} pattern', async () => {
      const bloom = createBloomFilter({
        redis, name: 'iocs:tenant-123', expectedItems: 1000, falsePositiveRate: 0.01,
      });
      const s = await bloom.stats();
      expect(s.redisKey).toBe('etip:bloom:iocs:tenant-123');
    });
  });
});
