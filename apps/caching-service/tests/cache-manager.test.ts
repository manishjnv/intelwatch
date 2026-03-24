import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager } from '../src/services/cache-manager.js';

// Mock Redis
function createMockRedis() {
  return {
    info: vi.fn(),
    dbsize: vi.fn().mockResolvedValue(42),
    scan: vi.fn().mockResolvedValue(['0', []]),
    del: vi.fn().mockResolvedValue(1),
    ping: vi.fn().mockResolvedValue('PONG'),
  };
}

// Mock CacheService
function createMockCacheService() {
  return {
    invalidateTenant: vi.fn().mockResolvedValue(5),
  };
}

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('CacheManager', () => {
  let manager: CacheManager;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockCacheService: ReturnType<typeof createMockCacheService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = createMockRedis();
    mockCacheService = createMockCacheService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    manager = new CacheManager({ redis: mockRedis as any, cacheService: mockCacheService as any });
  });

  describe('getStats', () => {
    it('parses Redis INFO output for hit/miss stats', async () => {
      mockRedis.info.mockImplementation((section: string) => {
        if (section === 'stats') return 'keyspace_hits:1000\r\nkeyspace_misses:250\r\n';
        if (section === 'memory') return 'used_memory:5242880\r\nused_memory_human:5.00M\r\n';
        if (section === 'clients') return 'connected_clients:12\r\n';
        if (section === 'server') return 'uptime_in_seconds:86400\r\n';
        return '';
      });

      const stats = await manager.getStats();
      expect(stats.keyspaceHits).toBe(1000);
      expect(stats.keyspaceMisses).toBe(250);
      expect(stats.hitRate).toBe(80);
      expect(stats.usedMemoryBytes).toBe(5242880);
      expect(stats.usedMemoryHuman).toBe('5.00M');
      expect(stats.totalKeys).toBe(42);
      expect(stats.connectedClients).toBe(12);
      expect(stats.uptimeSeconds).toBe(86400);
    });

    it('returns 0 hit rate when no requests', async () => {
      mockRedis.info.mockResolvedValue('keyspace_hits:0\r\nkeyspace_misses:0\r\n');
      const stats = await manager.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('handles missing INFO fields gracefully', async () => {
      mockRedis.info.mockResolvedValue('');
      const stats = await manager.getStats();
      expect(stats.keyspaceHits).toBe(0);
      expect(stats.keyspaceMisses).toBe(0);
      expect(stats.usedMemoryHuman).toBe('0B');
    });
  });

  describe('getNamespaces', () => {
    it('groups keys by namespace', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['0', [
          'etip:tenant1:dashboard:w1',
          'etip:tenant1:dashboard:w2',
          'etip:tenant1:ioc:1.2.3.4',
          'etip:tenant2:feed:rss1',
        ]]);

      const ns = await manager.getNamespaces();
      expect(ns).toHaveLength(3);
      expect(ns.find((n) => n.namespace === 'dashboard')?.keyCount).toBe(2);
      expect(ns.find((n) => n.namespace === 'ioc')?.keyCount).toBe(1);
      expect(ns.find((n) => n.namespace === 'feed')?.keyCount).toBe(1);
    });

    it('returns empty when no etip keys exist', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);
      const ns = await manager.getNamespaces();
      expect(ns).toHaveLength(0);
    });

    it('handles multi-pass SCAN', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['5', ['etip:t1:dashboard:w1']])
        .mockResolvedValueOnce(['0', ['etip:t1:dashboard:w2']]);

      const ns = await manager.getNamespaces();
      expect(ns.find((n) => n.namespace === 'dashboard')?.keyCount).toBe(2);
    });
  });

  describe('listKeys', () => {
    it('returns keys matching prefix', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['etip:t1:dashboard:w1', 'etip:t1:dashboard:w2']]);
      const result = await manager.listKeys('etip:t1:dashboard:');
      expect(result.keys).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBe('0');
    });

    it('signals hasMore when cursor is not 0', async () => {
      mockRedis.scan.mockResolvedValueOnce(['10', ['key1']]);
      const result = await manager.listKeys('etip:', '0', 1);
      expect(result.hasMore).toBe(true);
      expect(result.cursor).toBe('10');
    });
  });

  describe('invalidateKey', () => {
    it('deletes a single key', async () => {
      const result = await manager.invalidateKey('etip:t1:dashboard:w1');
      expect(mockRedis.del).toHaveBeenCalledWith('etip:t1:dashboard:w1');
      expect(result).toBe(1);
    });
  });

  describe('invalidateByPrefix', () => {
    it('scans and batch-deletes matching keys', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['5', ['k1', 'k2']])
        .mockResolvedValueOnce(['0', ['k3']]);
      mockRedis.del.mockResolvedValue(2).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      const deleted = await manager.invalidateByPrefix('etip:t1:');
      expect(deleted).toBe(3);
    });

    it('returns 0 when no keys match', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);
      const deleted = await manager.invalidateByPrefix('etip:nonexistent:');
      expect(deleted).toBe(0);
    });
  });

  describe('invalidateTenant', () => {
    it('delegates to CacheService.invalidateTenant', async () => {
      const result = await manager.invalidateTenant('tenant-abc');
      expect(mockCacheService.invalidateTenant).toHaveBeenCalledWith('tenant-abc');
      expect(result).toBe(5);
    });
  });

  describe('warmDashboard', () => {
    it('calls analytics-service and returns widget count', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { widgets: { w1: {}, w2: {}, w3: {} } } }),
      });

      const result = await manager.warmDashboard('http://analytics:3024');
      expect(result.success).toBe(true);
      expect(result.widgetsWarmed).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns failure on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const result = await manager.warmDashboard('http://analytics:3024');
      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('handles network error gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await manager.warmDashboard('http://analytics:3024');
      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });
  });

  describe('ping', () => {
    it('returns true on PONG', async () => {
      expect(await manager.ping()).toBe(true);
    });

    it('returns false on error', async () => {
      mockRedis.ping.mockRejectedValueOnce(new Error('disconnected'));
      expect(await manager.ping()).toBe(false);
    });
  });
});
