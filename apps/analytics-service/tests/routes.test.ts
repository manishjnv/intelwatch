import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AnalyticsStore } from '../src/services/analytics-store.js';
import { TrendCalculator } from '../src/services/trend-calculator.js';
import { Aggregator } from '../src/services/aggregator.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Analytics API Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let store: AnalyticsStore;
  let trends: TrendCalculator;
  let aggregator: Aggregator;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { total: 100, open: 10, critical: 5, activeCount: 8, enrichmentRate: 90, acknowledged: 3, resolved: 80, escalated: 2 } }) });

    const config = loadConfig({ TI_LOG_LEVEL: 'silent' });
    store = new AnalyticsStore();
    trends = new TrendCalculator();
    trends.seedDemo('ioc.total', 1000, 100, 7);
    trends.seedDemo('alert.open', 30, 10, 7);
    aggregator = new Aggregator(store, trends);

    app = await buildApp({
      config,
      dashboardDeps: { aggregator },
      trendDeps: { trends },
      executiveDeps: { aggregator, store, trends },
    });
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  // ── Health ──
  describe('GET /health', () => {
    it('returns 200 with service name', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.service).toBe('analytics-service');
      expect(body.status).toBe('ok');
    });
  });

  describe('GET /ready', () => {
    it('returns 200 with ready=true', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).ready).toBe(true);
    });
  });

  // ── Dashboard ──
  describe('GET /api/v1/analytics', () => {
    it('returns 200 with dashboard data', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data).toBeDefined();
      expect(body.data.widgets).toBeDefined();
      expect(body.data.generatedAt).toBeTruthy();
    });

    it('includes total-iocs widget', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics' });
      const body = JSON.parse(res.payload);
      expect(body.data.widgets['total-iocs']).toBeDefined();
      expect(body.data.widgets['total-iocs'].label).toBe('Total IOCs');
    });

    it('includes open-alerts widget', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics' });
      const body = JSON.parse(res.payload);
      expect(body.data.widgets['open-alerts']).toBeDefined();
    });
  });

  describe('GET /api/v1/analytics/widgets', () => {
    it('returns all widget definitions', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/widgets' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(14);
      expect(body.total).toBeGreaterThanOrEqual(14);
    });

    it('filters by category', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/widgets?category=threats' });
      const body = JSON.parse(res.payload);
      expect(body.data.every((w: { category: string }) => w.category === 'threats')).toBe(true);
    });
  });

  describe('GET /api/v1/analytics/widgets/:widgetId', () => {
    it('returns specific widget data', async () => {
      // Pre-populate dashboard cache
      await app.inject({ method: 'GET', url: '/api/v1/analytics' });
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/widgets/total-iocs' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.id).toBe('total-iocs');
    });

    it('returns 404 for unknown widget', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/widgets/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Top entities ──
  describe('GET /api/v1/analytics/top-iocs', () => {
    it('returns 200 with IOC data', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/top-iocs' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/analytics/top-actors', () => {
    it('returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/top-actors' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/analytics/top-vulns', () => {
    it('returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/top-vulns' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/analytics/feed-performance', () => {
    it('returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/feed-performance' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/analytics/alert-summary', () => {
    it('returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/alert-summary' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Trends ──
  describe('GET /api/v1/analytics/trends', () => {
    it('returns all trends with default 7d period', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/trends' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(2);
      expect(body.period).toBe('7d');
    });

    it('accepts 30d period', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/trends?period=30d' });
      const body = JSON.parse(res.payload);
      expect(body.period).toBe('30d');
    });

    it('lists available metrics', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/trends' });
      const body = JSON.parse(res.payload);
      expect(body.metrics).toContain('ioc.total');
      expect(body.metrics).toContain('alert.open');
    });
  });

  describe('GET /api/v1/analytics/trends/:metric', () => {
    it('returns trend for specific metric', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/trends/ioc.total' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.metric).toBe('ioc.total');
      expect(body.data.points.length).toBeGreaterThan(0);
    });

    it('returns 404 for unknown metric', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/trends/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Executive ──
  describe('GET /api/v1/analytics/executive', () => {
    it('returns executive summary', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/executive' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.riskPosture).toBeDefined();
      expect(body.data.riskScore).toBeGreaterThanOrEqual(0);
      expect(body.data.keyMetrics).toBeDefined();
      expect(body.data.recommendations).toBeDefined();
    });
  });

  describe('GET /api/v1/analytics/stats', () => {
    it('returns analytics stats', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.cacheEntries).toBeGreaterThanOrEqual(0);
      expect(body.data.trendMetrics).toBeGreaterThanOrEqual(0);
      expect(body.data.servicesMonitored).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/analytics/service-health', () => {
    it('returns health for all services', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/service-health' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.length).toBeGreaterThanOrEqual(20);
    });
  });

  // ── Error handling ──
  describe('Error handling', () => {
    it('returns 404 for unknown route', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/analytics/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });
});
