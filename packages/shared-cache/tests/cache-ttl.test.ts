/**
 * @module @etip/shared-cache/tests/cache-ttl
 * @description Tests for TTL constants and key pattern builders.
 */
import { describe, it, expect } from 'vitest';
import { CACHE_TTL, CACHE_PREFIX, KEY_PATTERNS } from '../src/index.js';

describe('CACHE_TTL', () => {
  it('dashboard is 48 hours (172800 seconds)', () => {
    expect(CACHE_TTL.dashboard).toBe(172800);
  });

  it('iocSearch is 1 hour (3600 seconds)', () => {
    expect(CACHE_TTL.iocSearch).toBe(3600);
  });

  it('enrichment.ip is 1 hour', () => {
    expect(CACHE_TTL.enrichment.ip).toBe(3600);
  });

  it('enrichment.domain is 24 hours', () => {
    expect(CACHE_TTL.enrichment.domain).toBe(86400);
  });

  it('enrichment.hash is 7 days', () => {
    expect(CACHE_TTL.enrichment.hash).toBe(604800);
  });

  it('enrichment.cve is 12 hours', () => {
    expect(CACHE_TTL.enrichment.cve).toBe(43200);
  });

  it('userSession is 15 minutes (900 seconds)', () => {
    expect(CACHE_TTL.userSession).toBe(900);
  });

  it('feedData is 30 minutes (1800 seconds)', () => {
    expect(CACHE_TTL.feedData).toBe(1800);
  });
});

describe('CACHE_PREFIX', () => {
  it('is "etip"', () => {
    expect(CACHE_PREFIX).toBe('etip');
  });
});

describe('KEY_PATTERNS', () => {
  it('builds dashboard key', () => {
    const key = KEY_PATTERNS.dashboard('tenant-1', 'overview');
    expect(key).toBe('etip:tenant-1:dashboard:overview');
  });

  it('builds iocSearch key', () => {
    const key = KEY_PATTERNS.iocSearch('tenant-1', 'abc123hash');
    expect(key).toBe('etip:tenant-1:ioc-search:abc123hash');
  });

  it('builds enrichment key', () => {
    const key = KEY_PATTERNS.enrichment('tenant-1', 'ip', '8.8.8.8');
    expect(key).toBe('etip:tenant-1:enrich:ip:8.8.8.8');
  });

  it('builds session key (global, no tenant)', () => {
    const key = KEY_PATTERNS.session('sess-abc-123');
    expect(key).toBe('etip:session:sess-abc-123');
  });

  it('builds feed key', () => {
    const key = KEY_PATTERNS.feed('tenant-1', 'feed-uuid');
    expect(key).toBe('etip:tenant-1:feed:feed-uuid');
  });

  it('builds tenant wildcard', () => {
    const key = KEY_PATTERNS.tenantWildcard('tenant-1');
    expect(key).toBe('etip:tenant-1:*');
  });
});
