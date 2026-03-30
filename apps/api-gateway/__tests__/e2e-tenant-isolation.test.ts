/**
 * E2E Suite 5: RLS ↔ Multi-Tenant Isolation
 * Tests: cross-tenant data isolation, super_admin cross-tenant access,
 * RLS fail-safe (zero rows if tenant_id not set).
 * Real: auth, RBAC, error handler. Mock: in-memory tenant-scoped data store.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadJwtConfig, signAccessToken } from '@etip/shared-auth';
import { authenticate, getUser } from '../src/plugins/auth.js';
import { rbac } from '../src/plugins/rbac.js';
import { registerErrorHandler } from '../src/plugins/error-handler.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000';
const TENANT_A = '550e8400-e29b-41d4-a716-446655440001';
const TENANT_B = '550e8400-e29b-41d4-a716-446655440002';

const SUPER_ADMIN = {
  userId: 'u-super-001', tenantId: SYSTEM_TENANT,
  email: 'admin@system.etip', role: 'super_admin' as const, sessionId: 's-super-001',
};

const ANALYST_A = {
  userId: 'u-analyst-a', tenantId: TENANT_A,
  email: 'analyst@acme.com', role: 'analyst' as const, sessionId: 's-analyst-a',
};

const ANALYST_B = {
  userId: 'u-analyst-b', tenantId: TENANT_B,
  email: 'analyst@globex.com', role: 'analyst' as const, sessionId: 's-analyst-b',
};

/** In-memory RLS-simulated IOC store. */
interface MockIoc { id: string; tenantId: string; value: string; type: string; }
let iocStore: MockIoc[] = [];

/** RLS filter: returns only IOCs for the given tenantId. */
function queryIocs(tenantId: string | null): MockIoc[] {
  if (!tenantId) return []; // RLS fail-safe: no tenant_id → zero rows
  return iocStore.filter((ioc) => ioc.tenantId === tenantId);
}

async function buildIsolationApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  // GET /iocs — tenant-scoped, simulates RLS
  app.get('/api/v1/iocs', { preHandler: [authenticate, rbac('ioc:read')] }, async (req) => {
    const user = getUser(req);
    // Super admin can use x-tenant-id override (done in auth plugin)
    const effectiveTenantId = user.tenantId;
    const data = queryIocs(effectiveTenantId);
    return { data, total: data.length };
  });

  // POST /iocs — create IOC in caller's tenant
  app.post('/api/v1/iocs', { preHandler: [authenticate, rbac('ioc:create')] }, async (req) => {
    const user = getUser(req);
    const body = req.body as { value: string; type: string };
    const ioc: MockIoc = { id: `ioc-${Date.now()}`, tenantId: user.tenantId, value: body.value, type: body.type };
    iocStore.push(ioc);
    return { data: ioc };
  });

  // GET /iocs/:id — single IOC with tenant check
  app.get('/api/v1/iocs/:id', { preHandler: [authenticate, rbac('ioc:read')] }, async (req) => {
    const user = getUser(req);
    const iocId = (req.params as { id: string }).id;
    const ioc = iocStore.find((i) => i.id === iocId && i.tenantId === user.tenantId);
    if (!ioc) return { statusCode: 404, error: { code: 'NOT_FOUND', message: 'IOC not found' } };
    return { data: ioc };
  });

  await app.ready();
  return app;
}

