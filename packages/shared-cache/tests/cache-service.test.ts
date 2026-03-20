/**
 * @module @etip/shared-cache/tests/cache-service
 * @description Unit tests for CacheService using MockRedis.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CacheService } from '../src/cache-service.js';
import { createMockRedis, MockRedis } from './mock-redis.js';
import type Redis from 'ioredis';

let redis: Redis;
let mockRedis: MockRedis;
let cache: CacheService;

beforeEach(() => {
  redis = createMockRedis();
  mockRedis = redis as unknown as MockRedis;
  cache = new CacheService(redis);
});

// ── buildKey ───────────────────────────────────────────────────────

describe('buildKey', () => {
  it('builds tenant-scoped key', () => {
    expect(cache.buildKey('tenant-1', 'dashboard:overview'))
      .toBe('etip:tenant-1:dashboard:overview');
  });

  it('handles nested resource paths', () => {
    expect(cache.buildKey('t-2', 'enrich:ip:8.8.8.8'))
      .toBe('etip:t-2:enrich:ip:8.8.8.8');
  });
});

describe('buildGlobalKey', () => {
  it('builds global key without tenant', () => {
    expect(cache.buildGlobalKey('session:abc'))
      .toBe('etip:session:abc');
  });
});

// ── get / set ──────────────────────────────────────────────────────

describe('get / set', () => {
  it('returns null for missing key', async () => {
    const result = await cache.get('tenant-1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('stores and retrieves an object', async () => {
    const data = { widgets: [{ id: 1, name: 'IOC Count' }] };
    await cache.set('tenant-1', 'dashboard:overview', data);
    const result = await cache.get<typeof data>('tenant-1', 'dashboard:overview');
    expect(result).toEqual(data);
  });

  it('stores and retrieves a string', async () => {
    await cache.set('tenant-1', 'simple', 'hello');
    const result = await cache.get<string>('tenant-1', 'simple');
    expect(result).toBe('hello');
  });

  it('stores and retrieves a number', async () => {
    await cache.set('tenant-1', 'count', 42);
    const result = await cache.get<number>('tenant-1', 'count');
    expect(result).toBe(42);
  });

  it('stores and retrieves an array', async () => {
    const arr = [1, 2, 3];
    await cache.set('tenant-1', 'list', arr);
    expect(await cache.get('tenant-1', 'list')).toEqual(arr);
  });

  it('stores and retrieves a boolean', async () => {
    await cache.set('tenant-1', 'flag', true);
    expect(await cache.get('tenant-1', 'flag')).toBe(true);
  });

  it('isolates keys between tenants', async () => {
    await cache.set('tenant-1', 'data', { a: 1 });
    await cache.set('tenant-2', 'data', { b: 2 });
    expect(await cache.get('tenant-1', 'data')).toEqual({ a: 1 });
    expect(await cache.get('tenant-2', 'data')).toEqual({ b: 2 });
  });
});

// ── set with TTL ───────────────────────────────────────────────────

describe('set with TTL', () => {
  it('stores with TTL', async () => {
    await cache.set('tenant-1', 'temp', 'value', { ttl: 3600 });
    expect(await cache.get('tenant-1', 'temp')).toBe('value');
  });

  it('key is retrievable within TTL', async () => {
    await cache.set('tenant-1', 'temp', 'value', { ttl: 60 });
    const result = await cache.get<string>('tenant-1', 'temp');
    expect(result).toBe('value');
  });
});

// ── getRaw / setRaw ────────────────────────────────────────────────

describe('getRaw / setRaw', () => {
  it('stores and retrieves with full key', async () => {
    const key = 'etip:session:abc-123';
    await cache.setRaw(key, { userId: 'u1' }, { ttl: 900 });
    const result = await cache.getRaw<{ userId: string }>(key);
    expect(result?.userId).toBe('u1');
  });
});

// ── getOrSet ───────────────────────────────────────────────────────

describe('getOrSet', () => {
  it('returns cached value if present', async () => {
    await cache.set('tenant-1', 'cached', 'existing');
    let factoryCalled = false;
    const result = await cache.getOrSet('tenant-1', 'cached', 60, async () => {
      factoryCalled = true;
      return 'new';
    });
    expect(result).toBe('existing');
    expect(factoryCalled).toBe(false);
  });

  it('calls factory and caches on miss', async () => {
    let factoryCalls = 0;
    const result = await cache.getOrSet('tenant-1', 'miss', 60, async () => {
      factoryCalls++;
      return { computed: true };
    });
    expect(result).toEqual({ computed: true });
    expect(factoryCalls).toBe(1);

    // Second call should hit cache
    const result2 = await cache.getOrSet('tenant-1', 'miss', 60, async () => {
      factoryCalls++;
      return { computed: false };
    });
    expect(result2).toEqual({ computed: true });
    expect(factoryCalls).toBe(1);
  });
});

// ── invalidate ─────────────────────────────────────────────────────

describe('invalidate', () => {
  it('deletes a single key', async () => {
    await cache.set('tenant-1', 'to-delete', 'value');
    expect(await cache.get('tenant-1', 'to-delete')).toBe('value');

    const deleted = await cache.invalidate('tenant-1', 'to-delete');
    expect(deleted).toBe(1);
    expect(await cache.get('tenant-1', 'to-delete')).toBeNull();
  });

  it('returns 0 for non-existent key', async () => {
    const deleted = await cache.invalidate('tenant-1', 'nonexistent');
    expect(deleted).toBe(0);
  });
});

// ── invalidateTenant ───────────────────────────────────────────────

describe('invalidateTenant', () => {
  it('deletes all keys for a tenant', async () => {
    await cache.set('tenant-1', 'key-a', 'a');
    await cache.set('tenant-1', 'key-b', 'b');
    await cache.set('tenant-1', 'key-c', 'c');
    await cache.set('tenant-2', 'key-a', 'other');

    const deleted = await cache.invalidateTenant('tenant-1');
    expect(deleted).toBe(3);

    expect(await cache.get('tenant-1', 'key-a')).toBeNull();
    expect(await cache.get('tenant-1', 'key-b')).toBeNull();
    expect(await cache.get('tenant-1', 'key-c')).toBeNull();
    // Other tenant untouched
    expect(await cache.get('tenant-2', 'key-a')).toBe('other');
  });

  it('returns 0 when tenant has no keys', async () => {
    const deleted = await cache.invalidateTenant('empty-tenant');
    expect(deleted).toBe(0);
  });
});

// ── invalidateRaw ──────────────────────────────────────────────────

describe('invalidateRaw', () => {
  it('deletes by full key', async () => {
    await cache.setRaw('etip:session:xyz', 'data');
    const deleted = await cache.invalidateRaw('etip:session:xyz');
    expect(deleted).toBe(1);
  });
});

// ── exists ─────────────────────────────────────────────────────────

describe('exists', () => {
  it('returns true for existing key', async () => {
    await cache.set('tenant-1', 'present', 'yes');
    expect(await cache.exists('tenant-1', 'present')).toBe(true);
  });

  it('returns false for missing key', async () => {
    expect(await cache.exists('tenant-1', 'absent')).toBe(false);
  });
});

// ── ttl ────────────────────────────────────────────────────────────

describe('ttl', () => {
  it('returns -2 for non-existent key', async () => {
    const result = await cache.ttl('tenant-1', 'nope');
    expect(result).toBe(-2);
  });

  it('returns -1 for key with no expiry', async () => {
    await cache.set('tenant-1', 'forever', 'data');
    const result = await cache.ttl('tenant-1', 'forever');
    expect(result).toBe(-1);
  });

  it('returns positive TTL for expiring key', async () => {
    await cache.set('tenant-1', 'expiring', 'data', { ttl: 3600 });
    const result = await cache.ttl('tenant-1', 'expiring');
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(3600);
  });
});

// ── ping ───────────────────────────────────────────────────────────

describe('ping', () => {
  it('returns PONG', async () => {
    expect(await cache.ping()).toBe('PONG');
  });
});
