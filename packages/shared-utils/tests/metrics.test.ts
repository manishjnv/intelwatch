/**
 * @module @etip/shared-utils/tests/metrics
 * @description Tests for Prometheus metrics plugin (registerMetrics).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { registerMetrics } from '../src/metrics.js';

// ── Minimal Fastify-like mock ──────────────────────────────────────

interface MockRoute {
  path: string;
  opts: Record<string, unknown>;
  handler: (req: unknown, reply: unknown) => Promise<string>;
}

function createMockApp() {
  const hooks: Record<string, ((...args: unknown[]) => void)[]> = {};
  const routes: MockRoute[] = [];

  return {
    addHook(name: string, handler: (...args: unknown[]) => void) {
      if (!hooks[name]) hooks[name] = [];
      hooks[name].push(handler);
    },
    get(path: string, opts: Record<string, unknown>, handler: (req: unknown, reply: unknown) => Promise<string>) {
      routes.push({ path, opts, handler });
    },
    // Test helpers
    _hooks: hooks,
    _routes: routes,
    _fireOnResponse(req: Record<string, unknown>, reply: Record<string, unknown>) {
      const done = () => {};
      for (const h of hooks['onResponse'] ?? []) {
        h(req, reply, done);
      }
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('registerMetrics', () => {
  let app: ReturnType<typeof createMockApp>;

  beforeEach(async () => {
    app = createMockApp();
    await registerMetrics(app, 'test-service');
  });

  it('registers an onResponse hook', () => {
    expect(app._hooks['onResponse']).toBeDefined();
    expect(app._hooks['onResponse'].length).toBe(1);
  });

  it('registers a GET /metrics route', () => {
    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    expect(metricsRoute).toBeDefined();
  });

  it('/metrics route has rateLimit disabled', () => {
    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    expect((metricsRoute?.opts as { config?: { rateLimit?: boolean } }).config?.rateLimit).toBe(false);
  });

  it('/metrics returns Prometheus text format with service label', async () => {
    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    let contentType = '';
    const mockReply = { header: (k: string, v: string) => { if (k === 'Content-Type') contentType = v; } };

    const body = await metricsRoute!.handler({}, mockReply);

    expect(typeof body).toBe('string');
    expect(contentType).toContain('text/plain');
    expect(body).toContain('service="test-service"');
  });

  it('/metrics contains http_requests_total metric', async () => {
    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    const mockReply = { header: () => {} };
    const body = await metricsRoute!.handler({}, mockReply);

    expect(body).toContain('http_requests_total');
  });

  it('/metrics contains http_request_duration_seconds metric', async () => {
    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    const mockReply = { header: () => {} };
    const body = await metricsRoute!.handler({}, mockReply);

    expect(body).toContain('http_request_duration_seconds');
  });

  it('/metrics contains default process metrics', async () => {
    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    const mockReply = { header: () => {} };
    const body = await metricsRoute!.handler({}, mockReply);

    expect(body).toContain('process_cpu');
    expect(body).toContain('nodejs_version_info');
  });

  it('onResponse hook increments http_requests_total counter', async () => {
    // Simulate a request
    app._fireOnResponse(
      { method: 'GET', url: '/api/v1/feeds', routeOptions: { url: '/api/v1/feeds' } },
      { statusCode: 200, elapsedTime: 42 },
    );

    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    const mockReply = { header: () => {} };
    const body = await metricsRoute!.handler({}, mockReply);

    expect(body).toContain('http_requests_total{method="GET",route="/api/v1/feeds",status_code="200"');
  });

  it('onResponse hook records duration in histogram', async () => {
    app._fireOnResponse(
      { method: 'POST', url: '/api/v1/ioc', routeOptions: { url: '/api/v1/ioc' } },
      { statusCode: 201, elapsedTime: 150 }, // 150ms
    );

    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    const mockReply = { header: () => {} };
    const body = await metricsRoute!.handler({}, mockReply);

    // 150ms = 0.15s — should be in the 0.25 bucket
    expect(body).toContain('http_request_duration_seconds_bucket{');
    expect(body).toContain('method="POST"');
    expect(body).toContain('route="/api/v1/ioc"');
  });

  it('uses routeOptions.url for route label (not raw req.url)', async () => {
    app._fireOnResponse(
      { method: 'GET', url: '/api/v1/feeds/abc-123', routeOptions: { url: '/api/v1/feeds/:id' } },
      { statusCode: 200, elapsedTime: 10 },
    );

    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    const mockReply = { header: () => {} };
    const body = await metricsRoute!.handler({}, mockReply);

    expect(body).toContain('route="/api/v1/feeds/:id"');
    expect(body).not.toContain('route="/api/v1/feeds/abc-123"');
  });

  it('falls back to req.url when routeOptions.url is undefined', async () => {
    app._fireOnResponse(
      { method: 'GET', url: '/unknown-path', routeOptions: { url: undefined } },
      { statusCode: 404, elapsedTime: 5 },
    );

    const metricsRoute = app._routes.find((r) => r.path === '/metrics');
    const mockReply = { header: () => {} };
    const body = await metricsRoute!.handler({}, mockReply);

    expect(body).toContain('route="/unknown-path"');
  });

  it('isolated registries — two registerMetrics calls do not share state', async () => {
    const app2 = createMockApp();
    await registerMetrics(app2, 'other-service');

    // Fire request on app1 only
    app._fireOnResponse(
      { method: 'GET', url: '/test', routeOptions: { url: '/test' } },
      { statusCode: 200, elapsedTime: 10 },
    );

    // app2 metrics should NOT contain the request from app1
    const metricsRoute2 = app2._routes.find((r) => r.path === '/metrics');
    const mockReply = { header: () => {} };
    const body2 = await metricsRoute2!.handler({}, mockReply);

    expect(body2).toContain('service="other-service"');
    // Counter should be 0 (no _total line with value > 0 for this route)
    expect(body2).not.toContain('route="/test"');
  });
});
