import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { ArchiveStore } from '../src/services/archive-store.js';

function createMockArchiveEngine(store: ArchiveStore) {
  return {
    getStatus: vi.fn().mockReturnValue({
      cronRunning: true, lastRunAt: '2026-03-24T02:00:00Z',
      lastRunResult: 'success', lastRunRecords: 250,
      nextRunAt: '2026-03-25T02:00:00Z', totalRuns: 5,
    }),
    runOnce: vi.fn().mockImplementation(async (tenantId: string) => {
      return store.create({
        tenantId,
        entityType: 'ioc',
        recordCount: 50,
        fileSizeBytes: 2048,
        compressionRatio: 0.7,
        dateRangeStart: '2025-11-01T00:00:00Z',
        dateRangeEnd: '2025-12-31T00:00:00Z',
        objectKey: 'archive/default/ioc/test.jsonl.gz',
        status: 'completed',
      });
    }),
    restore: vi.fn().mockResolvedValue([
      { id: '1', type: 'ioc', value: '1.2.3.4', tenantId: 'default', createdAt: '2025-11-01T00:00:00Z' },
    ]),
  };
}

describe('Archive Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let store: ArchiveStore;
  let mockEngine: ReturnType<typeof createMockArchiveEngine>;

  beforeEach(async () => {
    vi.clearAllMocks();
    store = new ArchiveStore();
    mockEngine = createMockArchiveEngine(store);
    const config = loadConfig({ TI_LOG_LEVEL: 'silent' });

    app = await buildApp({
      config,
      archiveDeps: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        archiveEngine: mockEngine as any,
        archiveStore: store,
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Archive Status ──
  describe('GET /api/v1/archive/status', () => {
    it('returns archive engine status', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/archive/status' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.cronRunning).toBe(true);
      expect(body.data.totalRuns).toBe(5);
    });
  });

  // ── Run Archive ──
  describe('POST /api/v1/archive/run', () => {
    it('triggers manual archive and returns manifest', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/archive/run',
        payload: { tenantId: 'tenant-1' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.tenantId).toBe('tenant-1');
      expect(body.data.entityType).toBe('ioc');
    });

    it('returns 200 with message when no records', async () => {
      mockEngine.runOnce.mockResolvedValueOnce(null);
      const res = await app.inject({ method: 'POST', url: '/api/v1/archive/run' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).data.message).toContain('no records');
    });

    it('uses default tenantId when not provided', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/archive/run' });
      expect(mockEngine.runOnce).toHaveBeenCalledWith('default');
    });
  });

  // ── List Manifests ──
  describe('GET /api/v1/archive/manifests', () => {
    it('returns empty list when no manifests', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/archive/manifests' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('returns manifests with pagination', async () => {
      store.create({
        tenantId: 't1', entityType: 'ioc', recordCount: 100, fileSizeBytes: 1000,
        compressionRatio: 0.7, dateRangeStart: '2025-11-01', dateRangeEnd: '2025-12-01',
        objectKey: 'a.gz', status: 'completed',
      });
      store.create({
        tenantId: 't1', entityType: 'malware', recordCount: 50, fileSizeBytes: 500,
        compressionRatio: 0.6, dateRangeStart: '2025-11-01', dateRangeEnd: '2025-12-01',
        objectKey: 'b.gz', status: 'completed',
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/archive/manifests?page=1&limit=1' });
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(1);
      expect(body.total).toBe(2);
    });

    it('filters by entityType', async () => {
      store.create({
        tenantId: 't1', entityType: 'ioc', recordCount: 100, fileSizeBytes: 1000,
        compressionRatio: 0.7, dateRangeStart: '2025-11-01', dateRangeEnd: '2025-12-01',
        objectKey: 'a.gz', status: 'completed',
      });
      store.create({
        tenantId: 't1', entityType: 'malware', recordCount: 50, fileSizeBytes: 500,
        compressionRatio: 0.6, dateRangeStart: '2025-11-01', dateRangeEnd: '2025-12-01',
        objectKey: 'b.gz', status: 'completed',
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/archive/manifests?entityType=ioc' });
      const body = JSON.parse(res.payload);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].entityType).toBe('ioc');
    });
  });

  // ── Get Manifest ──
  describe('GET /api/v1/archive/manifests/:id', () => {
    it('returns manifest by id', async () => {
      const m = store.create({
        tenantId: 't1', entityType: 'ioc', recordCount: 100, fileSizeBytes: 1000,
        compressionRatio: 0.7, dateRangeStart: '2025-11-01', dateRangeEnd: '2025-12-01',
        objectKey: 'a.gz', status: 'completed',
      });

      const res = await app.inject({ method: 'GET', url: `/api/v1/archive/manifests/${m.id}` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).data.id).toBe(m.id);
    });

    it('returns 404 for unknown id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/archive/manifests/bad-id' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Restore ──
  describe('POST /api/v1/archive/restore/:manifestId', () => {
    it('restores archived data', async () => {
      const m = store.create({
        tenantId: 't1', entityType: 'ioc', recordCount: 100, fileSizeBytes: 1000,
        compressionRatio: 0.7, dateRangeStart: '2025-11-01', dateRangeEnd: '2025-12-01',
        objectKey: 'a.gz', status: 'completed',
      });

      const res = await app.inject({ method: 'POST', url: `/api/v1/archive/restore/${m.id}` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.manifestId).toBe(m.id);
      expect(body.data.recordsRestored).toBe(1);
    });

    it('returns 404 for unknown manifest', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/archive/restore/bad-id' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Archive Stats ──
  describe('GET /api/v1/archive/stats', () => {
    it('returns aggregate statistics', async () => {
      store.create({
        tenantId: 't1', entityType: 'ioc', recordCount: 100, fileSizeBytes: 1000,
        compressionRatio: 0.7, dateRangeStart: '2025-11-01', dateRangeEnd: '2025-12-01',
        objectKey: 'a.gz', status: 'completed',
      });

      const res = await app.inject({ method: 'GET', url: '/api/v1/archive/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.totalManifests).toBe(1);
      expect(body.data.totalRecords).toBe(100);
      expect(body.data.archiveFormat).toBe('jsonl+gzip');
    });

    it('returns zeros when no archives', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/archive/stats' });
      const body = JSON.parse(res.payload);
      expect(body.data.totalManifests).toBe(0);
      expect(body.data.totalRecords).toBe(0);
    });
  });
});
