import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnrichmentCache, CACHE_TTLS } from '../src/cache.js';
import type { EnrichmentResult } from '../src/schema.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function mockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
}

const SAMPLE_RESULT: EnrichmentResult = {
  vtResult: null, abuseipdbResult: null, haikuResult: null,
  enrichedAt: '2026-03-22T00:00:00Z', enrichmentStatus: 'enriched',
  failureReason: null, externalRiskScore: 50, costBreakdown: null,
};

describe('EnrichmentCache', () => {
  let redis: ReturnType<typeof mockRedis>;

  beforeEach(() => {
    redis = mockRedis();
  });

  describe('isAvailable', () => {
    it('returns true when Redis is connected', () => {
      const cache = new EnrichmentCache(redis as never, logger);
      expect(cache.isAvailable()).toBe(true);
    });

    it('returns false when Redis is null', () => {
      const cache = new EnrichmentCache(null, logger);
      expect(cache.isAvailable()).toBe(false);
    });
  });

  describe('get', () => {
    it('returns null on cache miss', async () => {
      const cache = new EnrichmentCache(redis as never, logger);
      const result = await cache.get('ip', '1.2.3.4');
      expect(result).toBeNull();
      expect(redis.get).toHaveBeenCalledWith('enrichment:ip:1.2.3.4');
    });

    it('returns parsed result on cache hit', async () => {
      redis.get.mockResolvedValue(JSON.stringify(SAMPLE_RESULT));
      const cache = new EnrichmentCache(redis as never, logger);
      const result = await cache.get('ip', '1.2.3.4');
      expect(result).not.toBeNull();
      expect(result!.enrichmentStatus).toBe('enriched');
    });

    it('returns null when Redis unavailable', async () => {
      const cache = new EnrichmentCache(null, logger);
      const result = await cache.get('ip', '1.2.3.4');
      expect(result).toBeNull();
    });

    it('returns null on Redis error (graceful)', async () => {
      redis.get.mockRejectedValue(new Error('Connection refused'));
      const cache = new EnrichmentCache(redis as never, logger);
      const result = await cache.get('ip', '1.2.3.4');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('stores result with type-specific TTL for hash', async () => {
      const cache = new EnrichmentCache(redis as never, logger);
      await cache.set('hash_sha256', 'abc123', SAMPLE_RESULT);
      expect(redis.setex).toHaveBeenCalledWith(
        'enrichment:hash_sha256:abc123',
        CACHE_TTLS.hash_sha256,
        JSON.stringify(SAMPLE_RESULT),
      );
    });

    it('uses 1h TTL for IP addresses', async () => {
      const cache = new EnrichmentCache(redis as never, logger);
      await cache.set('ip', '1.2.3.4', SAMPLE_RESULT);
      expect(redis.setex).toHaveBeenCalledWith(
        'enrichment:ip:1.2.3.4',
        3600,
        expect.any(String),
      );
    });

    it('skips set when Redis unavailable', async () => {
      const cache = new EnrichmentCache(null, logger);
      await cache.set('ip', '1.2.3.4', SAMPLE_RESULT);
      // No error thrown, just silently skipped
    });

    it('handles Redis error gracefully on set', async () => {
      redis.setex.mockRejectedValue(new Error('Write failed'));
      const cache = new EnrichmentCache(redis as never, logger);
      // Should not throw
      await expect(cache.set('ip', '1.2.3.4', SAMPLE_RESULT)).resolves.toBeUndefined();
    });
  });

  describe('invalidate', () => {
    it('deletes cache entry', async () => {
      const cache = new EnrichmentCache(redis as never, logger);
      await cache.invalidate('ip', '1.2.3.4');
      expect(redis.del).toHaveBeenCalledWith('enrichment:ip:1.2.3.4');
    });
  });

  describe('TTL configuration', () => {
    it('uses default 1h TTL for unknown IOC types', async () => {
      const cache = new EnrichmentCache(redis as never, logger);
      await cache.set('custom_type', 'value', SAMPLE_RESULT);
      expect(redis.setex).toHaveBeenCalledWith(
        'enrichment:custom_type:value',
        3600,
        expect.any(String),
      );
    });

    it('accepts TTL overrides', async () => {
      const cache = new EnrichmentCache(redis as never, logger, { ip: 999 });
      await cache.set('ip', '1.2.3.4', SAMPLE_RESULT);
      expect(redis.setex).toHaveBeenCalledWith(
        'enrichment:ip:1.2.3.4',
        999,
        expect.any(String),
      );
    });
  });
});
