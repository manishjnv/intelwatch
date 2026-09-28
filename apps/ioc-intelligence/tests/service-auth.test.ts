import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import {
  loadJwtConfig, signAccessToken, loadServiceJwtSecret, signServiceToken,
} from '@etip/shared-auth';
import { loadConfig } from '../src/config.js';
import { iocRoutes } from '../src/routes/iocs.js';
import { registerErrorHandler } from '../src/plugins/error-handler.js';

// S171: service-to-service auth for read-only IOC routes (threat-graph caller).
// Uses REAL @etip/shared-auth (not mocked) so tokens are verified end-to-end.

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const SERVICE_SECRET = 'service-secret-1234567890';

function createMockService() {
  return {
    listIocs: vi.fn().mockResolvedValue({ items: [{ id: 'ioc-1' }], total: 1 }),
    getIocDetail: vi.fn().mockResolvedValue({ id: 'ioc-1', computed: {} }),
    listTenantsWithIocs: vi.fn().mockResolvedValue([
      { tenantId: TENANT_A, iocCount: 5, lastUpdatedAt: new Date('2026-01-01T00:00:00Z') },
    ]),
    createIoc: vi.fn().mockResolvedValue({ id: 'new-1' }),
    updateIoc: vi.fn().mockResolvedValue({ id: 'ioc-1' }),
    bulkOperation: vi.fn().mockResolvedValue({ affected: 1 }),
    exportIocs: vi.fn().mockResolvedValue({ data: '[]', contentType: 'application/json', filename: 'x.json' }),
    deleteIoc: vi.fn().mockResolvedValue(undefined),
    searchIocs: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getStats: vi.fn().mockResolvedValue({ total: 0 }),
    getCampaigns: vi.fn().mockResolvedValue([]),
    getFeedAccuracy: vi.fn().mockResolvedValue([]),
    pivotIoc: vi.fn().mockResolvedValue({}),
    getTimeline: vi.fn().mockResolvedValue({ events: [] }),
    transitionLifecycle: vi.fn().mockResolvedValue({ id: 'ioc-1' }),
  };
}

function serviceToken(iss = 'threat-graph', aud = 'ioc-intelligence'): string {
  return signServiceToken(iss, aud);
}

