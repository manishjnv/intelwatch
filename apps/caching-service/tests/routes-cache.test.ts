import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

function createMockCacheManager() {
  return {
    getStats: vi.fn().mockResolvedValue({
      keyspaceHits: 1000, keyspaceMisses: 200, hitRate: 83.33,
      usedMemoryBytes: 5242880, usedMemoryHuman: '5.00M',
      totalKeys: 42, connectedClients: 5, uptimeSeconds: 86400,
    }),
    getNamespaces: vi.fn().mockResolvedValue([
      { namespace: 'dashboard', keyCount: 15 },
      { namespace: 'ioc', keyCount: 10 },
    ]),
    listKeys: vi.fn().mockResolvedValue({ keys: ['etip:t1:dashboard:w1'], cursor: '0', hasMore: false }),
    invalidateKey: vi.fn().mockResolvedValue(1),
    invalidateByPrefix: vi.fn().mockResolvedValue(5),
    invalidateTenant: vi.fn().mockResolvedValue(10),
    warmDashboard: vi.fn().mockResolvedValue({ success: true, widgetsWarmed: 7, durationMs: 150 }),
    ping: vi.fn().mockResolvedValue(true),
  };
}

function createMockInvalidator() {
  return {
    getStats: vi.fn().mockReturnValue({
      running: true, bufferSize: 0,
      totalEventsProcessed: 50, totalFlushes: 10, totalKeysInvalidated: 120,
    }),
  };
}

describe('Cache Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let mockManager: ReturnType<typeof createMockCacheManager>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockManager = createMockCacheManager();
    const mockInvalidator = createMockInvalidator();
    const config = loadConfig({ TI_LOG_LEVEL: 'silent' });

    app = await buildApp({
      config,
      healthDeps: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cacheManager: mockManager as any,
        minioConnected: async () => true,
      },
      cacheDeps: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cacheManager: mockManager as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cacheInvalidator: mockInvalidator as any,
        analyticsUrl: 'http://analytics:3024',
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Health ──
  describe('GET /health', () => {
    it('returns ok with redis and minio status', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('caching-service');
      expect(body.redisConnected).toBe(true);
      expect(body.minioConnected).toBe(true);
    });

    it('returns degraded when redis is down', async () => {
      mockManager.ping.mockResolvedValueOnce(false);
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(JSON.parse(res.payload).status).toBe('degraded');
    });
  });

  describe('GET /ready', () => {
    it('returns ready=true', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).ready).toBe(true);
    });
  });

  // ── Cache Stats ──
  describe('GET /api/v1/cache/stats', () => {
    it('returns redis and invalidator stats', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/cache/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.redis.hitRate).toBe(83.33);
      expect(body.data.invalidator.running).toBe(true);
    });
  });

  // ── Cache Keys ──
  describe('GET /api/v1/cache/keys', () => {
    it('returns keys with default prefix', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/cache/keys' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.keys).toHaveLength(1);
    });

    it('accepts prefix parameter', async () => {
      await app.inject({ method: 'GET', url: '/api/v1/cache/keys?prefix=etip:t1:dashboard:' });
      expect(mockManager.listKeys).toHaveBeenCalledWith('etip:t1:dashboard:', '0', 100);
    });
  });

  // ── Delete Key ──
  describe('DELETE /api/v1/cache/keys/:key', () => {
    it('deletes a specific key', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/cache/keys/etip%3At1%3Adashboard%3Aw1' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).data.deleted).toBe(true);
    });

    it('rejects non-etip keys', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/cache/keys/random-key' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Delete Prefix ──
  describe('DELETE /api/v1/cache/prefix/:prefix', () => {
    it('invalidates all keys with prefix', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/cache/prefix/etip%3At1%3Adashboard%3A' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).data.deletedCount).toBe(5);
    });

    it('rejects non-etip prefix', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/cache/prefix/other%3A' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Warm ──
  describe('POST /api/v1/cache/warm', () => {
    it('warms dashboard cache', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/cache/warm' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.success).toBe(true);
      expect(body.data.widgetsWarmed).toBe(7);
    });
  });

  // ── Namespaces ──
  describe('GET /api/v1/cache/namespaces', () => {
    it('returns namespace breakdown', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/cache/namespaces' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(25);
    });
  });

  // ── Invalidate Tenant ──
  describe('POST /api/v1/cache/invalidate-tenant/:tenantId', () => {
    it('flushes tenant cache', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/cache/invalidate-tenant/tenant-1' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.tenantId).toBe('tenant-1');
      expect(body.data.deletedCount).toBe(10);
    });
  });

  // ── 404 ──
  describe('404 handling', () => {
    it('returns 404 for unknown route', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/cache/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });
});
