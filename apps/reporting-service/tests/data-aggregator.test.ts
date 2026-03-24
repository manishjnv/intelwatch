import { describe, it, expect, beforeEach } from 'vitest';
import { DataAggregator } from '../src/services/data-aggregator.js';
import { ReportStore } from '../src/services/report-store.js';

describe('DataAggregator', () => {
  let aggregator: DataAggregator;
  let reportStore: ReportStore;

  beforeEach(() => {
    aggregator = new DataAggregator();
    reportStore = new ReportStore();
  });

  describe('aggregate', () => {
    it('returns aggregated data for daily report', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);

      expect(data.iocStats).toBeDefined();
      expect(data.feedStats).toBeDefined();
      expect(data.actorStats).toBeDefined();
      expect(data.malwareStats).toBeDefined();
      expect(data.vulnStats).toBeDefined();
      expect(data.costStats).toBeDefined();
      expect(data.riskScore).toBeGreaterThanOrEqual(0);
      expect(data.generatedAt).toBeTruthy();
    });

    it('returns aggregated data for weekly report', async () => {
      const report = reportStore.create({ type: 'weekly', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.iocStats.total).toBeGreaterThan(0);
    });

    it('returns aggregated data for monthly report', async () => {
      const report = reportStore.create({ type: 'monthly', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.iocStats.total).toBeGreaterThan(0);
    });

    it('returns aggregated data for executive report', async () => {
      const report = reportStore.create({ type: 'executive', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.riskScore).toBeGreaterThanOrEqual(0);
      expect(data.riskScore).toBeLessThanOrEqual(100);
    });

    it('returns aggregated data for custom report', async () => {
      const report = reportStore.create({
        type: 'custom', format: 'json', tenantId: 't1', configVersion: 1,
        dateRange: { from: '2025-01-01T00:00:00Z', to: '2025-01-31T00:00:00Z' },
      });
      const data = await aggregator.aggregate(report);
      expect(data.iocStats).toBeDefined();
    });

    it('IOC stats have severity distribution', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.iocStats.bySeverity).toBeDefined();
      expect(data.iocStats.bySeverity['critical']).toBeGreaterThanOrEqual(0);
    });

    it('IOC stats have type distribution', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.iocStats.byType).toBeDefined();
    });

    it('IOC stats have top threats', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.iocStats.topThreats.length).toBeGreaterThan(0);
    });

    it('IOC stats have trends', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.iocStats.trends.length).toBeGreaterThan(0);
    });

    it('feed stats have health score', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.feedStats.healthScore).toBeGreaterThanOrEqual(0);
      expect(data.feedStats.healthScore).toBeLessThanOrEqual(100);
    });

    it('actor stats have top actors', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.actorStats.topActors.length).toBeGreaterThan(0);
    });

    it('malware stats have top families', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.malwareStats.topFamilies.length).toBeGreaterThan(0);
    });

    it('vuln stats have top vulns', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.vulnStats.topVulns.length).toBeGreaterThan(0);
    });

    it('cost stats have total cost', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.costStats.totalCost).toBeGreaterThanOrEqual(0);
    });

    it('risk score is bounded 0-100', async () => {
      const report = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const data = await aggregator.aggregate(report);
      expect(data.riskScore).toBeGreaterThanOrEqual(0);
      expect(data.riskScore).toBeLessThanOrEqual(100);
    });

    it('weekly report has higher IOC totals than daily', async () => {
      const daily = reportStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
      const weekly = reportStore.create({ type: 'weekly', format: 'json', tenantId: 't1', configVersion: 1 });
      const dailyData = await aggregator.aggregate(daily);
      const weeklyData = await aggregator.aggregate(weekly);
      expect(weeklyData.iocStats.total).toBeGreaterThan(dailyData.iocStats.total);
    });
  });
});
