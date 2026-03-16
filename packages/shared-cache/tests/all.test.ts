import { describe, it, expect, beforeEach } from 'vitest';
import { CacheService } from '../src/cache-service.js';
import { CACHE_TTL, CACHE_PREFIX, KEY_PATTERNS } from '../src/cache-ttl.js';
import { createMockRedis } from './mock-redis.js';
import type Redis from 'ioredis';

let redis: Redis;
let cache: CacheService;

beforeEach(() => {
  redis = createMockRedis();
  cache = new CacheService(redis);
});

// ── TTL Constants ──────────────────────────────────────────────────
describe('CACHE_TTL', () => {
  it('dashboard 48h', () => { expect(CACHE_TTL.dashboard).toBe(172800); });
  it('iocSearch 1h', () => { expect(CACHE_TTL.iocSearch).toBe(3600); });
  it('enrichment.ip 1h', () => { expect(CACHE_TTL.enrichment.ip).toBe(3600); });
  it('enrichment.domain 24h', () => { expect(CACHE_TTL.enrichment.domain).toBe(86400); });
  it('enrichment.hash 7d', () => { expect(CACHE_TTL.enrichment.hash).toBe(604800); });
  it('enrichment.cve 12h', () => { expect(CACHE_TTL.enrichment.cve).toBe(43200); });
  it('userSession 15m', () => { expect(CACHE_TTL.userSession).toBe(900); });
  it('feedData 30m', () => { expect(CACHE_TTL.feedData).toBe(1800); });
});

describe('CACHE_PREFIX', () => {
  it('is etip', () => { expect(CACHE_PREFIX).toBe('etip'); });
});

describe('KEY_PATTERNS', () => {
  it('dashboard', () => { expect(KEY_PATTERNS.dashboard('t1', 'overview')).toBe('etip:t1:dashboard:overview'); });
  it('iocSearch', () => { expect(KEY_PATTERNS.iocSearch('t1', 'abc')).toBe('etip:t1:ioc-search:abc'); });
  it('enrichment', () => { expect(KEY_PATTERNS.enrichment('t1', 'ip', '8.8.8.8')).toBe('etip:t1:enrich:ip:8.8.8.8'); });
  it('session (global)', () => { expect(KEY_PATTERNS.session('s1')).toBe('etip:session:s1'); });
  it('feed', () => { expect(KEY_PATTERNS.feed('t1', 'f1')).toBe('etip:t1:feed:f1'); });
  it('tenantWildcard', () => { expect(KEY_PATTERNS.tenantWildcard('t1')).toBe('etip:t1:*'); });
});

// ── CacheService ───────────────────────────────────────────────────
describe('buildKey', () => {
  it('tenant-scoped', () => { expect(cache.buildKey('t1', 'dashboard:x')).toBe('etip:t1:dashboard:x'); });
  it('nested', () => { expect(cache.buildKey('t2', 'enrich:ip:8.8.8.8')).toBe('etip:t2:enrich:ip:8.8.8.8'); });
});

describe('buildGlobalKey', () => {
  it('no tenant', () => { expect(cache.buildGlobalKey('session:abc')).toBe('etip:session:abc'); });
});

describe('get / set', () => {
  it('null for missing', async () => { expect(await cache.get('t1', 'x')).toBeNull(); });
  it('store and retrieve object', async () => {
    const data = { widgets: [{ id: 1 }] };
    await cache.set('t1', 'dash', data);
    expect(await cache.get('t1', 'dash')).toEqual(data);
  });
  it('store string', async () => { await cache.set('t1', 's', 'hello'); expect(await cache.get('t1', 's')).toBe('hello'); });
  it('store number', async () => { await cache.set('t1', 'n', 42); expect(await cache.get('t1', 'n')).toBe(42); });
  it('store array', async () => { await cache.set('t1', 'a', [1,2,3]); expect(await cache.get('t1', 'a')).toEqual([1,2,3]); });
  it('store boolean', async () => { await cache.set('t1', 'b', true); expect(await cache.get('t1', 'b')).toBe(true); });
  it('tenant isolation', async () => {
    await cache.set('t1', 'd', { a: 1 }); await cache.set('t2', 'd', { b: 2 });
    expect(await cache.get('t1', 'd')).toEqual({ a: 1 });
    expect(await cache.get('t2', 'd')).toEqual({ b: 2 });
  });
});

