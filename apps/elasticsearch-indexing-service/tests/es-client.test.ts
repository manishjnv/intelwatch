import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ES client library — EsIndexClient wraps `new Client()` and calls
// methods on it directly, so we intercept at that layer.
const mockClient = {
  update: vi.fn(),
  delete: vi.fn(),
  deleteByQuery: vi.fn(),
  index: vi.fn().mockResolvedValue({}),
  search: vi.fn(),
  ping: vi.fn(),
  indices: { exists: vi.fn(), create: vi.fn() },
  ilm: { putLifecycle: vi.fn() },
  bulk: vi.fn(),
  count: vi.fn(),
};

vi.mock('@elastic/elasticsearch', () => ({
  Client: vi.fn(() => mockClient),
}));

import { EsIndexClient } from '../src/es-client.js';
import type { IocDocument } from '../src/schemas.js';

const fullDoc: IocDocument = {
  iocId: 'ioc-001',
  value: '1.2.3.4',
  normalizedValue: '1.2.3.4',
  type: 'ip',
  severity: 'high',
  confidence: 80,
  lifecycle: 'active',
  tags: [],
  mitreAttack: [],
  malwareFamilies: [],
  threatActors: [],
  firstSeen: '2026-01-01T00:00:00.000Z',
  lastSeen: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tenantId: 'tenant-abc',
  enriched: false,
  archived: false,
  tlp: 'WHITE',
};

/** Shape thrown by the ES 8.x client on a 404 document_missing_exception. */
function missingDocError() {
  return Object.assign(new Error('document missing'), {
    meta: { statusCode: 404, body: { error: { type: 'document_missing_exception' } } },
  });
}

/** Shape thrown by the ES 8.x client on a plain 404 delete "not_found" (no error.type). */
function notFoundError() {
  return Object.assign(new Error('not found'), { meta: { statusCode: 404, body: {} } });
}

describe('EsIndexClient', () => {
  let es: EsIndexClient;

  beforeEach(() => {
    vi.clearAllMocks();
    es = new EsIndexClient({ url: 'http://localhost:9200' });
  });

  describe('updateDoc — 404 document_missing_exception', () => {
    it('indexes the payload when it is a full valid IocDocument', async () => {
      mockClient.update.mockRejectedValue(missingDocError());
      await es.updateDoc('etip_tenant-abc_iocs_ip', 'ioc-001', fullDoc);
      expect(mockClient.index).toHaveBeenCalledWith(
        expect.objectContaining({ index: 'etip_tenant-abc_iocs_ip', id: 'ioc-001', document: fullDoc }),
      );
    });

    it('logs a warning and returns without indexing when the payload is only partial', async () => {
      mockClient.update.mockRejectedValue(missingDocError());
      await expect(
        es.updateDoc('etip_tenant-abc_iocs_ip', 'ioc-001', { severity: 'critical' }),
      ).resolves.toBeUndefined();
      expect(mockClient.index).not.toHaveBeenCalled();
    });

    it('rethrows as AppError for a non-404 failure', async () => {
      mockClient.update.mockRejectedValue(new Error('ES down'));
      await expect(
        es.updateDoc('etip_tenant-abc_iocs_ip', 'ioc-001', { severity: 'critical' }),
      ).rejects.toMatchObject({ code: 'ES_UPDATE_DOC_FAILED' });
    });
  });

  describe('deleteDoc — missing document is success', () => {
    it('resolves without throwing when the document does not exist', async () => {
      mockClient.delete.mockRejectedValue(notFoundError());
      await expect(es.deleteDoc('etip_tenant-abc_iocs_ip', 'ioc-001')).resolves.toBeUndefined();
    });

    it('rethrows as AppError for a non-404 failure', async () => {
      mockClient.delete.mockRejectedValue(new Error('ES down'));
      await expect(es.deleteDoc('etip_tenant-abc_iocs_ip', 'ioc-001')).rejects.toMatchObject({
        code: 'ES_DELETE_DOC_FAILED',
      });
    });
  });

  describe('deleteByIds', () => {
    it('issues deleteByQuery on the tenant wildcard index with an ids query', async () => {
      mockClient.deleteByQuery.mockResolvedValue({ deleted: 1 });
      await es.deleteByIds('tenant-abc', ['ioc-001']);
      expect(mockClient.deleteByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'etip_tenant-abc_iocs_*',
          query: { ids: { values: ['ioc-001'] } },
          ignore_unavailable: true,
          allow_no_indices: true,
        }),
      );
    });

    it('a missing index / 0 matches resolves without throwing', async () => {
      mockClient.deleteByQuery.mockResolvedValue({ deleted: 0 });
      await expect(es.deleteByIds('tenant-abc', ['missing-id'])).resolves.toBeUndefined();
    });

    it('no-ops for an empty id list', async () => {
      await es.deleteByIds('tenant-abc', []);
      expect(mockClient.deleteByQuery).not.toHaveBeenCalled();
    });
  });

  describe('search — simple_query_string, not query_string', () => {
    beforeEach(() => {
      mockClient.search.mockResolvedValue({ hits: { total: { value: 0 }, hits: [] }, aggregations: {} });
    });

    it('does not error on url-shaped or colon input', async () => {
      await expect(
        es.search('etip_tenant-abc_iocs_*', { q: 'http://a:b/c', page: 1, limit: 50 }),
      ).resolves.toBeDefined();
      const call = mockClient.search.mock.calls[0]?.[0];
      expect(call.query.bool.must[0]).toHaveProperty('simple_query_string');
      expect(call.query.bool.must[0]).not.toHaveProperty('query_string');
    });

    it('does not error on an unbalanced paren', async () => {
      await expect(
        es.search('etip_tenant-abc_iocs_*', { q: '(', page: 1, limit: 50 }),
      ).resolves.toBeDefined();
    });

    it('boosts an exact normalizedValue match', async () => {
      await es.search('etip_tenant-abc_iocs_*', { q: 'Evil.com', page: 1, limit: 50 });
      const call = mockClient.search.mock.calls[0]?.[0];
      expect(call.query.bool.should).toEqual([
        { term: { normalizedValue: { value: 'evil.com', boost: 5 } } },
      ]);
    });

    it('excludes revoked and false_positive lifecycle by default', async () => {
      await es.search('etip_tenant-abc_iocs_*', { page: 1, limit: 50 });
      const call = mockClient.search.mock.calls[0]?.[0];
      expect(call.query.bool.must_not).toEqual([{ terms: { lifecycle: ['revoked', 'false_positive'] } }]);
    });

    it('includeInactive=true removes the lifecycle filter', async () => {
      await es.search('etip_tenant-abc_iocs_*', { page: 1, limit: 50, includeInactive: true });
      const call = mockClient.search.mock.calls[0]?.[0];
      expect(call.query.bool.must_not).toEqual([]);
    });
  });
});