// Hand-rolled HS256 JWT (node:crypto) — avoids adding jsonwebtoken as a
// direct devDependency just to mint one already-expired test token.
function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}
function signHs256Expired(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ iss: 'threat-graph', aud: 'ioc-intelligence', iat: now - 120, exp: now - 60 }));
  const data = `${header}.${body}`;
  const signature = createHmac('sha256', SERVICE_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function userToken(tenantId: string, role: 'analyst' | 'super_admin' = 'analyst'): string {
  return signAccessToken({
    userId: 'user-001', tenantId, email: 'test@test.com', role,
    sessionId: '33333333-3333-4333-8333-333333333333',
  });
}

describe('IOC Intelligence — service-to-service auth (S171)', () => {
  let app: FastifyInstance;
  let mockService: ReturnType<typeof createMockService>;

  beforeAll(async () => {
    loadConfig({
      TI_DATABASE_URL: 'postgresql://user:pass@localhost:5432/etip',
      TI_REDIS_URL: 'redis://:password@localhost:6379/0',
      TI_JWT_SECRET: 'a'.repeat(32),
      TI_SERVICE_JWT_SECRET: SERVICE_SECRET,
      TI_IOC_SERVICE_CALLERS: 'threat-graph',
    });
    loadJwtConfig({ TI_JWT_SECRET: 'a'.repeat(32), TI_JWT_ISSUER: 'intelwatch-etip' });
    loadServiceJwtSecret({ TI_SERVICE_JWT_SECRET: SERVICE_SECRET });

    mockService = createMockService();
    app = Fastify({ logger: false });
    registerErrorHandler(app);
    await app.register(iocRoutes(mockService as never), { prefix: '/api/v1/ioc' });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  // ── 1-2: valid service token, tenant-scoped list/detail ────────

  it('GET /api/v1/ioc — 200 for a valid service token, scoped to the header tenant', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc',
      headers: { 'x-service-token': serviceToken(), 'x-tenant-id': TENANT_B },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.listIocs).toHaveBeenCalledWith(TENANT_B, expect.anything());
  });

  it('GET /api/v1/ioc/:id — 200 for a valid service token, scoped to the header tenant', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/550e8400-e29b-41d4-a716-446655440000',
      headers: { 'x-service-token': serviceToken(), 'x-tenant-id': TENANT_B },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.getIocDetail).toHaveBeenCalledWith(TENANT_B, '550e8400-e29b-41d4-a716-446655440000');
  });

  // ── 3: rejection matrix ─────────────────────────────────────────

  it('GET /api/v1/ioc — 403 for wrong audience', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc',
      headers: { 'x-service-token': serviceToken('threat-graph', 'threat-graph'), 'x-tenant-id': TENANT_A },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('SERVICE_AUTH_FAILED');
  });

  it('GET /api/v1/ioc — 403 for an issuer not in the allowlist', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc',
      headers: { 'x-service-token': serviceToken('some-other-service'), 'x-tenant-id': TENANT_A },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('SERVICE_AUTH_FAILED');
  });

  it('GET /api/v1/ioc — 401 for an expired service token', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc',
      headers: { 'x-service-token': signHs256Expired(), 'x-tenant-id': TENANT_A },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/ioc — 401 for a garbage service token', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc',
      headers: { 'x-service-token': 'not-a-jwt', 'x-tenant-id': TENANT_A },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/ioc — 400 for a missing x-tenant-id header', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc',
      headers: { 'x-service-token': serviceToken() },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_TENANT_HEADER');
  });

  it('GET /api/v1/ioc — 400 for a non-UUID x-tenant-id header', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc',
      headers: { 'x-service-token': serviceToken(), 'x-tenant-id': 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_TENANT_HEADER');
  });

  // ── 4: service tokens can never write or export ────────────────

  it.each([
    ['POST', '/api/v1/ioc', { iocType: 'ip', value: '1.2.3.4' }],
    ['PUT', '/api/v1/ioc/550e8400-e29b-41d4-a716-446655440000', { severity: 'high' }],
    ['POST', '/api/v1/ioc/bulk', { ids: ['550e8400-e29b-41d4-a716-446655440000'], action: 'set_severity', severity: 'high' }],
    ['POST', '/api/v1/ioc/export', { format: 'json' }],
  ] as const)('%s %s — 401 for a service token (no user attached)', async (method, url, payload) => {
    const res = await app.inject({
      method, url,
      headers: { 'x-service-token': serviceToken(), 'x-tenant-id': TENANT_A },
      payload,
    });
    expect(res.statusCode).toBe(401);
  });

  // ── 5: no fallback to a valid user token ────────────────────────

  it('GET /api/v1/ioc — rejects an invalid service token even with a valid user Authorization header', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc',
      headers: {
        Authorization: `Bearer ${userToken(TENANT_A)}`,
        'x-service-token': 'not-a-jwt',
        'x-tenant-id': TENANT_A,
      },
    });
    expect(res.statusCode).toBe(401);
    expect(mockService.listIocs).not.toHaveBeenCalledWith(TENANT_A, expect.anything());
  });

  // ── 6: user-only calls behave exactly as before ─────────────────

  it('GET /api/v1/ioc — user token only, scoped to the user tenant', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc',
      headers: { Authorization: `Bearer ${userToken(TENANT_A)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.listIocs).toHaveBeenCalledWith(TENANT_A, expect.anything());
  });

  // ── 7: GET /internal/tenants ─────────────────────────────────────

  it('GET /api/v1/ioc/internal/tenants — 200 with cross-tenant data for a service token', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/internal/tenants',
      headers: { 'x-service-token': serviceToken() },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([{ tenantId: TENANT_A, iocCount: 5, lastUpdatedAt: '2026-01-01T00:00:00.000Z' }]);
  });

  it('GET /api/v1/ioc/internal/tenants — 401 for a user token, even super_admin', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/internal/tenants',
      headers: { Authorization: `Bearer ${userToken(TENANT_A, 'super_admin')}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/ioc/internal/tenants — 401 with no auth at all', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/ioc/internal/tenants' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/v1/ioc/internal/tenants — 403 for wrong audience', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/internal/tenants',
      headers: { 'x-service-token': serviceToken('threat-graph', 'threat-graph') },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /api/v1/ioc/internal/tenants — never falls through to the :id detail handler', async () => {
    mockService.getIocDetail.mockClear();
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc/internal/tenants',
      headers: { 'x-service-token': serviceToken() },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.getIocDetail).not.toHaveBeenCalled();
  });

  // ── 8: updatedSince + sort=updatedAt reach the repository ───────

  it('GET /api/v1/ioc?updatedSince=...&sort=updatedAt&order=asc — passes through to the service', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ioc?updatedSince=2026-01-01T00:00:00.000Z&sort=updatedAt&order=asc',
      headers: { Authorization: `Bearer ${userToken(TENANT_A)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(mockService.listIocs).toHaveBeenCalledWith(
      TENANT_A,
      expect.objectContaining({ updatedSince: '2026-01-01T00:00:00.000Z', sort: 'updatedAt', order: 'asc' }),
    );
  });

  it('GET /api/v1/ioc?updatedSince=not-a-date — 400', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/v1/ioc?updatedSince=not-a-date',
      headers: { Authorization: `Bearer ${userToken(TENANT_A)}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
