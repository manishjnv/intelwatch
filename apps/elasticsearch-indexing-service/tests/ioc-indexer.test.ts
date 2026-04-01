import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IocIndexer } from '../src/ioc-indexer.js';
import type { EsIndexClient } from '../src/es-client.js';
import type { IocDocument } from '../src/schemas.js';

function makeEsClient(): EsIndexClient {
  return {
    ping: vi.fn().mockResolvedValue(true),
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    ensureTypeIndex: vi.fn().mockResolvedValue(undefined),
    indexDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({ total: 0, hits: [], aggregations: {} }),
    bulkIndex: vi.fn().mockResolvedValue({ indexed: 0, failed: 0 }),
    bulkIndexMultiType: vi.fn().mockResolvedValue({ indexed: 0, failed: 0 }),
    countDocs: vi.fn().mockResolvedValue(0),
    setupIlmPolicy: vi.fn().mockResolvedValue(undefined),
    setupIndexTemplate: vi.fn().mockResolvedValue(undefined),
    reindexByQuery: vi.fn().mockResolvedValue({ total: 0 }),
    getClient: vi.fn(),
  } as unknown as EsIndexClient;
}

const sampleDoc: IocDocument = {
  iocId: 'ioc-001',
  value: '1.2.3.4',
  type: 'ip',
  severity: 'high',
  confidence: 85,
  tags: ['malware', 'c2'],
  firstSeen: '2026-01-01T00:00:00.000Z',
  lastSeen: '2026-03-01T00:00:00.000Z',
  tenantId: 'tenant-abc',
  enriched: true,
  tlp: 'AMBER',
};

