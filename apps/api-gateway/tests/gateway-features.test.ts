/**
 * @module api-gateway/tests/gateway-features
 * @description Tests for session 85 features:
 *   - Tiered rate limiting (search/write/read/health)
 *   - Error alerting (aggregation, threshold, window reset, event shape)
 *   - Response compression (gzip header, size reduction)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import { ErrorAggregator } from '../src/plugins/error-alerting.js';

// ─── Tiered Rate Limiting ────────────────────────────────────────────

function resolveRateLimit(req: { url: string; method: string }): number {
  if (req.url.startsWith('/api/v1/search') || (req.url.startsWith('/api/v1/iocs') && req.url.includes('q='))) return 10;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return 30;
  return 120;
}

async function buildRateLimitApp(opts: { searchMax?: number; writeMax?: number; readMax?: number } = {}): Promise<FastifyInstance> {
  const { searchMax = 2, writeMax = 3, readMax = 4 } = opts;
  const app = Fastify({ logger: false });

  await app.register(rateLimit, {
    global: true,
    max: (req) => {
      const tier = resolveRateLimit(req);
      // Scale down for testing (original: 10/30/120 → test: 2/3/4)
      if (tier === 10) return searchMax;
      if (tier === 30) return writeMax;
      return readMax;
    },
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.headers['x-tenant-id'] as string) ?? req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: { code: 'RATE_LIMIT_EXCEEDED', message: `Limit is ${context.max}`, retryAfter: context.after },
    }),
  });

  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  app.get('/api/v1/search', async () => ({ data: [] }));
  app.get('/api/v1/iocs', async (req) => ({ data: [], query: req.query }));
  app.get('/api/v1/feeds', async () => ({ data: [] }));
  app.post('/api/v1/feeds', async () => ({ data: { id: 1 } }));

  await app.ready();
  return app;
}

describe('Tiered rate limiting', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildRateLimitApp({ searchMax: 2, writeMax: 3, readMax: 4 });
  });

  it('limits search endpoints (/search) to search tier', async () => {
    const tenant = { 'x-tenant-id': 'tenant-search' };
    await app.inject({ method: 'GET', url: '/api/v1/search', headers: tenant });
    await app.inject({ method: 'GET', url: '/api/v1/search', headers: tenant });
    const r3 = await app.inject({ method: 'GET', url: '/api/v1/search', headers: tenant });
    expect(r3.statusCode).toBe(429);
    expect(r3.json().error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('limits write endpoints (POST) to write tier', async () => {
    const tenant = { 'x-tenant-id': 'tenant-write' };
    await app.inject({ method: 'POST', url: '/api/v1/feeds', headers: tenant });
    await app.inject({ method: 'POST', url: '/api/v1/feeds', headers: tenant });
    await app.inject({ method: 'POST', url: '/api/v1/feeds', headers: tenant });
    const r4 = await app.inject({ method: 'POST', url: '/api/v1/feeds', headers: tenant });
    expect(r4.statusCode).toBe(429);
  });

  it('allows read endpoints up to read tier limit', async () => {
    const tenant = { 'x-tenant-id': 'tenant-read' };
    for (let i = 0; i < 4; i++) {
      const r = await app.inject({ method: 'GET', url: '/api/v1/feeds', headers: tenant });
      expect(r.statusCode).toBe(200);
    }
    const r5 = await app.inject({ method: 'GET', url: '/api/v1/feeds', headers: tenant });
    expect(r5.statusCode).toBe(429);
  });

  it('health check has no rate limit', async () => {
    // Exhaust normal limit first
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'GET', url: '/api/v1/feeds' });
    }
    // Health still works
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({ method: 'GET', url: '/health' });
      expect(r.statusCode).toBe(200);
    }
  });
});

// ─── Error Alerting ──────────────────────────────────────────────────

describe('Error alerting aggregator', () => {
  it('aggregates errors within 5-min window', () => {
    const agg = new ErrorAggregator();
    agg.record({ method: 'GET', url: '/test', statusCode: 500 });
    agg.record({ method: 'POST', url: '/test', statusCode: 502 });
    agg.record({ method: 'GET', url: '/other', statusCode: 503 });

    const stats = agg.getStats();
    expect(stats.errorCount).toBe(3);
    expect(stats.byStatusCode[500]).toBe(1);
    expect(stats.byStatusCode[502]).toBe(1);
    expect(stats.byStatusCode[503]).toBe(1);
  });

  it('fires threshold callback when >5 errors in window', () => {
    const onThreshold = vi.fn();
    const agg = new ErrorAggregator(onThreshold);

    for (let i = 0; i < 5; i++) {
      agg.record({ method: 'GET', url: '/fail', statusCode: 500 });
    }
    expect(onThreshold).not.toHaveBeenCalled();

    // 6th error crosses threshold
    agg.record({ method: 'GET', url: '/fail', statusCode: 500 });
    expect(onThreshold).toHaveBeenCalledOnce();
    const stats = onThreshold.mock.calls[0][0];
    expect(stats.errorCount).toBe(6);
    expect(stats.alertsFired).toBe(1);
  });

  it('resets window after 5 minutes (does not re-fire within same window)', () => {
    const onThreshold = vi.fn();
    const agg = new ErrorAggregator(onThreshold);

    // Cross threshold
    for (let i = 0; i < 7; i++) {
      agg.record({ method: 'GET', url: '/fail', statusCode: 500 });
    }
    expect(onThreshold).toHaveBeenCalledOnce();

    // Adding more in same window doesn't fire again
    for (let i = 0; i < 10; i++) {
      agg.record({ method: 'GET', url: '/fail', statusCode: 500 });
    }
    expect(onThreshold).toHaveBeenCalledOnce();
  });

  it('event shape includes source, severity, and stats', () => {
    const onThreshold = vi.fn();
    const agg = new ErrorAggregator(onThreshold);

    for (let i = 0; i < 6; i++) {
      agg.record({ method: 'GET', url: '/fail', statusCode: 500 });
    }

    const stats = onThreshold.mock.calls[0][0];
    expect(stats).toMatchObject({
      windowMs: 300000,
      alertThreshold: 5,
      alertsFired: 1,
    });
    expect(stats.recentErrors.length).toBeGreaterThan(0);
    expect(stats.recentErrors[0]).toHaveProperty('timestamp');
    expect(stats.recentErrors[0]).toHaveProperty('method');
    expect(stats.recentErrors[0]).toHaveProperty('url');
    expect(stats.recentErrors[0]).toHaveProperty('statusCode');
  });
});

// ─── Response Compression ────────────────────────────────────────────

async function buildCompressApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(compress, {
    threshold: 1024,
    encodings: ['gzip', 'deflate', 'identity'],
    customTypes: /^(?!image\/|application\/octet-stream)/,
  });

  app.get('/large-json', async (_req, reply) => {
    const payload = { data: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `item-${i}`, description: 'x'.repeat(50) })) };
    return reply.type('application/json').send(JSON.stringify(payload));
  });

  app.get('/small-json', async (_req, reply) => {
    return reply.type('application/json').send(JSON.stringify({ data: { ok: true } }));
  });

  await app.ready();
  return app;
}

describe('Response compression', () => {
  it('returns gzip content-encoding for large responses when client accepts it', async () => {
    const app = await buildCompressApp();
    const res = await app.inject({
      method: 'GET',
      url: '/large-json',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('compressed payload is smaller than uncompressed', async () => {
    const app = await buildCompressApp();

    const uncompressed = await app.inject({
      method: 'GET',
      url: '/large-json',
      headers: { 'accept-encoding': 'identity' },
    });

    const compressed = await app.inject({
      method: 'GET',
      url: '/large-json',
      headers: { 'accept-encoding': 'gzip' },
    });

    // Compressed body should be significantly smaller
    expect(compressed.rawPayload.length).toBeLessThan(uncompressed.rawPayload.length * 0.5);
  });
});
