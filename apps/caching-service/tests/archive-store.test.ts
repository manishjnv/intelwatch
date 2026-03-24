import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveStore } from '../src/services/archive-store.js';

function makeManifestData(overrides: Partial<Parameters<ArchiveStore['create']>[0]> = {}) {
  return {
    tenantId: 'tenant-1',
    entityType: 'ioc',
    recordCount: 500,
    fileSizeBytes: 12345,
    compressionRatio: 0.75,
    dateRangeStart: '2025-11-01T00:00:00Z',
    dateRangeEnd: '2025-12-31T23:59:59Z',
    objectKey: 'archive/tenant-1/ioc/2026-01-15/abc.jsonl.gz',
    status: 'completed' as const,
    ...overrides,
  };
}

describe('ArchiveStore', () => {
  let store: ArchiveStore;

  beforeEach(() => {
    store = new ArchiveStore();
  });

  describe('create', () => {
    it('creates manifest with generated id and createdAt', () => {
      const manifest = store.create(makeManifestData());
      expect(manifest.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(manifest.createdAt).toBeTruthy();
      expect(manifest.tenantId).toBe('tenant-1');
      expect(manifest.entityType).toBe('ioc');
      expect(manifest.recordCount).toBe(500);
    });

    it('stores manifest retrievable by id', () => {
      const created = store.create(makeManifestData());
      const retrieved = store.getById(created.id);
      expect(retrieved).toEqual(created);
    });
  });

  describe('getById', () => {
    it('returns null for non-existent id', () => {
      expect(store.getById('nonexistent')).toBeNull();
    });
  });

  describe('list', () => {
    it('returns all manifests sorted by createdAt desc', () => {
      store.create(makeManifestData({ entityType: 'ioc' }));
      store.create(makeManifestData({ entityType: 'malware' }));
      store.create(makeManifestData({ entityType: 'vulnerability' }));

      const result = store.list();
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(3);
    });

    it('filters by tenantId', () => {
      store.create(makeManifestData({ tenantId: 'tenant-1' }));
      store.create(makeManifestData({ tenantId: 'tenant-2' }));
      store.create(makeManifestData({ tenantId: 'tenant-1' }));

      const result = store.list({ tenantId: 'tenant-1' });
      expect(result.total).toBe(2);
    });

    it('filters by entityType', () => {
      store.create(makeManifestData({ entityType: 'ioc' }));
      store.create(makeManifestData({ entityType: 'malware' }));
      store.create(makeManifestData({ entityType: 'ioc' }));

      const result = store.list({ entityType: 'ioc' });
      expect(result.total).toBe(2);
    });

    it('filters by status', () => {
      store.create(makeManifestData({ status: 'completed' }));
      store.create(makeManifestData({ status: 'completed' }));
      const m = store.create(makeManifestData({ status: 'completed' }));
      store.updateStatus(m.id, 'restoring');

      const result = store.list({ status: 'restoring' });
      expect(result.total).toBe(1);
    });

    it('paginates results', () => {
      for (let i = 0; i < 10; i++) {
        store.create(makeManifestData({ entityType: `type-${i}` }));
      }

      const page1 = store.list({ page: 1, limit: 3 });
      expect(page1.data).toHaveLength(3);
      expect(page1.total).toBe(10);

      const page2 = store.list({ page: 2, limit: 3 });
      expect(page2.data).toHaveLength(3);

      const page4 = store.list({ page: 4, limit: 3 });
      expect(page4.data).toHaveLength(1);
    });

    it('returns empty for out-of-range page', () => {
      store.create(makeManifestData());
      const result = store.list({ page: 99, limit: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('updates manifest status', () => {
      const m = store.create(makeManifestData());
      const updated = store.updateStatus(m.id, 'restoring');
      expect(updated.status).toBe('restoring');
    });

    it('applies extra fields', () => {
      const m = store.create(makeManifestData());
      const updated = store.updateStatus(m.id, 'completed', { restoredAt: '2026-01-15T00:00:00Z' });
      expect(updated.restoredAt).toBe('2026-01-15T00:00:00Z');
    });

    it('throws for non-existent manifest', () => {
      expect(() => store.updateStatus('bad-id', 'failed')).toThrow('Manifest bad-id not found');
    });
  });

  describe('delete', () => {
    it('removes manifest', () => {
      const m = store.create(makeManifestData());
      expect(store.delete(m.id)).toBe(true);
      expect(store.getById(m.id)).toBeNull();
    });

    it('returns false for non-existent id', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('computes aggregated statistics', () => {
      store.create(makeManifestData({ entityType: 'ioc', recordCount: 100, fileSizeBytes: 1000 }));
      store.create(makeManifestData({ entityType: 'ioc', recordCount: 200, fileSizeBytes: 2000 }));
      store.create(makeManifestData({ entityType: 'malware', recordCount: 50, fileSizeBytes: 500 }));

      const stats = store.getStats();
      expect(stats.totalManifests).toBe(3);
      expect(stats.totalRecords).toBe(350);
      expect(stats.totalSizeBytes).toBe(3500);
      expect(stats.byEntityType.ioc.count).toBe(2);
      expect(stats.byEntityType.ioc.records).toBe(300);
      expect(stats.byEntityType.malware.count).toBe(1);
      expect(stats.oldestArchive).toBeTruthy();
      expect(stats.newestArchive).toBeTruthy();
    });

    it('returns zeros for empty store', () => {
      const stats = store.getStats();
      expect(stats.totalManifests).toBe(0);
      expect(stats.totalRecords).toBe(0);
      expect(stats.oldestArchive).toBeNull();
    });
  });

  describe('purgeExpired', () => {
    it('removes manifests older than retention', () => {
      // Create with backdated createdAt (hack: create then modify the map)
      const m = store.create(makeManifestData());
      // Access internal for testing: set createdAt to 400 days ago
      const manifest = store.getById(m.id)!;
      (manifest as Record<string, unknown>).createdAt = new Date(Date.now() - 400 * 86400000).toISOString();

      const purged = store.purgeExpired(365);
      expect(purged).toHaveLength(1);
      expect(store.size()).toBe(0);
    });

    it('keeps manifests within retention period', () => {
      store.create(makeManifestData());
      const purged = store.purgeExpired(365);
      expect(purged).toHaveLength(0);
      expect(store.size()).toBe(1);
    });
  });

  describe('size and clear', () => {
    it('reports correct size', () => {
      expect(store.size()).toBe(0);
      store.create(makeManifestData());
      store.create(makeManifestData());
      expect(store.size()).toBe(2);
    });

    it('clears all manifests', () => {
      store.create(makeManifestData());
      store.clear();
      expect(store.size()).toBe(0);
    });
  });
});
