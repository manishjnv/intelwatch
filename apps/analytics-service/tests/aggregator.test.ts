import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Aggregator, defaultEndpoints } from '../src/services/aggregator.js';
import { AnalyticsStore } from '../src/services/analytics-store.js';
import { TrendCalculator } from '../src/services/trend-calculator.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function okResponse(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}
function failResponse() {
  return { ok: false, json: async () => ({}) };
}

describe('Aggregator', () => {
  let store: AnalyticsStore;
  let trends: TrendCalculator;
  let agg: Aggregator;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new AnalyticsStore();
    trends = new TrendCalculator();
    agg = new Aggregator(store, trends);
    mockFetch.mockResolvedValue(okResponse({}));
  });

  afterEach(() => { vi.restoreAllMocks(); });

  describe('defaultEndpoints', () => {
    it('returns endpoints for all 12 services', () => {
      const eps = defaultEndpoints();
      expect(Object.keys(eps).length).toBe(12);
      expect(eps.ioc).toContain('3007');
      expect(eps.alert).toContain('3023');
    });
  });

  describe('getDashboard', () => {
    it('returns dashboard data with widgets', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 1200, critical: 45, open: 38 }));
      const data = await agg.getDashboard('tenant-1');
      expect(data.generatedAt).toBeTruthy();
      expect(data.widgets).toBeDefined();
      expect(data.widgets['total-iocs']).toBeDefined();
    });

    it('returns cached data on second call', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 100 }));
      const first = await agg.getDashboard('tenant-1');
      expect(first.cacheHit).toBe(false);
      const second = await agg.getDashboard('tenant-1');
      expect(second.cacheHit).toBe(true);
    });

    it('makes parallel API calls', async () => {
      mockFetch.mockResolvedValue(okResponse({}));
      await agg.getDashboard('t1');
      // 4 parallel calls: ioc stats, alert stats, feed stats, enrichment stats
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('handles service failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const data = await agg.getDashboard('t1');
      expect(data.widgets['total-iocs']!.value).toBe(0);
      expect(data.widgets['open-alerts']!.value).toBe(0);
    });

    it('records trend data from API responses', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 500, critical: 20, open: 10, activeCount: 5, enrichmentRate: 90 }));
      await agg.getDashboard('t1');
      expect(trends.getMetrics().length).toBeGreaterThan(0);
    });
  });

  describe('getExecutiveSummary', () => {
    it('returns executive summary with risk posture', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 200, open: 5, critical: 10, escalated: 0 }));
      const summary = await agg.getExecutiveSummary('t1');
      expect(summary.riskPosture).toBeDefined();
      expect(summary.riskScore).toBeGreaterThanOrEqual(0);
      expect(summary.riskScore).toBeLessThanOrEqual(100);
      expect(summary.keyMetrics.length).toBeGreaterThanOrEqual(3);
      expect(summary.recommendations.length).toBeGreaterThanOrEqual(1);
      expect(summary.generatedAt).toBeTruthy();
    });

    it('calculates low risk when no alerts', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 0, open: 0, critical: 0, escalated: 0 }));
      const summary = await agg.getExecutiveSummary('t1');
      expect(summary.riskPosture).toBe('low');
      expect(summary.riskScore).toBe(0);
    });

    it('calculates high risk with many open alerts', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 500, open: 25, critical: 40, escalated: 3 }));
      const summary = await agg.getExecutiveSummary('t1');
      expect(['high', 'critical']).toContain(summary.riskPosture);
      expect(summary.riskScore).toBeGreaterThanOrEqual(60);
    });

    it('caches executive summary', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 10, open: 1, critical: 2, escalated: 0 }));
      await agg.getExecutiveSummary('t1');
      await agg.getExecutiveSummary('t1');
      // Only 2 calls (ioc + alert) — second call uses cache
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getServiceHealth', () => {
    it('returns health for 21 services', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
      const health = await agg.getServiceHealth();
      expect(health.length).toBe(21);
      expect(health[0].service).toBeTruthy();
      expect(health[0].port).toBeGreaterThan(0);
    });

    it('marks services as healthy when they respond', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
      const health = await agg.getServiceHealth();
      expect(health.every(h => h.status === 'healthy')).toBe(true);
    });

    it('marks services as unknown on timeout', async () => {
      mockFetch.mockRejectedValue(new Error('timeout'));
      const health = await agg.getServiceHealth();
      expect(health.every(h => h.status === 'unknown')).toBe(true);
    });

    it('includes response time', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) });
      const health = await agg.getServiceHealth();
      for (const h of health) {
        expect(h.responseMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getTopIocs', () => {
    it('returns IOC list from cache or API', async () => {
      mockFetch.mockResolvedValue(okResponse([{ id: 'ioc-1', value: '1.2.3.4' }]));
      const data = await agg.getTopIocs('t1', 5);
      expect(Array.isArray(data)).toBe(true);
    });

    it('returns empty array on failure', async () => {
      mockFetch.mockRejectedValue(new Error('fail'));
      const data = await agg.getTopIocs('t1');
      expect(data).toEqual([]);
    });
  });

  describe('getTopActors', () => {
    it('returns actor list', async () => {
      mockFetch.mockResolvedValue(okResponse([{ id: 'actor-1', name: 'APT29' }]));
      const data = await agg.getTopActors('t1');
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('getTopVulns', () => {
    it('returns vulnerability list', async () => {
      mockFetch.mockResolvedValue(okResponse([{ id: 'cve-1', cveId: 'CVE-2026-1234' }]));
      const data = await agg.getTopVulns('t1');
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('getFeedPerformance', () => {
    it('returns feed metrics', async () => {
      mockFetch.mockResolvedValue(okResponse({ activeCount: 8, totalArticles: 500 }));
      const data = await agg.getFeedPerformance('t1');
      expect(data).toBeDefined();
    });
  });

  describe('getAlertSummary', () => {
    it('returns alert breakdown', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 200, open: 30 }));
      const data = await agg.getAlertSummary('t1');
      expect(data).toBeDefined();
    });
  });

  describe('getEnrichmentQuality', () => {
    it('buckets enriched count into high/medium/low confidence', async () => {
      // total=1000, enriched=600 → high=360 (60%), medium=180 (30%), low=60 (10%)
      mockFetch.mockResolvedValue(okResponse({ total: 1000, enriched: 600, pending: 400 }));
      const data = await agg.getEnrichmentQuality('t1') as Record<string, number>;
      expect(data.total).toBe(1000);
      expect(data.highConfidence).toBe(360);
      expect(data.mediumConfidence).toBe(180);
      expect(data.lowConfidence).toBe(60);
      expect(data.highPct).toBe(36);
      expect(data.mediumPct).toBe(18);
      expect(data.lowPct).toBe(6);
    });

    it('maps pending field to pendingEnrichment', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 500, enriched: 300, pending: 200 }));
      const data = await agg.getEnrichmentQuality('t1') as Record<string, number>;
      expect(data.pendingEnrichment).toBe(200);
    });

    it('returns all-zero result when total is zero', async () => {
      mockFetch.mockResolvedValue(okResponse({ total: 0, enriched: 0, pending: 0 }));
      const data = await agg.getEnrichmentQuality('t1') as Record<string, number>;
      expect(data.total).toBe(0);
      expect(data.highConfidence).toBe(0);
      expect(data.mediumConfidence).toBe(0);
      expect(data.lowConfidence).toBe(0);
      expect(data.pendingEnrichment).toBe(0);
      expect(data.highPct).toBe(0);
      expect(data.mediumPct).toBe(0);
      expect(data.lowPct).toBe(0);
    });
  });
});
