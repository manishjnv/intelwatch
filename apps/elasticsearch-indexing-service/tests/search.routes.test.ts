import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { IocDocument } from '../src/schemas.js';

const mockSearchResult = {
  total: 2,
  page: 1,
  limit: 50,
  data: [
    {
      iocId: 'ioc-001',
      value: '1.2.3.4',
      type: 'ip',
      severity: 'high',
      confidence: 85,
      tags: ['malware'],
      firstSeen: '2026-01-01T00:00:00.000Z',
      lastSeen: '2026-03-01T00:00:00.000Z',
      tenantId: 'tenant-abc',
      enriched: true,
      tlp: 'AMBER',
    } as IocDocument,
  ],
  aggregations: {
    by_type: [{ key: 'ip', count: 1 }],
    by_severity: [{ key: 'high', count: 1 }],
    by_tlp: [{ key: 'AMBER', count: 1 }],
  },
};

const mockSearchService = {
  search: vi.fn().mockResolvedValue(mockSearchResult),
  getIndexStats: vi.fn().mockResolvedValue({ docCount: 5, indexName: 'etip_tenant-abc_iocs' }),
};

vi.mock('../src/es-client.js', () => ({
  EsIndexClient: vi.fn(() => ({
    ping: vi.fn().mockResolvedValue(true),
    ensureIndex: vi.fn(),
    indexDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    search: vi.fn().mockResolvedValue({ total: 0, hits: [], aggregations: {} }),
    bulkIndex: vi.fn().mockResolvedValue({ indexed: 0, failed: 0 }),
    countDocs: vi.fn().mockResolvedValue(0),
  })),
  getIndexName: vi.fn((t: string) => `etip_${t}_iocs`),
}));

vi.mock('../src/search-service.js', () => ({
  IocSearchService: vi.fn(() => mockSearchService),
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

describe('Search Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ config });
    vi.mocked(mockSearchService.search).mockResolvedValue(mockSearchResult);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/search/iocs', () => {
    it('returns 200 with data array', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search/iocs?tenantId=tenant-abc',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.data.data)).toBe(true);
    });

    it('returns total, page, limit in response', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search/iocs?tenantId=tenant-abc',
      });
      const body = JSON.parse(res.body);
      expect(typeof body.data.total).toBe('number');
      expect(typeof body.data.page).toBe('number');
      expect(typeof body.data.limit).toBe('number');
    });

    it('returns aggregations in response', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search/iocs?tenantId=tenant-abc',
      });
      const body = JSON.parse(res.body);
      expect(body.data.aggregations).toBeDefined();
      expect(Array.isArray(body.data.aggregations.by_type)).toBe(true);
    });

    it('passes q param to search service', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/search/iocs?tenantId=tenant-abc&q=evil.com',
      });
      expect(mockSearchService.search).toHaveBeenCalledWith(
        'tenant-abc',
        expect.objectContaining({ q: 'evil.com' }),
      );
    });

    it('passes type filter to search service', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/search/iocs?tenantId=tenant-abc&type=domain',
      });
      expect(mockSearchService.search).toHaveBeenCalledWith(
        'tenant-abc',
        expect.objectContaining({ type: 'domain' }),
      );
    });

    it('passes severity filter to search service', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/search/iocs?tenantId=tenant-abc&severity=critical',
      });
      expect(mockSearchService.search).toHaveBeenCalledWith(
        'tenant-abc',
        expect.objectContaining({ severity: 'critical' }),
      );
    });

    it('passes pagination params', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/search/iocs?tenantId=tenant-abc&page=2&limit=25',
      });
      expect(mockSearchService.search).toHaveBeenCalledWith(
        'tenant-abc',
        expect.objectContaining({ page: 2, limit: 25 }),
      );
    });

    it('returns 400 when tenantId is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/search/iocs' });
      expect(res.statusCode).toBe(400);
    });

    it('defaults page=1 limit=50 when not provided', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/search/iocs?tenantId=tenant-abc',
      });
      expect(mockSearchService.search).toHaveBeenCalledWith(
        'tenant-abc',
        expect.objectContaining({ page: 1, limit: 50 }),
      );
    });
  });

  describe('GET /api/v1/search/iocs/stats', () => {
    it('returns 200 with docCount and indexName', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search/iocs/stats?tenantId=tenant-abc',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.data.docCount).toBe('number');
      expect(typeof body.data.indexName).toBe('string');
    });

    it('returns 400 when tenantId is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/search/iocs/stats' });
      expect(res.statusCode).toBe(400);
    });
  });
});