describe('IocIndexer', () => {
  let es: EsIndexClient;
  let indexer: IocIndexer;

  beforeEach(() => {
    es = makeEsClient();
    indexer = new IocIndexer(es);
  });

  // ── indexIOC ────────────────────────────────────────────────────────────────
  describe('indexIOC', () => {
    it('calls ensureTypeIndex with correct tenant and IOC type', async () => {
      await indexer.indexIOC('tenant-abc', 'ioc-001', sampleDoc);
      expect(es.ensureTypeIndex).toHaveBeenCalledWith('tenant-abc', 'ip');
    });

    it('routes ip IOC to etip_tenant-abc_iocs_ip index', async () => {
      await indexer.indexIOC('tenant-abc', 'ioc-001', sampleDoc);
      expect(es.indexDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs_ip', 'ioc-001', sampleDoc);
    });

    it('routes sha256 IOC to etip_tenant-abc_iocs_hash index', async () => {
      const hashDoc = { ...sampleDoc, type: 'sha256', value: 'a'.repeat(64) };
      await indexer.indexIOC('tenant-abc', 'ioc-001', hashDoc);
      expect(es.indexDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs_hash', 'ioc-001', hashDoc);
    });

    it('routes domain IOC to etip_tenant-abc_iocs_domain index', async () => {
      const domainDoc = { ...sampleDoc, type: 'domain', value: 'evil.com' };
      await indexer.indexIOC('tenant-abc', 'ioc-001', domainDoc);
      expect(es.indexDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs_domain', 'ioc-001', domainDoc);
    });

    it('routes cve IOC to etip_tenant-abc_iocs_cve index', async () => {
      const cveDoc = { ...sampleDoc, type: 'cve', value: 'CVE-2024-1234' };
      await indexer.indexIOC('tenant-abc', 'ioc-001', cveDoc);
      expect(es.indexDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs_cve', 'ioc-001', cveDoc);
    });

    it('throws AppError when ensureTypeIndex rejects', async () => {
      vi.mocked(es.ensureTypeIndex).mockRejectedValue(new Error('ES down'));
      await expect(indexer.indexIOC('tenant-abc', 'ioc-001', sampleDoc)).rejects.toMatchObject({
        statusCode: 503,
        code: 'ES_INDEX_FAILED',
      });
    });

    it('throws AppError when indexDoc rejects', async () => {
      vi.mocked(es.indexDoc).mockRejectedValue(new Error('index failed'));
      await expect(indexer.indexIOC('tenant-abc', 'ioc-001', sampleDoc)).rejects.toMatchObject({
        code: 'ES_INDEX_FAILED',
      });
    });
  });

  // ── updateIOC ───────────────────────────────────────────────────────────────
  describe('updateIOC', () => {
    it('calls ensureTypeIndex before updating', async () => {
      await indexer.updateIOC('tenant-abc', 'ioc-001', { severity: 'critical' }, 'ip');
      expect(es.ensureTypeIndex).toHaveBeenCalledWith('tenant-abc', 'ip');
    });

    it('routes to correct per-type index using iocType param', async () => {
      await indexer.updateIOC('tenant-abc', 'ioc-001', { severity: 'critical' }, 'ip');
      expect(es.updateDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs_ip', 'ioc-001', { severity: 'critical' });
    });

    it('falls back to payload.type when iocType not provided', async () => {
      await indexer.updateIOC('tenant-abc', 'ioc-001', { severity: 'critical', type: 'domain' });
      expect(es.updateDoc).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_domain',
        'ioc-001',
        { severity: 'critical', type: 'domain' },
      );
    });

    it('falls back to other when no type info available', async () => {
      await indexer.updateIOC('tenant-abc', 'ioc-001', { severity: 'critical' });
      expect(es.updateDoc).toHaveBeenCalledWith(
        'etip_tenant-abc_iocs_other',
        'ioc-001',
        { severity: 'critical' },
      );
    });

    it('throws AppError when updateDoc rejects', async () => {
      vi.mocked(es.updateDoc).mockRejectedValue(new Error('update failed'));
      await expect(indexer.updateIOC('tenant-abc', 'ioc-001', {}, 'ip')).rejects.toMatchObject({
        code: 'ES_UPDATE_FAILED',
      });
    });
  });

  // ── deleteIOC ───────────────────────────────────────────────────────────────
  describe('deleteIOC', () => {
    it('routes delete to correct per-type index', async () => {
      await indexer.deleteIOC('tenant-abc', 'ioc-001', 'ip');
      expect(es.deleteDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs_ip', 'ioc-001');
    });

    it('falls back to other index when type not provided', async () => {
      await indexer.deleteIOC('tenant-abc', 'ioc-001');
      expect(es.deleteDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs_other', 'ioc-001');
    });

    it('throws AppError when deleteDoc rejects', async () => {
      vi.mocked(es.deleteDoc).mockRejectedValue(new Error('delete failed'));
      await expect(indexer.deleteIOC('tenant-abc', 'ioc-001', 'ip')).rejects.toMatchObject({
        code: 'ES_DELETE_FAILED',
      });
    });
  });

  // ── reindexTenant ───────────────────────────────────────────────────────────
  describe('reindexTenant', () => {
    it('ensures type indices for all unique IOC types', async () => {
      const docs = [
        sampleDoc,
        { ...sampleDoc, iocId: 'ioc-002', type: 'sha256', value: 'a'.repeat(64) },
      ];
      await indexer.reindexTenant('tenant-abc', docs);
      expect(es.ensureTypeIndex).toHaveBeenCalledWith('tenant-abc', 'ip');
      expect(es.ensureTypeIndex).toHaveBeenCalledWith('tenant-abc', 'sha256');
    });

    it('calls bulkIndexMultiType with all provided docs', async () => {
      const docs = [sampleDoc, { ...sampleDoc, iocId: 'ioc-002', value: '5.6.7.8' }];
      await indexer.reindexTenant('tenant-abc', docs);
      expect(es.bulkIndexMultiType).toHaveBeenCalledWith('tenant-abc', docs);
    });

    it('returns result with indexed and failed counts', async () => {
      vi.mocked(es.bulkIndexMultiType).mockResolvedValue({ indexed: 2, failed: 0 });
      const result = await indexer.reindexTenant('tenant-abc', [sampleDoc]);
      expect(result.indexed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('returns zero counts for empty array', async () => {
      const result = await indexer.reindexTenant('tenant-abc', []);
      expect(result.indexed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('throws AppError when bulkIndexMultiType rejects', async () => {
      vi.mocked(es.bulkIndexMultiType).mockRejectedValue(new Error('bulk failed'));
      await expect(indexer.reindexTenant('tenant-abc', [sampleDoc])).rejects.toMatchObject({
        code: 'ES_REINDEX_FAILED',
      });
    });
  });
});
