import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IocIndexer } from '../src/ioc-indexer.js';
import type { EsIndexClient } from '../src/es-client.js';
import type { IocDocument } from '../src/schemas.js';

function makeEsClient(): EsIndexClient {
  return {
    ping: vi.fn().mockResolvedValue(true),
    ensureIndex: vi.fn().mockResolvedValue(undefined),
    indexDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({ total: 0, hits: [], aggregations: {} }),
    bulkIndex: vi.fn().mockResolvedValue({ indexed: 0, failed: 0 }),
    countDocs: vi.fn().mockResolvedValue(0),
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
    it('calls ensureIndex with the correct tenant', async () => {
      await indexer.indexIOC('tenant-abc', 'ioc-001', sampleDoc);
      expect(es.ensureIndex).toHaveBeenCalledWith('tenant-abc');
    });

    it('calls indexDoc with correct index name and doc id', async () => {
      await indexer.indexIOC('tenant-abc', 'ioc-001', sampleDoc);
      expect(es.indexDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs', 'ioc-001', sampleDoc);
    });

    it('throws AppError when ensureIndex rejects', async () => {
      vi.mocked(es.ensureIndex).mockRejectedValue(new Error('ES down'));
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
    it('calls ensureIndex before updating', async () => {
      await indexer.updateIOC('tenant-abc', 'ioc-001', { severity: 'critical' });
      expect(es.ensureIndex).toHaveBeenCalledWith('tenant-abc');
    });

    it('calls updateDoc with partial payload', async () => {
      await indexer.updateIOC('tenant-abc', 'ioc-001', { severity: 'critical' });
      expect(es.updateDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs', 'ioc-001', { severity: 'critical' });
    });

    it('throws AppError when updateDoc rejects', async () => {
      vi.mocked(es.updateDoc).mockRejectedValue(new Error('update failed'));
      await expect(indexer.updateIOC('tenant-abc', 'ioc-001', {})).rejects.toMatchObject({
        code: 'ES_UPDATE_FAILED',
      });
    });
  });

  // ── deleteIOC ───────────────────────────────────────────────────────────────
  describe('deleteIOC', () => {
    it('calls deleteDoc with correct index and doc id', async () => {
      await indexer.deleteIOC('tenant-abc', 'ioc-001');
      expect(es.deleteDoc).toHaveBeenCalledWith('etip_tenant-abc_iocs', 'ioc-001');
    });

    it('throws AppError when deleteDoc rejects', async () => {
      vi.mocked(es.deleteDoc).mockRejectedValue(new Error('delete failed'));
      await expect(indexer.deleteIOC('tenant-abc', 'ioc-001')).rejects.toMatchObject({
        code: 'ES_DELETE_FAILED',
      });
    });
  });

  // ── reindexTenant ───────────────────────────────────────────────────────────
  describe('reindexTenant', () => {
    it('calls ensureIndex for the tenant', async () => {
      await indexer.reindexTenant('tenant-abc', [sampleDoc]);
      expect(es.ensureIndex).toHaveBeenCalledWith('tenant-abc');
    });

    it('calls bulkIndex with all provided docs', async () => {
      const docs = [sampleDoc, { ...sampleDoc, iocId: 'ioc-002', value: '5.6.7.8' }];
      await indexer.reindexTenant('tenant-abc', docs);
      expect(es.bulkIndex).toHaveBeenCalledWith('etip_tenant-abc_iocs', docs);
    });

    it('returns result with indexed and failed counts', async () => {
      vi.mocked(es.bulkIndex).mockResolvedValue({ indexed: 2, failed: 0 });
      const result = await indexer.reindexTenant('tenant-abc', [sampleDoc]);
      expect(result.indexed).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('throws AppError when bulkIndex rejects', async () => {
      vi.mocked(es.bulkIndex).mockRejectedValue(new Error('bulk failed'));
      await expect(indexer.reindexTenant('tenant-abc', [sampleDoc])).rejects.toMatchObject({
        code: 'ES_REINDEX_FAILED',
      });
    });
  });
});
