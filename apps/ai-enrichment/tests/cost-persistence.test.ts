import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CostPersistence } from '../src/cost-persistence.js';
import { EnrichmentCostTracker } from '../src/cost-tracker.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function mockRedis(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    keys: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as any;
}

describe('CostPersistence', () => {
  let costTracker: EnrichmentCostTracker;

  beforeEach(() => {
    costTracker = new EnrichmentCostTracker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadFromRedis', () => {
    it('loads baseline stats when Redis has stored data', async () => {
      const stored = { totalCostUsd: 1.50, totalIOCsEnriched: 100 };
      const redis = mockRedis({ get: vi.fn().mockResolvedValue(JSON.stringify(stored)) });
      const cp = new CostPersistence(redis, costTracker, logger);

      await cp.loadFromRedis();
      expect(cp.getBaselineStats()).toEqual(stored);
    });

    it('restores tenant spend from Redis keys', async () => {
      const redis = mockRedis({
        keys: vi.fn().mockResolvedValue([
          'etip:enrichment:cost:tenant:tenant-1',
          'etip:enrichment:cost:tenant:tenant-2',
        ]),
        get: vi.fn()
          .mockResolvedValueOnce(null) // stats key
          .mockResolvedValueOnce('0.50')
          .mockResolvedValueOnce('1.25'),
      });

      const addSpy = vi.spyOn(costTracker, 'addTenantSpend');
      const cp = new CostPersistence(redis, costTracker, logger);
      await cp.loadFromRedis();

      expect(addSpy).toHaveBeenCalledWith('tenant-1', 0.50);
      expect(addSpy).toHaveBeenCalledWith('tenant-2', 1.25);
    });

    it('handles Redis errors gracefully', async () => {
      const redis = mockRedis({ get: vi.fn().mockRejectedValue(new Error('conn refused')) });
      const cp = new CostPersistence(redis, costTracker, logger);

      await expect(cp.loadFromRedis()).resolves.toBeUndefined();
      expect(cp.getBaselineStats()).toBeNull();
    });

    it('skips when redis is null', async () => {
      const cp = new CostPersistence(null, costTracker, logger);
      await cp.loadFromRedis();
      expect(cp.getBaselineStats()).toBeNull();
    });
  });

  describe('flushToRedis', () => {
    it('stores aggregate stats in Redis with TTL', async () => {
      const redis = mockRedis();
      const cp = new CostPersistence(redis, costTracker, logger);

      // Track some data
      costTracker.trackProvider('ioc-1', 'ip', 'haiku_triage', 100, 50, 'haiku', 200);

      await cp.flushToRedis();

      expect(redis.set).toHaveBeenCalledWith(
        'etip:enrichment:cost:stats',
        expect.any(String),
        'EX',
        604800, // 7 days
      );
    });

    it('handles Redis errors gracefully on flush', async () => {
      const redis = mockRedis({ set: vi.fn().mockRejectedValue(new Error('write error')) });
      const cp = new CostPersistence(redis, costTracker, logger);
      await expect(cp.flushToRedis()).resolves.toBeUndefined();
    });
  });

  describe('flushTenantSpend', () => {
    it('persists tenant spend to Redis', async () => {
      const redis = mockRedis();
      const cp = new CostPersistence(redis, costTracker, logger);

      costTracker.addTenantSpend('tenant-1', 0.75);
      await cp.flushTenantSpend('tenant-1');

      expect(redis.set).toHaveBeenCalledWith(
        'etip:enrichment:cost:tenant:tenant-1',
        '0.75',
        'EX',
        86400, // 24h
      );
    });

    it('skips when spend is 0', async () => {
      const redis = mockRedis();
      const cp = new CostPersistence(redis, costTracker, logger);
      await cp.flushTenantSpend('tenant-empty');
      expect(redis.set).not.toHaveBeenCalled();
    });
  });

  describe('periodic flush', () => {
    it('starts and stops periodic flush timer', async () => {
      const redis = mockRedis();
      const cp = new CostPersistence(redis, costTracker, logger, 100);

      cp.startPeriodicFlush();
      // Starting again is a no-op
      cp.startPeriodicFlush();

      await cp.stop();
      // Final flush should have been called
      expect(redis.set).toHaveBeenCalled();
    });
  });
});
