import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CacheInvalidator } from '../src/services/cache-invalidator.js';

function createMockCacheManager() {
  return {
    invalidateByPrefix: vi.fn().mockResolvedValue(3),
  };
}

describe('CacheInvalidator', () => {
  let invalidator: CacheInvalidator;
  let mockManager: ReturnType<typeof createMockCacheManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockManager = createMockCacheManager();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invalidator = new CacheInvalidator({ cacheManager: mockManager as any, flushIntervalMs: 100 });
  });

  afterEach(async () => {
    await invalidator.stop();
    vi.useRealTimers();
  });

  describe('recordEvent', () => {
    it('buffers events for known event types', () => {
      invalidator.recordEvent('ioc.created', 'tenant-1');
      expect(invalidator.totalEventsProcessed).toBe(1);
    });

    it('ignores unknown event types', () => {
      invalidator.recordEvent('unknown.event', 'tenant-1');
      expect(invalidator.totalEventsProcessed).toBe(0);
    });

    it('coalesces multiple events for the same tenant', () => {
      invalidator.recordEvent('ioc.created', 'tenant-1');
      invalidator.recordEvent('ioc.updated', 'tenant-1');
      invalidator.recordEvent('feed.fetched', 'tenant-1');
      expect(invalidator.totalEventsProcessed).toBe(3);
      const stats = invalidator.getStats();
      expect(stats.bufferSize).toBe(1);
    });

    it('tracks separate entries for different tenants', () => {
      invalidator.recordEvent('ioc.created', 'tenant-1');
      invalidator.recordEvent('ioc.created', 'tenant-2');
      expect(invalidator.getStats().bufferSize).toBe(2);
    });
  });

  describe('severity-aware invalidation (#1)', () => {
    it('skips dashboard for IOC events without severity context', async () => {
      invalidator.recordEvent('ioc.created', 'tenant-1');
      await invalidator.flush();

      // Only 'ioc' namespace — no 'dashboard' because no severity provided
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:ioc');
      expect(mockManager.invalidateByPrefix).not.toHaveBeenCalledWith('etip:tenant-1:dashboard');
    });

    it('skips dashboard for LOW severity IOC events', async () => {
      invalidator.recordEvent('ioc.created', 'tenant-1', { severity: 'low' });
      await invalidator.flush();

      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:ioc');
      expect(mockManager.invalidateByPrefix).not.toHaveBeenCalledWith('etip:tenant-1:dashboard');
    });

    it('skips dashboard for MEDIUM severity IOC events', async () => {
      invalidator.recordEvent('ioc.enriched', 'tenant-1', { severity: 'medium' });
      await invalidator.flush();

      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:enrich');
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:ioc');
      expect(mockManager.invalidateByPrefix).not.toHaveBeenCalledWith('etip:tenant-1:dashboard');
    });

    it('includes dashboard for HIGH severity IOC events', async () => {
      invalidator.recordEvent('ioc.created', 'tenant-1', { severity: 'high' });
      await invalidator.flush();

      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:ioc');
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:dashboard');
    });

    it('includes dashboard for CRITICAL severity IOC events', async () => {
      invalidator.recordEvent('ioc.enriched', 'tenant-1', { severity: 'CRITICAL' });
      await invalidator.flush();

      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:enrich');
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:ioc');
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:dashboard');
    });

    it('always includes dashboard for non-IOC events (feed.fetched)', async () => {
      invalidator.recordEvent('feed.fetched', 'tenant-1');
      await invalidator.flush();

      // feed.fetched has dashboard in 'always' — not severity-gated
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:feed');
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:dashboard');
    });

    it('always includes dashboard for actor.updated', async () => {
      invalidator.recordEvent('actor.updated', 'tenant-1');
      await invalidator.flush();

      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:actor');
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:dashboard');
    });
  });

  describe('flush', () => {
    it('invalidates correct namespace prefixes for high-severity IOC', async () => {
      invalidator.recordEvent('ioc.created', 'tenant-1', { severity: 'critical' });
      const count = await invalidator.flush();

      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:ioc');
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:dashboard');
      expect(count).toBe(6); // 3 + 3 from two prefixes
    });

    it('clears buffer after flush', async () => {
      invalidator.recordEvent('ioc.created', 'tenant-1');
      await invalidator.flush();
      expect(invalidator.getStats().bufferSize).toBe(0);
    });

    it('returns 0 when buffer is empty', async () => {
      const count = await invalidator.flush();
      expect(count).toBe(0);
      expect(mockManager.invalidateByPrefix).not.toHaveBeenCalled();
    });

    it('handles invalidation errors gracefully', async () => {
      mockManager.invalidateByPrefix.mockRejectedValueOnce(new Error('Redis error'));
      invalidator.recordEvent('ioc.created', 'tenant-1');
      await expect(invalidator.flush()).resolves.toBeDefined();
    });

    it('deduplicates namespace prefixes across events', async () => {
      // Both events map to 'ioc' always — no dashboard without severity
      invalidator.recordEvent('ioc.created', 'tenant-1');
      invalidator.recordEvent('ioc.updated', 'tenant-1');
      await invalidator.flush();

      // Only 'ioc' once (deduped via Set)
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledTimes(1);
      expect(mockManager.invalidateByPrefix).toHaveBeenCalledWith('etip:tenant-1:ioc');
    });
  });

  describe('start/stop lifecycle', () => {
    it('starts flush timer', () => {
      invalidator.start();
      expect(invalidator.getStats().running).toBe(true);
    });

    it('stops flush timer', async () => {
      invalidator.start();
      await invalidator.stop();
      expect(invalidator.getStats().running).toBe(false);
    });

    it('flushes remaining buffer on stop', async () => {
      invalidator.start();
      invalidator.recordEvent('feed.fetched', 'tenant-1');
      await invalidator.stop();
      expect(mockManager.invalidateByPrefix).toHaveBeenCalled();
    });

    it('auto-flushes after interval', async () => {
      invalidator.start();
      invalidator.recordEvent('ioc.created', 'tenant-1');
      await vi.advanceTimersByTimeAsync(150);
      expect(invalidator.totalFlushes).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStats', () => {
    it('returns correct counters', async () => {
      invalidator.recordEvent('ioc.created', 'tenant-1');
      invalidator.recordEvent('feed.fetched', 'tenant-2');
      await invalidator.flush();

      const stats = invalidator.getStats();
      expect(stats.totalEventsProcessed).toBe(2);
      expect(stats.totalFlushes).toBe(1);
      expect(stats.totalKeysInvalidated).toBeGreaterThan(0);
      expect(stats.bufferSize).toBe(0);
    });
  });
});
