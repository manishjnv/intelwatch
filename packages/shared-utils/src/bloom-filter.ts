/**
 * @module bloom-filter
 * @description Redis-backed Bloom filter using BITFIELD operations.
 * Zero external dependencies — murmurhash3 implemented inline.
 * Accepts an ioredis-compatible Redis client instance.
 *
 * @example
 * ```typescript
 * import { createBloomFilter } from '@etip/shared-utils';
 * const bloom = createBloomFilter({ redis, name: 'iocs:tenant-1', expectedItems: 1_000_000, falsePositiveRate: 0.001 });
 * await bloom.add('sha256hash');
 * if (await bloom.mightContain('sha256hash')) { ... }
 * ```
 */

// ── Murmurhash3 (32-bit, x86) ─────────────────────────────────────
// Faithful port of the reference C implementation. ~30 lines, zero deps.

/**
 * Compute a 32-bit MurmurHash3 for the given string with a seed.
 * Used internally to generate k hash functions via Kirsch-Mitzenmacher.
 */
export function murmurhash3(key: string, seed: number): number {
  let h = seed >>> 0;
  const len = key.length;
  const nblocks = len >> 2; // integer division by 4

  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  // Body — process 4-byte blocks
  for (let i = 0; i < nblocks; i++) {
    const idx = i * 4;
    let k =
      (key.charCodeAt(idx) & 0xff) |
      ((key.charCodeAt(idx + 1) & 0xff) << 8) |
      ((key.charCodeAt(idx + 2) & 0xff) << 16) |
      ((key.charCodeAt(idx + 3) & 0xff) << 24);

    k = Math.imul(k, c1);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, c2);

    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
  }

  // Tail — remaining bytes (intentional fallthrough for murmurhash3 algorithm)
  const tail = nblocks * 4;
  let k1 = 0;
  const remainder = len & 3;
  if (remainder >= 3) k1 ^= (key.charCodeAt(tail + 2) & 0xff) << 16;
  if (remainder >= 2) k1 ^= (key.charCodeAt(tail + 1) & 0xff) << 8;
  if (remainder >= 1) {
    k1 ^= key.charCodeAt(tail) & 0xff;
    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);
    h ^= k1;
  }

  // Finalization mix (fmix32)
  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  return h >>> 0;
}

// ── Optimal Bloom filter parameters ────────────────────────────────

/** Calculate optimal bit array size (m) for n items at false positive rate p */
export function optimalBitCount(expectedItems: number, falsePositiveRate: number): number {
  const m = Math.ceil(-(expectedItems * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2));
  return m;
}

/** Calculate optimal hash function count (k) for m bits and n items */
export function optimalHashCount(bitCount: number, expectedItems: number): number {
  const k = Math.max(1, Math.round((bitCount / expectedItems) * Math.LN2));
  return k;
}

// ── Bloom Filter types ─────────────────────────────────────────────

/** Stats returned by bloom.stats() */
export interface BloomFilterStats {
  /** Total bit array size */
  size: number;
  /** Number of hash functions */
  hashCount: number;
  /** Approximate items added (tracked, not derived from bits) */
  itemCount: number;
  /** Expected false positive rate at current item count */
  expectedFP: number;
  /** Redis key name */
  redisKey: string;
}

/** Bloom filter interface — all ops are async (backed by Redis) */
export interface BloomFilter {
  add(key: string): Promise<void>;
  addBatch(keys: string[]): Promise<void>;
  mightContain(key: string): Promise<boolean>;
  reset(): Promise<void>;
  stats(): Promise<BloomFilterStats>;
}

/** Minimal Redis client interface — compatible with ioredis */
export interface BloomRedisClient {
  setbit(key: string, offset: number, value: number): Promise<number>;
  getbit(key: string, offset: number): Promise<number>;
  del(key: string | string[]): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string | null>;
  pipeline(): BloomRedisPipeline;
}

