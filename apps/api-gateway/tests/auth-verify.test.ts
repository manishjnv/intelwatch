/**
 * Tests for GET /api/v1/auth/verify — nginx auth_request target (S147 security fix).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { loadJwtConfig, signAccessToken } from '@etip/shared-auth';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { authVerifyRoutes } from '../src/routes/auth-verify.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';

function token(role: 'tenant_admin' | 'analyst' | 'super_admin', tenantId = TENANT_A): string {
  return signAccessToken({ userId: USER_ID, tenantId, email: 'u@acme.com', role, sessionId: SESSION_ID });
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Tight global limit proves the verify route is exempt (it runs on every proxied call).
  await app.register(rateLimit, { global: true, max: 3, timeWindow: 60_000 });
  await app.register(sensible);
  registerErrorHandler(app);
  await app.register(authVerifyRoutes, { prefix: '/api/v1/auth' });
  await app.ready();
  return app;
}

describe('GET /api/v1/auth/verify[/super-admin]', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    loadJwtConfig(TEST_JWT_ENV);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  const verify = (headers: Record<string, string>, suffix = '') =>
    app.inject({ method: 'GET', url: `/api/v1/auth/verify${suffix}`, headers });

  it('401 without Authorization header', async () => {
    const res = await verify({});
    expect(res.statusCode).toBe(401);
    expect(res.headers['x-auth-tenant-id']).toBeUndefined();
  });

  it('401 for malformed and forged tokens', async () => {
    expect((await verify({ authorization: 'Basic abc' })).statusCode).toBe(401);
    expect((await verify({ authorization: 'Bearer not.a.jwt' })).statusCode).toBe(401);
    const forged = token('super_admin').slice(0, -4) + 'AAAA';
    expect((await verify({ authorization: `Bearer ${forged}` })).statusCode).toBe(401);
  });

  it('204 with identity headers from the token for a tenant user', async () => {
    const res = await verify({ authorization: `Bearer ${token('analyst')}` });
    expect(res.statusCode).toBe(204);
    expect(res.headers['x-auth-tenant-id']).toBe(TENANT_A);
    expect(res.headers['x-auth-user-id']).toBe(USER_ID);
    expect(res.headers['x-auth-role']).toBe('analyst');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('ignores a spoofed x-tenant-id from a non-super-admin (token tenant wins)', async () => {
    const res = await verify({ authorization: `Bearer ${token('tenant_admin')}`, 'x-tenant-id': TENANT_B });
    expect(res.statusCode).toBe(204);
    expect(res.headers['x-auth-tenant-id']).toBe(TENANT_A);
  });

  it('ignores spoofed x-user-role (role comes from the token)', async () => {
    const res = await verify({ authorization: `Bearer ${token('analyst')}`, 'x-user-role': 'super_admin' });
    expect(res.headers['x-auth-role']).toBe('analyst');
  });

  it('super admin may target another tenant via x-tenant-id (I-08)', async () => {
    const res = await verify({ authorization: `Bearer ${token('super_admin')}`, 'x-tenant-id': TENANT_B });
    expect(res.statusCode).toBe(204);
    expect(res.headers['x-auth-tenant-id']).toBe(TENANT_B);
    expect(res.headers['x-auth-role']).toBe('super_admin');
  });

  it('/super-admin: 403 for tenant_admin and analyst, 204 for super_admin', async () => {
    expect((await verify({ authorization: `Bearer ${token('tenant_admin')}` }, '/super-admin')).statusCode).toBe(403);
    expect((await verify({ authorization: `Bearer ${token('analyst')}` }, '/super-admin')).statusCode).toBe(403);
    expect((await verify({ authorization: `Bearer ${token('super_admin')}` }, '/super-admin')).statusCode).toBe(204);
  });

  it('/super-admin still 401s without a token (not 403)', async () => {
    expect((await verify({}, '/super-admin')).statusCode).toBe(401);
  });

  it('has no other verify variants (unknown suffix is 404, never 204)', async () => {
    const res = await verify({ authorization: `Bearer ${token('super_admin')}` }, '/anything');
    expect(res.statusCode).toBe(404);
  });

  it('/super-admin is also exempt from rate limiting', async () => {
    const auth = { authorization: `Bearer ${token('super_admin')}` };
    for (let i = 0; i < 6; i++) expect((await verify(auth, '/super-admin')).statusCode).toBe(204);
  });

  it('is exempt from rate limiting (global max 3 in this app)', async () => {
    const auth = { authorization: `Bearer ${token('analyst')}` };
    for (let i = 0; i < 10; i++) {
      expect((await verify(auth)).statusCode).toBe(204);
    }
  });
});
