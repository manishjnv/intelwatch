/**
 * Tests for GET /api/v1/auth/verify — nginx auth_request target (S147 security fix).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { loadJwtConfig, signAccessToken } from '@etip/shared-auth';
import type { FeatureLimits } from '@etip/shared-types';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { authVerifyRoutes } from '../src/routes/auth-verify.js';
import { getPlanLimits } from '../src/quota/plan-cache.js';

vi.mock('../src/quota/plan-cache.js', () => ({ getPlanLimits: vi.fn() }));

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
  beforeEach(() => {
    vi.mocked(getPlanLimits).mockReset();
    vi.mocked(getPlanLimits).mockResolvedValue(new Map());
  });

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

describe('GET /api/v1/auth/verify — plan feature gate (x-etip-feature)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    loadJwtConfig(TEST_JWT_ENV);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    vi.mocked(getPlanLimits).mockReset();
    vi.mocked(getPlanLimits).mockResolvedValue(new Map());
  });

  const verify = (headers: Record<string, string>, suffix = '') =>
    app.inject({ method: 'GET', url: `/api/v1/auth/verify${suffix}`, headers });

  const enabledLimits = (enabled: boolean): FeatureLimits => ({
    enabled, limitDaily: -1, limitWeekly: -1, limitMonthly: -1, limitTotal: -1,
  });

  it('missing x-etip-feature header: unchanged 204, getPlanLimits not called', async () => {
    const res = await verify({ authorization: `Bearer ${token('analyst')}` });
    expect(res.statusCode).toBe(204);
    expect(res.headers['x-auth-tenant-id']).toBe(TENANT_A);
    expect(getPlanLimits).not.toHaveBeenCalled();
  });

  it('empty x-etip-feature header: unchanged 204, getPlanLimits not called', async () => {
    const res = await verify({ authorization: `Bearer ${token('analyst')}`, 'x-etip-feature': '' });
    expect(res.statusCode).toBe(204);
    expect(getPlanLimits).not.toHaveBeenCalled();
  });

  it('super_admin: plan check skipped entirely, even when the feature would be disabled', async () => {
    vi.mocked(getPlanLimits).mockResolvedValue(new Map([['digital_risk_protection', enabledLimits(false)]]));
    const res = await verify({
      authorization: `Bearer ${token('super_admin')}`,
      'x-etip-feature': 'digital_risk_protection',
      'x-tenant-id': TENANT_B,
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['x-auth-tenant-id']).toBe(TENANT_B);
    expect(getPlanLimits).not.toHaveBeenCalled();
  });

  it('unknown feature key: 500 UNKNOWN_FEATURE_KEY, fails closed (never 204)', async () => {
    const res = await verify({ authorization: `Bearer ${token('analyst')}`, 'x-etip-feature': 'not_a_real_feature' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('UNKNOWN_FEATURE_KEY');
    expect(res.headers['x-auth-tenant-id']).toBeUndefined();
  });

  it('calls getPlanLimits with the TOKEN tenant, not a spoofed x-tenant-id (tenant_admin)', async () => {
    await verify({
      authorization: `Bearer ${token('tenant_admin')}`,
      'x-etip-feature': 'digital_risk_protection',
      'x-tenant-id': TENANT_B,
    });
    expect(getPlanLimits).toHaveBeenCalledWith(TENANT_A);
  });

  it('feature entry enabled === false: 403 FEATURE_NOT_AVAILABLE, no x-auth-tenant-id header', async () => {
    vi.mocked(getPlanLimits).mockResolvedValue(new Map([['digital_risk_protection', enabledLimits(false)]]));
    const res = await verify({ authorization: `Bearer ${token('analyst')}`, 'x-etip-feature': 'digital_risk_protection' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FEATURE_NOT_AVAILABLE');
    expect(res.headers['x-auth-tenant-id']).toBeUndefined();
  });

  it('feature entry missing from the plan map: 204 (allow, same as quota enforcement)', async () => {
    vi.mocked(getPlanLimits).mockResolvedValue(new Map());
    const res = await verify({ authorization: `Bearer ${token('analyst')}`, 'x-etip-feature': 'digital_risk_protection' });
    expect(res.statusCode).toBe(204);
    expect(res.headers['x-auth-tenant-id']).toBe(TENANT_A);
  });

  it('feature entry enabled: 204 with identity headers', async () => {
    vi.mocked(getPlanLimits).mockResolvedValue(new Map([['digital_risk_protection', enabledLimits(true)]]));
    const res = await verify({ authorization: `Bearer ${token('analyst')}`, 'x-etip-feature': 'digital_risk_protection' });
    expect(res.statusCode).toBe(204);
    expect(res.headers['x-auth-tenant-id']).toBe(TENANT_A);
  });

  it('missing/invalid token: 401 before any plan lookup, getPlanLimits not called', async () => {
    const res = await verify({ 'x-etip-feature': 'digital_risk_protection' });
    expect(res.statusCode).toBe(401);
    expect(getPlanLimits).not.toHaveBeenCalled();
  });

  it('getPlanLimits rejects (DB down): fails closed with a non-204 response', async () => {
    vi.mocked(getPlanLimits).mockRejectedValue(new Error('DB down'));
    const res = await verify({ authorization: `Bearer ${token('analyst')}`, 'x-etip-feature': 'digital_risk_protection' });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(res.headers['x-auth-tenant-id']).toBeUndefined();
  });

  it('/verify/super-admin: super_admin never calls getPlanLimits even with a feature header', async () => {
    const res = await verify({ authorization: `Bearer ${token('super_admin')}`, 'x-etip-feature': 'digital_risk_protection' }, '/super-admin');
    expect(res.statusCode).toBe(204);
    expect(getPlanLimits).not.toHaveBeenCalled();
  });
});