describe('set with TTL', () => {
  it('stores with TTL', async () => {
    await cache.set('t1', 'tmp', 'v', { ttl: 3600 });
    expect(await cache.get('t1', 'tmp')).toBe('v');
  });
});

describe('getRaw / setRaw', () => {
  it('full key operations', async () => {
    await cache.setRaw('etip:session:x', { userId: 'u1' }, { ttl: 900 });
    expect(await cache.getRaw<{ userId: string }>('etip:session:x')).toEqual({ userId: 'u1' });
  });
});

describe('getOrSet', () => {
  it('returns cached on hit', async () => {
    await cache.set('t1', 'cached', 'existing');
    let called = false;
    const r = await cache.getOrSet('t1', 'cached', 60, async () => { called = true; return 'new'; });
    expect(r).toBe('existing'); expect(called).toBe(false);
  });
  it('calls factory on miss and caches', async () => {
    let calls = 0;
    const r1 = await cache.getOrSet('t1', 'miss', 60, async () => { calls++; return { computed: true }; });
    expect(r1).toEqual({ computed: true }); expect(calls).toBe(1);
    const r2 = await cache.getOrSet('t1', 'miss', 60, async () => { calls++; return { computed: false }; });
    expect(r2).toEqual({ computed: true }); expect(calls).toBe(1);
  });
});

describe('invalidate', () => {
  it('deletes single key', async () => {
    await cache.set('t1', 'del', 'v');
    expect(await cache.invalidate('t1', 'del')).toBe(1);
    expect(await cache.get('t1', 'del')).toBeNull();
  });
  it('returns 0 for missing', async () => { expect(await cache.invalidate('t1', 'nope')).toBe(0); });
});

describe('invalidateTenant', () => {
  it('deletes all tenant keys', async () => {
    await cache.set('t1', 'a', 'a'); await cache.set('t1', 'b', 'b'); await cache.set('t1', 'c', 'c');
    await cache.set('t2', 'a', 'other');
    expect(await cache.invalidateTenant('t1')).toBe(3);
    expect(await cache.get('t1', 'a')).toBeNull();
    expect(await cache.get('t2', 'a')).toBe('other');
  });
  it('returns 0 for empty tenant', async () => { expect(await cache.invalidateTenant('empty')).toBe(0); });
});

describe('invalidateRaw', () => {
  it('deletes by full key', async () => {
    await cache.setRaw('etip:session:y', 'data');
    expect(await cache.invalidateRaw('etip:session:y')).toBe(1);
  });
});

describe('exists', () => {
  it('true for existing', async () => { await cache.set('t1', 'e', 'y'); expect(await cache.exists('t1', 'e')).toBe(true); });
  it('false for missing', async () => { expect(await cache.exists('t1', 'nope')).toBe(false); });
});

describe('ttl', () => {
  it('-2 for non-existent', async () => { expect(await cache.ttl('t1', 'nope')).toBe(-2); });
  it('-1 for no expiry', async () => { await cache.set('t1', 'perm', 'd'); expect(await cache.ttl('t1', 'perm')).toBe(-1); });
  it('positive for expiring', async () => { await cache.set('t1', 'exp', 'd', { ttl: 3600 }); const t = await cache.ttl('t1', 'exp'); expect(t).toBeGreaterThan(0); expect(t).toBeLessThanOrEqual(3600); });
});

describe('ping', () => {
  it('returns PONG', async () => { expect(await cache.ping()).toBe('PONG'); });
});
