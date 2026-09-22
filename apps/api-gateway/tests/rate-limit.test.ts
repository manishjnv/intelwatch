/**
 * @module api-gateway/tests/rate-limit
 * @description Tests for rate limiting middleware:
 *   - 429 + RATE_LIMIT_EXCEEDED shape after limit is hit
 *   - key = verified-token tenant, else CF-Connecting-IP / req.ip (never raw x-tenant-id — S147)
 *   - /health and /ready bypass rate limiting
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { loadJwtConfig, signAccessToken } from '@etip/shared-auth';
import { rateLimitKey } from '../src/plugins/rate-limit-key.js';

loadJwtConfig({
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
});
const tokenFor = (tenantId: string) =>
  signAccessToken({
    userId: '33333333-3333-4333-8333-333333333333', tenantId, email: 'u@acme.com',
    role: 'analyst', sessionId: '44444444-4444-4444-8444-444444444444',
  });
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

/** Build a minimal Fastify app with the same rate-limit config as app.ts */
async function buildTestApp(max = 2): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(rateLimit, {
    global: true,
    max,
    timeWindow: '1 minute',
    keyGenerator: rateLimitKey,
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

  it('keys authenticated requests by the verified token tenant (separate quotas per tenant)', async () => {
    const a = { authorization: `Bearer ${tokenFor(TENANT_A)}` };
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: a });
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: a });
    const rA3 = await app.inject({ method: 'GET', url: '/api/v1/test', headers: a });
    expect(rA3.statusCode).toBe(429);

    const rB1 = await app.inject({ method: 'GET', url: '/api/v1/test', headers: { authorization: `Bearer ${tokenFor(TENANT_B)}` } });
    expect(rB1.statusCode).toBe(200);
  });

  it('a spoofed x-tenant-id does NOT create a fresh bucket (S147)', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: { 'x-tenant-id': 'r1' } });
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: { 'x-tenant-id': 'r2' } });
    const r3 = await app.inject({ method: 'GET', url: '/api/v1/test', headers: { 'x-tenant-id': 'r3' } });
    expect(r3.statusCode).toBe(429);
  });

  it('anonymous clients are keyed by CF-Connecting-IP', async () => {
    const ip1 = { 'cf-connecting-ip': '203.0.113.1' };
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: ip1 });
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: ip1 });
    expect((await app.inject({ method: 'GET', url: '/api/v1/test', headers: ip1 })).statusCode).toBe(429);
    expect((await app.inject({ method: 'GET', url: '/api/v1/test', headers: { 'cf-connecting-ip': '203.0.113.2' } })).statusCode).toBe(200);
  });

  it('an invalid token falls back to the IP bucket', async () => {
    const bad = { authorization: 'Bearer forged.token.value', 'cf-connecting-ip': '203.0.113.9' };
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: bad });
    await app.inject({ method: 'GET', url: '/api/v1/test', headers: bad });
    expect((await app.inject({ method: 'GET', url: '/api/v1/test', headers: { 'cf-connecting-ip': '203.0.113.9' } })).statusCode).toBe(429);
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
