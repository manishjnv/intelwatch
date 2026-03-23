import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IocSearchService } from '../src/search-service.js';
import type { EsIndexClient } from '../src/es-client.js';
import type { IocDocument } from '../src/schemas.js';

function makeEsClient(overrides: Partial<EsIndexClient> = {}): EsIndexClient {
  return {
    ping: vi.fn().mockResolvedValue(true),
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    indexDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({
      total: 0,
      hits: [],
      aggregations: {
        by_type: { buckets: [] },
        by_severity: { buckets: [] },
        by_tlp: { buckets: [] },
      },
    }),
    bulkIndex: vi.fn().mockResolvedValue({ indexed: 0, failed: 0 }),
    countDocs: vi.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as EsIndexClient;
}

const sampleHit: IocDocument = {
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
};

describe('IocSearchService', () => {
  let es: EsIndexClient;
  let service: IocSearchService;

  beforeEach(() => {
    es = makeEsClient();
    service = new IocSearchService(es);
  });

  // ── search ──────────────────────────────────────────────────────────────────
  describe('search', () => {
    it('calls es.search with correct index name', async () => {
      await service.search('tenant-abc', { page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs',
        expect.objectContaining({ page: 1, limit: 50 }),
      );
    });

    it('passes q param to search', async () => {
      await service.search('tenant-abc', { q: 'evil.com', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs',
        expect.objectContaining({ q: 'evil.com' }),
      );
    });

    it('passes type filter to search', async () => {
      await service.search('tenant-abc', { type: 'domain', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs',
        expect.objectContaining({ type: 'domain' }),
      );
    });

    it('passes severity filter to search', async () => {
      await service.search('tenant-abc', { severity: 'critical', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs',
        expect.objectContaining({ severity: 'critical' }),
      );
    });

    it('passes tlp filter to search', async () => {
      await service.search('tenant-abc', { tlp: 'RED', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs',
        expect.objectContaining({ tlp: 'RED' }),
      );
    });

    it('passes enriched filter to search', async () => {
      await service.search('tenant-abc', { enriched: true, page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs',
        expect.objectContaining({ enriched: true }),
      );
    });

    it('returns correct result shape with zero hits', async () => {
      const result = await service.search('tenant-abc', { page: 1, limit: 50 });
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('returns populated hits when es returns results', async () => {
      vi.mocked(es.search).mockResolvedValue({
        total: 1,
        hits: [sampleHit],
        aggregations: { by_type: { buckets: [] }, by_severity: { buckets: [] }, by_tlp: { buckets: [] } },
      });
      const result = await service.search('tenant-abc', { page: 1, limit: 50 });
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.iocId).toBe('ioc-001');
    });

    it('returns aggregations in result', async () => {
      vi.mocked(es.search).mockResolvedValue({
        total: 0,
        hits: [],
        aggregations: {
          by_type: { buckets: [{ key: 'ip', doc_count: 5 }] },
          by_severity: { buckets: [{ key: 'high', doc_count: 3 }] },
          by_tlp: { buckets: [{ key: 'AMBER', doc_count: 2 }] },
        },
      });
      const result = await service.search('tenant-abc', { page: 1, limit: 50 });
      expect(result.aggregations.by_type).toHaveLength(1);
      expect(result.aggregations.by_severity).toHaveLength(1);
    });

    it('respects pagination (page 2)', async () => {
      await service.search('tenant-abc', { page: 2, limit: 25 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs',
        expect.objectContaining({ page: 2, limit: 25 }),
      );
    });

    it('throws AppError when es.search rejects', async () => {
      vi.mocked(es.search).mockRejectedValue(new Error('ES query error'));
      await expect(service.search('tenant-abc', { page: 1, limit: 50 })).rejects.toMatchObject({
        code: 'ES_SEARCH_FAILED',
      });
    });
  });

  // ── getIndexStats ────────────────────────────────────────────────────────────
  describe('getIndexStats', () => {
    it('calls countDocs with correct index name', async () => {
      vi.mocked(es.countDocs).mockResolvedValue(42);
      await service.getIndexStats('tenant-abc');
      expect(es.countDocs).toHaveBeenCalledWith('etip_tenant-abc_iocs');
    });

    it('returns docCount from countDocs', async () => {
      vi.mocked(es.countDocs).mockResolvedValue(42);
      const stats = await service.getIndexStats('tenant-abc');
      expect(stats.docCount).toBe(42);
      expect(stats.indexName).toBe('etip_tenant-abc_iocs');
    });
  });
});