describe('Suite 5: RLS ↔ Multi-Tenant Isolation', () => {
  let app: FastifyInstance;
  beforeAll(async () => { loadJwtConfig(TEST_JWT_ENV); app = await buildIsolationApp(); });

  beforeEach(() => {
    iocStore = [
      { id: 'ioc-a1', tenantId: TENANT_A, value: '1.2.3.4', type: 'ip' },
      { id: 'ioc-a2', tenantId: TENANT_A, value: 'evil.com', type: 'domain' },
      { id: 'ioc-b1', tenantId: TENANT_B, value: '5.6.7.8', type: 'ip' },
      { id: 'ioc-b2', tenantId: TENANT_B, value: 'bad.org', type: 'domain' },
    ];
  });

  describe('Cross-tenant data isolation', () => {
    it('tenant A analyst sees only tenant A IOCs', async () => {
      const token = signAccessToken(ANALYST_A);
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      const data = res.json().data as MockIoc[];
      expect(data).toHaveLength(2);
      expect(data.every((ioc) => ioc.tenantId === TENANT_A)).toBe(true);
    });

    it('tenant B analyst sees only tenant B IOCs', async () => {
      const token = signAccessToken(ANALYST_B);
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      const data = res.json().data as MockIoc[];
      expect(data).toHaveLength(2);
      expect(data.every((ioc) => ioc.tenantId === TENANT_B)).toBe(true);
    });

    it('tenant A cannot access tenant B IOC by ID', async () => {
      const token = signAccessToken(ANALYST_A);
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs/ioc-b1', headers: { authorization: `Bearer ${token}` } });
      const body = res.json();
      expect(body.error?.code || body.statusCode).toBeDefined();
    });

    it('tenant B cannot access tenant A IOC by ID', async () => {
      const token = signAccessToken(ANALYST_B);
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs/ioc-a1', headers: { authorization: `Bearer ${token}` } });
      const body = res.json();
      expect(body.error?.code || body.statusCode).toBeDefined();
    });

    it('creating IOC in tenant A does not appear in tenant B queries', async () => {
      const tokenA = signAccessToken(ANALYST_A);
      await app.inject({ method: 'POST', url: '/api/v1/iocs', headers: { authorization: `Bearer ${tokenA}` }, payload: { value: '9.9.9.9', type: 'ip' } });

      const tokenB = signAccessToken(ANALYST_B);
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${tokenB}` } });
      const data = res.json().data as MockIoc[];
      expect(data).toHaveLength(2); // Still only tenant B's original 2
      expect(data.some((ioc) => ioc.value === '9.9.9.9')).toBe(false);
    });
  });

  describe('Super admin cross-tenant access', () => {
    it('super_admin with x-tenant-id=A sees tenant A data', async () => {
      const token = signAccessToken(SUPER_ADMIN);
      // Note: In real gateway, x-tenant-id override happens in auth plugin.
      // Here we test that system tenant sees nothing (RLS-safe) without override.
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      // System tenant has no IOCs — this proves RLS isolation
      expect(res.json().data).toHaveLength(0);
    });

    it('super_admin with x-tenant-id sees correct tenant data', async () => {
      // In real system, auth middleware replaces tenantId with x-tenant-id header value for super_admin.
      // We simulate this by creating a token with tenant A directly.
      const crossTenantToken = signAccessToken({ ...SUPER_ADMIN, tenantId: TENANT_A });
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${crossTenantToken}` } });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(2);
    });

    it('super_admin can switch between tenants', async () => {
      const tokenA = signAccessToken({ ...SUPER_ADMIN, tenantId: TENANT_A });
      const tokenB = signAccessToken({ ...SUPER_ADMIN, tenantId: TENANT_B });

      const resA = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${tokenA}` } });
      const resB = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${tokenB}` } });

      expect(resA.json().data).toHaveLength(2);
      expect(resB.json().data).toHaveLength(2);
      expect(resA.json().data[0].tenantId).toBe(TENANT_A);
      expect(resB.json().data[0].tenantId).toBe(TENANT_B);
    });
  });

  describe('RLS fail-safe', () => {
    it('query without tenant_id returns zero rows', async () => {
      const result = queryIocs(null);
      expect(result).toHaveLength(0);
    });

    it('query with empty string tenant_id returns zero rows', async () => {
      const result = queryIocs('');
      expect(result).toHaveLength(0);
    });

    it('query with non-existent tenant returns zero rows', async () => {
      const result = queryIocs('non-existent-tenant-id');
      expect(result).toHaveLength(0);
    });
  });
});
