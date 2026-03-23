import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const mockIndexer = {
  indexIOC: vi.fn().mockResolvedValue(undefined),
  updateIOC: vi.fn().mockResolvedValue(undefined),
  deleteIOC: vi.fn().mockResolvedValue(undefined),
  reindexTenant: vi.fn().mockResolvedValue({ indexed: 5, failed: 0 }),
};

vi.mock('../src/es-client.js', () => ({
  EsIndexClient: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue(true),
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    indexDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    search: vi.fn().mockResolvedValue({ total: 0, hits: [], aggregations: {} }),
    bulkIndex: vi.fn().mockResolvedValue({ indexed: 0, failed: 0 }),
    countDocs: vi.fn().mockResolvedValue(0),
  })),
  getIndexName: vi.fn((t: string) => `etip_${t}_iocs`),
}));

vi.mock('../src/ioc-indexer.js', () => ({
  IocIndexer: vi.fn(() => mockIndexer),
}));

vi.mock('../src/worker.js', () => ({
  IocIndexWorker: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    getQueueDepth: vi.fn().mockResolvedValue(0),
  })),
}));

const config = loadConfig({
  TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!',
  TI_SERVICE_JWT_SECRET: 'dev-service-secret!!',
});

describe('Reindex Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config });
    vi.mocked(mockIndexer.reindexTenant).mockResolvedValue({ indexed: 5, failed: 0 });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/v1/search/reindex', () => {
    it('returns 202 with accepted message', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        body: { tenantId: 'tenant-abc', iocs: [] },
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.data.status).toBe('accepted');
    });

    it('returns indexed and failed counts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        body: { tenantId: 'tenant-abc', iocs: [] },
      });
      const body = JSON.parse(res.body);
      expect(typeof body.data.indexed).toBe('number');
      expect(typeof body.data.failed).toBe('number');
    });

    it('calls indexer.reindexTenant with tenantId', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        body: { tenantId: 'tenant-abc', iocs: [] },
      });
      expect(mockIndexer.reindexTenant).toHaveBeenCalledWith('tenant-abc', []);
    });

    it('returns 400 when tenantId missing in body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        body: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('passes iocs array to reindexTenant', async () => {
      const iocs = [
        {
          iocId: 'ioc-001', value: '1.2.3.4', type: 'ip', severity: 'high',
          confidence: 80, tags: [], firstSeen: '2026-01-01T00:00:00.000Z',
          lastSeen: '2026-01-01T00:00:00.000Z', tenantId: 'tenant-abc',
          enriched: false, tlp: 'WHITE',
        },
      ];
      await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        body: { tenantId: 'tenant-abc', iocs },
      });
      expect(mockIndexer.reindexTenant).toHaveBeenCalledWith('tenant-abc', iocs);
    });

    it('returns 400 for invalid tenantId type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/search/reindex',
        body: { tenantId: 123, iocs: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
