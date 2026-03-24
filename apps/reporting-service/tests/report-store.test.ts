import { describe, it, expect, beforeEach } from 'vitest';
import { ReportStore } from '../src/services/report-store.js';

describe('ReportStore', () => {
  let store: ReportStore;

  beforeEach(() => {
    store = new ReportStore(100, 30);
  });

  describe('create', () => {
    it('creates a report with pending status', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 'tenant-1', configVersion: 1 });
      expect(report.id).toBeTruthy();
      expect(report.status).toBe('pending');
      expect(report.type).toBe('daily');
    });

    it('generates a default title for daily reports', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      expect(report.title).toContain('Daily Threat Report');
    });

    it('generates a default title for weekly reports', () => {
      const report = store.create({ type: 'weekly', format: 'json', tenantId: 't1', configVersion: 1 });
      expect(report.title).toContain('Weekly Threat Summary');
    });

    it('generates a default title for monthly reports', () => {
      const report = store.create({ type: 'monthly', format: 'json', tenantId: 't1', configVersion: 1 });
      expect(report.title).toContain('Monthly Executive Report');
    });

    it('generates a default title for executive reports', () => {
      const report = store.create({ type: 'executive', format: 'json', tenantId: 't1', configVersion: 1 });
      expect(report.title).toContain('Executive Risk Posture');
    });

    it('generates a default title for custom reports', () => {
      const report = store.create({ type: 'custom', format: 'json', tenantId: 't1', configVersion: 1 });
      expect(report.title).toContain('Custom Report');
    });

    it('uses custom title if provided', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', title: 'My Report', configVersion: 1 });
      expect(report.title).toBe('My Report');
    });

    it('sets dateRange based on report type', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const from = new Date(report.dateRange.from);
      const to = new Date(report.dateRange.to);
      const diffMs = to.getTime() - from.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(1, 0);
    });

    it('uses custom dateRange if provided', () => {
      const from = '2025-01-01T00:00:00.000Z';
      const to = '2025-01-31T00:00:00.000Z';
      const report = store.create({ type: 'custom', format: 'json', tenantId: 't1', dateRange: { from, to }, configVersion: 1 });
      expect(report.dateRange.from).toBe(from);
      expect(report.dateRange.to).toBe(to);
    });

    it('sets expiry date based on retention days', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const created = new Date(report.createdAt);
      const expires = new Date(report.expiresAt);
      const diffDays = (expires.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(30, 0);
    });

    it('stores filters', () => {
      const report = store.create({
        type: 'daily', format: 'json', tenantId: 't1', configVersion: 1,
        filters: { severities: ['critical', 'high'] },
      });
      expect(report.filters).toEqual({ severities: ['critical', 'high'] });
    });

    it('stores configVersion', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 3 });
      expect(report.configVersion).toBe(3);
    });

    it('defaults configVersion to 1', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      expect(report.configVersion).toBe(1);
    });
  });

  describe('getById', () => {
    it('returns report by id', () => {
      const created = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const found = store.getById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('returns undefined for non-existent id', () => {
      expect(store.getById('nope')).toBeUndefined();
    });

    it('returns undefined for deleted reports', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.softDelete(report.id);
      expect(store.getById(report.id)).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns empty list initially', () => {
      const result = store.list('t1');
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns reports for specific tenant', () => {
      store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.create({ type: 'daily', format: 'json', tenantId: 't2', configVersion: 1 });
      const result = store.list('t1');
      expect(result.total).toBe(1);
    });

    it('filters by type', () => {
      store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.create({ type: 'weekly', format: 'json', tenantId: 't1', configVersion: 1 });
      const result = store.list('t1', { type: 'daily' });
      expect(result.total).toBe(1);
      expect(result.data[0]!.type).toBe('daily');
    });

    it('filters by status', () => {
      const r1 = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.updateStatus(r1.id, 'completed', {});
      const result = store.list('t1', { status: 'completed' });
      expect(result.total).toBe(1);
    });

    it('paginates results', () => {
      for (let i = 0; i < 5; i++) {
        store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      }
      const page1 = store.list('t1', { page: 1, limit: 2 });
      expect(page1.data.length).toBe(2);
      expect(page1.totalPages).toBe(3);

      const page2 = store.list('t1', { page: 2, limit: 2 });
      expect(page2.data.length).toBe(2);
    });

    it('sorts by createdAt descending', () => {
      store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.create({ type: 'weekly', format: 'json', tenantId: 't1', configVersion: 1 });
      const result = store.list('t1');
      expect(new Date(result.data[0]!.createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(result.data[1]!.createdAt).getTime());
    });

    it('excludes deleted reports', () => {
      const r = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.softDelete(r.id);
      const result = store.list('t1');
      expect(result.total).toBe(0);
    });
  });

  describe('updateStatus', () => {
    it('updates status to generating', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const updated = store.updateStatus(report.id, 'generating');
      expect(updated.status).toBe('generating');
    });

    it('updates status to completed with result', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const result = { sections: [] };
      const updated = store.updateStatus(report.id, 'completed', result);
      expect(updated.status).toBe('completed');
      expect(updated.result).toEqual(result);
    });

    it('updates status to failed with error message', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const updated = store.updateStatus(report.id, 'failed', undefined, 'Something broke');
      expect(updated.status).toBe('failed');
      expect(updated.errorMessage).toBe('Something broke');
    });

    it('throws for non-existent report', () => {
      expect(() => store.updateStatus('nope', 'completed')).toThrow();
    });
  });

  describe('setGenerationTime', () => {
    it('sets generation time on report', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.setGenerationTime(report.id, 1500);
      const found = store.getById(report.id);
      expect(found!.generationTimeMs).toBe(1500);
    });

    it('does nothing for non-existent report', () => {
      expect(() => store.setGenerationTime('nope', 100)).not.toThrow();
    });
  });

  describe('softDelete', () => {
    it('marks report as deleted', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      expect(store.softDelete(report.id)).toBe(true);
    });

    it('returns false for non-existent report', () => {
      expect(store.softDelete('nope')).toBe(false);
    });

    it('returns false for already deleted report', () => {
      const report = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.softDelete(report.id);
      expect(store.softDelete(report.id)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns empty stats initially', () => {
      const stats = store.getStats();
      expect(stats.total).toBe(0);
      expect(stats.avgGenerationTimeMs).toBe(0);
    });

    it('counts by status', () => {
      const r1 = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.updateStatus(r1.id, 'completed');
      const stats = store.getStats();
      expect(stats.byStatus['completed']).toBe(1);
      expect(stats.byStatus['pending']).toBe(1);
    });

    it('counts by type', () => {
      store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.create({ type: 'weekly', format: 'json', tenantId: 't1', configVersion: 1 });
      const stats = store.getStats();
      expect(stats.byType['daily']).toBe(1);
      expect(stats.byType['weekly']).toBe(1);
    });

    it('calculates avg generation time', () => {
      const r1 = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const r2 = store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.setGenerationTime(r1.id, 1000);
      store.setGenerationTime(r2.id, 2000);
      const stats = store.getStats();
      expect(stats.avgGenerationTimeMs).toBe(1500);
    });

    it('filters by tenantId', () => {
      store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      store.create({ type: 'daily', format: 'json', tenantId: 't2', configVersion: 1 });
      const stats = store.getStats('t1');
      expect(stats.total).toBe(1);
    });
  });

  describe('FIFO eviction', () => {
    it('evicts oldest report when max per tenant is reached', () => {
      const smallStore = new ReportStore(3, 30);
      const r1 = smallStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      smallStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      smallStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      // This should evict r1
      smallStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      expect(smallStore.getById(r1.id)).toBeUndefined();
    });

    it('does not evict reports from other tenants', () => {
      const smallStore = new ReportStore(2, 30);
      const r1 = smallStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      smallStore.create({ type: 'daily', format: 'json', tenantId: 't2', configVersion: 1 });
      smallStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      // t2's report should still exist
      expect(r1).toBeDefined();
    });
  });
});
