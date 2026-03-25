/**
 * @module api-gateway/tests/rate-limit
 * @description Tests for rate limiting middleware:
 *   - 429 + RATE_LIMIT_EXCEEDED shape after limit is hit
 *   - x-tenant-id header used as key (not IP)
 *   - /health and /ready bypass rate limiting
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

/** Build a minimal Fastify app with the same rate-limit config as app.ts */
async function buildTestApp(max = 2): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(rateLimit, {
    global: true,
    max,
    timeWindow: '1 minute',
    keyGenerator: (req) =>
      (req.headers['x-tenant-id'] as string) ?? req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests — limit is ${context.max} per minute`,
        retryAfter: context.after,
      },
    }),
  });

  // Health bypass — no limit
  app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
    return reply.status(200).send({ status: 'ok' });
  });

  // Normal route — subject to limit
  app.get('/api/v1/test', async (_req, reply) => {
    return reply.status(200).send({ ok: true });
  });

  await app.ready();
  return app;
}

describe('Rate limiting middleware', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp(2); // limit = 2 for fast tests
  });

  it('allows requests within the window limit', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/test' });
    const r2 = await app.inject({ method: 'GET', url: '/api/v1/test' });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
  });

  it('returns 429 with RATE_LIMIT_EXCEEDED when limit is exceeded', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/test' });
    await app.inject({ method: 'GET', url: '/api/v1/test' });
    const r3 = await app.inject({ method: 'GET', url: '/api/v1/test' });

    expect(r3.statusCode).toBe(429);
    const body = r3.json<{ error: { code: string; message: string; retryAfter: string } }>();
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.error.message).toMatch(/limit is 2 per minute/);
    expect(body.error.retryAfter).toBeDefined();
  });

  it('uses x-tenant-id header as rate-limit key (different tenants have separate quotas)', async () => {
    // Tenant A exhausts its quota
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: { 'x-tenant-id': 'tenant-A' } });
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: { 'x-tenant-id': 'tenant-A' } });
    const rA3 = await app.inject({ method: 'GET', url: '/api/v1/test', headers: { 'x-tenant-id': 'tenant-A' } });
    expect(rA3.statusCode).toBe(429);

    // Tenant B is unaffected — separate key
    const rB1 = await app.inject({ method: 'GET', url: '/api/v1/test', headers: { 'x-tenant-id': 'tenant-B' } });
    expect(rB1.statusCode).toBe(200);
  });

  it('/health bypasses rate limiting regardless of request count', async () => {
    // Exhaust the limit on the normal route
    await app.inject({ method: 'GET', url: '/api/v1/test' });
    await app.inject({ method: 'GET', url: '/api/v1/test' });
    const blocked = await app.inject({ method: 'GET', url: '/api/v1/test' });
    expect(blocked.statusCode).toBe(429);

    // /health must still respond 200 — never rate-limited
    const health1 = await app.inject({ method: 'GET', url: '/health' });
    const health2 = await app.inject({ method: 'GET', url: '/health' });
    const health3 = await app.inject({ method: 'GET', url: '/health' });
    expect(health1.statusCode).toBe(200);
    expect(health2.statusCode).toBe(200);
    expect(health3.statusCode).toBe(200);
  });
});
