import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IocSearchService } from '../src/search-service.js';
import type { EsIndexClient } from '../src/es-client.js';
import type { IocDocument } from '../src/schemas.js';

function makeEsClient(overrides: Partial<EsIndexClient> = {}): EsIndexClient {
  return {
    ping: vi.fn().mockResolvedValue(true),
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    ensureTypeIndex: vi.fn().mockResolvedValue(undefined),
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
    bulkIndexMultiType: vi.fn().mockResolvedValue({ indexed: 0, failed: 0 }),
    countDocs: vi.fn().mockResolvedValue(0),
    setupIlmPolicy: vi.fn().mockResolvedValue(undefined),
    setupIndexTemplate: vi.fn().mockResolvedValue(undefined),
    reindexByQuery: vi.fn().mockResolvedValue({ total: 0 }),
    getClient: vi.fn(),
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
    it('uses wildcard pattern for cross-type search (no type filter)', async () => {
      await service.search('tenant-abc', { page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_*',
        expect.objectContaining({ page: 1, limit: 50 }),
      );
    });

    it('targets specific per-type index when type filter is provided', async () => {
      await service.search('tenant-abc', { type: 'ip', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_ip',
        expect.objectContaining({ type: 'ip' }),
      );
    });

    it('targets hash index for sha256 type filter', async () => {
      await service.search('tenant-abc', { type: 'sha256', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_hash',
        expect.objectContaining({ type: 'sha256' }),
      );
    });

    it('targets domain index for url type filter', async () => {
      await service.search('tenant-abc', { type: 'url', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_domain',
        expect.objectContaining({ type: 'url' }),
      );
    });

    it('passes q param to search', async () => {
      await service.search('tenant-abc', { q: 'evil.com', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_*',
        expect.objectContaining({ q: 'evil.com' }),
      );
    });

    it('passes severity filter to search', async () => {
      await service.search('tenant-abc', { severity: 'critical', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_*',
        expect.objectContaining({ severity: 'critical' }),
      );
    });

    it('passes tlp filter to search', async () => {
      await service.search('tenant-abc', { tlp: 'RED', page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_*',
        expect.objectContaining({ tlp: 'RED' }),
      );
    });

    it('passes enriched filter to search', async () => {
      await service.search('tenant-abc', { enriched: true, page: 1, limit: 50 });
      expect(es.search).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_*',
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
        'etip_tenant-abc_iocs_*',
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
    it('calls countDocs for all 6 per-type indices', async () => {
      vi.mocked(es.countDocs).mockResolvedValue(10);
      await service.getIndexStats('tenant-abc');
      expect(es.countDocs).toHaveBeenCalledTimes(6);
      expect(es.countDocs).toHaveBeenCalledWith('etip_tenant-abc_iocs_ip');
      expect(es.countDocs).toHaveBeenCalledWith('etip_tenant-abc_iocs_domain');
      expect(es.countDocs).toHaveBeenCalledWith('etip_tenant-abc_iocs_hash');
      expect(es.countDocs).toHaveBeenCalledWith('etip_tenant-abc_iocs_email');
      expect(es.countDocs).toHaveBeenCalledWith('etip_tenant-abc_iocs_cve');
      expect(es.countDocs).toHaveBeenCalledWith('etip_tenant-abc_iocs_other');
    });

    it('returns total docCount summed across all indices', async () => {
      vi.mocked(es.countDocs)
        .mockResolvedValueOnce(10) // ip
        .mockResolvedValueOnce(5)  // domain
        .mockResolvedValueOnce(3)  // hash
        .mockResolvedValueOnce(1)  // email
        .mockResolvedValueOnce(2)  // cve
        .mockResolvedValueOnce(0); // other
      const stats = await service.getIndexStats('tenant-abc');
      expect(stats.docCount).toBe(21);
    });

    it('returns all 6 index names', async () => {
      const stats = await service.getIndexStats('tenant-abc');
      expect(stats.indexNames).toHaveLength(6);
    });
  });
});