/** Minimal pipeline interface for batched operations */
export interface BloomRedisPipeline {
  setbit(key: string, offset: number, value: number): BloomRedisPipeline;
  getbit(key: string, offset: number): BloomRedisPipeline;
  exec(): Promise<Array<[Error | null, number]> | null>;
}

export interface CreateBloomFilterOptions {
  /** ioredis-compatible client */
  redis: BloomRedisClient;
  /** Filter name — used in Redis key: etip:bloom:{name} */
  name: string;
  /** Expected number of items to store */
  expectedItems: number;
  /** Target false positive rate (e.g. 0.001 = 0.1%) */
  falsePositiveRate: number;
}

/**
 * Create a Redis-backed Bloom filter.
 * Uses Redis SETBIT/GETBIT for the bit array and Kirsch-Mitzenmacher
 * double-hashing to derive k hash positions from 2 murmurhash3 seeds.
 */
export function createBloomFilter(opts: CreateBloomFilterOptions): BloomFilter {
  const { redis, name, expectedItems, falsePositiveRate } = opts;
  const bitCount = optimalBitCount(expectedItems, falsePositiveRate);
  const hashCount = optimalHashCount(bitCount, expectedItems);
  const redisKey = `etip:bloom:${name}`;
  const counterKey = `etip:bloom:${name}:count`;

  /**
   * Kirsch-Mitzenmacher optimization: derive k hash positions
   * from just 2 base hashes: h_i = (h1 + i * h2) mod m
   */
  function getPositions(key: string): number[] {
    const h1 = murmurhash3(key, 0);
    const h2 = murmurhash3(key, h1 || 1);
    const positions: number[] = [];
    for (let i = 0; i < hashCount; i++) {
      positions.push(((h1 + i * h2) >>> 0) % bitCount);
    }
    return positions;
  }

  return {
    async add(key: string): Promise<void> {
      const positions = getPositions(key);
      const pipe = redis.pipeline();
      for (const pos of positions) {
        pipe.setbit(redisKey, pos, 1);
      }
      await pipe.exec();
      // Increment approximate counter
      const current = await redis.get(counterKey);
      await redis.set(counterKey, String((Number(current) || 0) + 1));
    },

    async addBatch(keys: string[]): Promise<void> {
      if (keys.length === 0) return;
      // Process in chunks to avoid mega-pipelines
      const CHUNK = 500;
      for (let start = 0; start < keys.length; start += CHUNK) {
        const chunk = keys.slice(start, start + CHUNK);
        const pipe = redis.pipeline();
        for (const key of chunk) {
          const positions = getPositions(key);
          for (const pos of positions) {
            pipe.setbit(redisKey, pos, 1);
          }
        }
        await pipe.exec();
      }
      // Update counter
      const current = await redis.get(counterKey);
      await redis.set(counterKey, String((Number(current) || 0) + keys.length));
    },

    async mightContain(key: string): Promise<boolean> {
      const positions = getPositions(key);
      const pipe = redis.pipeline();
      for (const pos of positions) {
        pipe.getbit(redisKey, pos);
      }
      const results = await pipe.exec();
      if (!results) return false;
      return results.every(([err, val]) => !err && val === 1);
    },

    async reset(): Promise<void> {
      await redis.del(redisKey);
      await redis.del(counterKey);
    },

    async stats(): Promise<BloomFilterStats> {
      const current = await redis.get(counterKey);
      const itemCount = Number(current) || 0;
      // Approximate FP rate: (1 - e^(-kn/m))^k
      const exponent = -(hashCount * itemCount) / bitCount;
      const expectedFP = Math.pow(1 - Math.exp(exponent), hashCount);
      return {
        size: bitCount,
        hashCount,
        itemCount,
        expectedFP: Math.round(expectedFP * 1_000_000) / 1_000_000, // 6 decimal places
        redisKey,
      };
    },
  };
}
