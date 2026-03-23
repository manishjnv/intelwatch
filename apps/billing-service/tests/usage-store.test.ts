import { describe, it, expect, beforeEach } from 'vitest';
import { UsageStore } from '../src/services/usage-store.js';

describe('UsageStore', () => {
  let store: UsageStore;

  beforeEach(() => {
    store = new UsageStore();
  });

  // ── Track usage ─────────────────────────────────────────────────
  describe('trackUsage', () => {
    it('tracks api_call usage', () => {
      store.trackUsage('t1', 'api_call', 1);
      const usage = store.getUsage('t1');
      expect(usage.api_calls).toBe(1);
    });

    it('tracks ioc_ingested usage', () => {
      store.trackUsage('t1', 'ioc_ingested', 50);
      const usage = store.getUsage('t1');
      expect(usage.iocs_ingested).toBe(50);
    });

    it('tracks enrichment usage', () => {
      store.trackUsage('t1', 'enrichment', 5);
      const usage = store.getUsage('t1');
      expect(usage.enrichments).toBe(5);
    });

    it('tracks storage_kb usage', () => {
      store.trackUsage('t1', 'storage_kb', 1024);
      const usage = store.getUsage('t1');
      expect(usage.storage_kb).toBe(1024);
    });

    it('accumulates multiple calls', () => {
      store.trackUsage('t1', 'api_call', 10);
      store.trackUsage('t1', 'api_call', 5);
      expect(store.getUsage('t1').api_calls).toBe(15);
    });
  });

  // ── Get usage ───────────────────────────────────────────────────
  describe('getUsage', () => {
    it('returns zero usage for new tenant', () => {
      const usage = store.getUsage('new_tenant');
      expect(usage.api_calls).toBe(0);
      expect(usage.iocs_ingested).toBe(0);
      expect(usage.enrichments).toBe(0);
      expect(usage.storage_kb).toBe(0);
    });

    it('isolates usage between tenants', () => {
      store.trackUsage('t1', 'api_call', 100);
      store.trackUsage('t2', 'api_call', 50);
      expect(store.getUsage('t1').api_calls).toBe(100);
      expect(store.getUsage('t2').api_calls).toBe(50);
    });
  });

  // ── Usage percentage ────────────────────────────────────────────
  describe('getUsagePercent', () => {
    it('returns 0% when usage is 0', () => {
      const pct = store.getUsagePercent('t1', 'api_calls', 1000);
      expect(pct).toBe(0);
    });

    it('returns 50% when at half the limit', () => {
      store.trackUsage('t1', 'api_call', 500);
      const pct = store.getUsagePercent('t1', 'api_calls', 1000);
      expect(pct).toBe(50);
    });

    it('returns 100% when at the limit', () => {
      store.trackUsage('t1', 'api_call', 1000);
      const pct = store.getUsagePercent('t1', 'api_calls', 1000);
      expect(pct).toBe(100);
    });

    it('returns >100% when over limit', () => {
      store.trackUsage('t1', 'api_call', 1200);
      const pct = store.getUsagePercent('t1', 'api_calls', 1000);
      expect(pct).toBeGreaterThan(100);
    });

    it('returns 0% for unlimited limit (-1)', () => {
      store.trackUsage('t1', 'api_call', 99999);
      const pct = store.getUsagePercent('t1', 'api_calls', -1);
      expect(pct).toBe(0); // unlimited never hits threshold
    });
  });

  // ── Limit check ─────────────────────────────────────────────────
  describe('isOverLimit', () => {
    it('returns false when under limit', () => {
      store.trackUsage('t1', 'api_call', 50);
      expect(store.isOverLimit('t1', 'api_calls', 100)).toBe(false);
    });

    it('returns false when exactly at limit', () => {
      store.trackUsage('t1', 'api_call', 100);
      expect(store.isOverLimit('t1', 'api_calls', 100)).toBe(false);
    });

    it('returns true when over limit', () => {
      store.trackUsage('t1', 'api_call', 101);
      expect(store.isOverLimit('t1', 'api_calls', 100)).toBe(true);
    });

    it('returns false for unlimited limit (-1)', () => {
      store.trackUsage('t1', 'api_call', 1_000_000);
      expect(store.isOverLimit('t1', 'api_calls', -1)).toBe(false);
    });
  });

  // ── Alert thresholds ────────────────────────────────────────────
  describe('getAlertThresholds', () => {
    it('no alerts when usage is low', () => {
      store.trackUsage('t1', 'api_call', 10);
      const alerts = store.getAlertThresholds('t1', { api_calls: 1000, iocs_ingested: -1, enrichments: -1, storage_kb: -1 });
      expect(alerts).toHaveLength(0);
    });

    it('returns 80% alert when at 80%', () => {
      store.trackUsage('t1', 'api_call', 800);
      const alerts = store.getAlertThresholds('t1', { api_calls: 1000, iocs_ingested: -1, enrichments: -1, storage_kb: -1 });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].metric).toBe('api_calls');
      expect(alerts[0].threshold).toBe(80);
    });

    it('returns 90% alert when at 90%', () => {
      store.trackUsage('t1', 'api_call', 900);
      const alerts = store.getAlertThresholds('t1', { api_calls: 1000, iocs_ingested: -1, enrichments: -1, storage_kb: -1 });
      const alert = alerts.find((a) => a.threshold === 90);
      expect(alert).toBeDefined();
    });

    it('returns 100% alert when at limit', () => {
      store.trackUsage('t1', 'api_call', 1000);
      const alerts = store.getAlertThresholds('t1', { api_calls: 1000, iocs_ingested: -1, enrichments: -1, storage_kb: -1 });
      const critical = alerts.find((a) => a.threshold === 100);
      expect(critical).toBeDefined();
    });
  });

  // ── Usage history ───────────────────────────────────────────────
  describe('getUsageHistory', () => {
    it('returns empty history for new tenant', () => {
      const history = store.getUsageHistory('t1', 30);
      expect(history).toHaveLength(0);
    });

    it('records a snapshot', () => {
      store.trackUsage('t1', 'api_call', 100);
      store.recordSnapshot('t1');
      const history = store.getUsageHistory('t1', 30);
      expect(history).toHaveLength(1);
      expect(history[0].api_calls).toBe(100);
    });
  });

  // ── Reset ───────────────────────────────────────────────────────
  describe('resetMonthly', () => {
    it('resets api_calls and enrichments but not storage', () => {
      store.trackUsage('t1', 'api_call', 500);
      store.trackUsage('t1', 'storage_kb', 2048);
      store.resetMonthly('t1');
      const usage = store.getUsage('t1');
      expect(usage.api_calls).toBe(0);
      expect(usage.storage_kb).toBe(2048); // storage is cumulative
    });
  });
});
