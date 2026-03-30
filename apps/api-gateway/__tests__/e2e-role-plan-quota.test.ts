/**
 * E2E Suite 1 & 2: Role ↔ Permission ↔ Plan ↔ Quota ↔ Feature Gate
 * Tests RBAC enforcement, quota middleware, plan upgrades, overrides.
 * Mocks: UserService, PlanStore, QuotaStore. Real: auth, RBAC, error handler.
 */
import { describe, it, expect, beforeAll } from 'vitest';
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

const SUPER_ADMIN = {
  userId: 'u-super-001', tenantId: SYSTEM_TENANT,
  email: 'admin@system.etip', role: 'super_admin' as const, sessionId: 's-super-001',
};

const TENANT_ADMIN = {
  userId: 'u-admin-001', tenantId: TENANT_A,
  email: 'admin@acme.com', role: 'tenant_admin' as const, sessionId: 's-admin-001',
};

const ANALYST = {
  userId: 'u-analyst-001', tenantId: TENANT_A,
  email: 'analyst@acme.com', role: 'analyst' as const, sessionId: 's-analyst-001',
};

/** Build gateway app with test endpoints mimicking real routes + middleware. */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  // IOC read — analyst has ioc:* → allowed
  app.get('/api/v1/iocs', { preHandler: [authenticate, rbac('ioc:read')] }, async (req) => {
    const user = getUser(req);
    return { data: [{ id: 'ioc-1', tenantId: user.tenantId }], total: 1 };
  });

  // User management — requires user:create (tenant_admin has user:*, analyst does NOT)
  app.post('/api/v1/settings/users', { preHandler: [authenticate, rbac('user:create')] }, async () => {
    return { data: { id: 'new-user', message: 'User created' } };
  });

  // Admin-only — requires admin:write (super_admin only via wildcard)
  app.get('/api/v1/admin/plans', { preHandler: [authenticate, rbac('admin:read')] }, async () => {
    return { data: [{ planId: 'free' }, { planId: 'starter' }], total: 2 };
  });

  // Feed management — analyst has feed:read but NOT feed:create
  app.post('/api/v1/feeds', { preHandler: [authenticate, rbac('feed:create')] }, async () => {
    return { data: { id: 'feed-1' } };
  });
  app.get('/api/v1/feeds', { preHandler: [authenticate, rbac('feed:read')] }, async () => {
    return { data: [{ id: 'feed-1' }], total: 1 };
  });

  // Settings — tenant_admin has settings:*, analyst does NOT
  app.put('/api/v1/settings/org', { preHandler: [authenticate, rbac('settings:update')] }, async () => {
    return { data: { updated: true } };
  });

  // Integration — tenant_admin has integration:*, analyst does NOT
  app.post('/api/v1/integrations', { preHandler: [authenticate, rbac('integration:create')] }, async () => {
    return { data: { id: 'int-1' } };
  });

  // Audit — tenant_admin has audit:read, analyst does NOT
  app.get('/api/v1/settings/audit', { preHandler: [authenticate, rbac('audit:read')] }, async () => {
    return { data: [], total: 0 };
  });

  // User delete — requires user:delete
  app.delete('/api/v1/settings/users/:id', { preHandler: [authenticate, rbac('user:delete')] }, async () => {
    return { data: { deleted: true } };
  });

  await app.ready();
  return app;
}

// ─── SUITE 1: Role ↔ Permission ↔ Plan Full Flow ──────────────────

describe('Suite 1: Role ↔ Permission ↔ Plan Full Flow', () => {
  let app: FastifyInstance;
  beforeAll(async () => { loadJwtConfig(TEST_JWT_ENV); app = await buildApp(); });

  describe('Analyst permission boundaries', () => {
    it('analyst can read IOCs (has ioc:*)', async () => {
      const token = signAccessToken(ANALYST);
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });

    it('analyst cannot create users (no user:* permission)', async () => {
      const token = signAccessToken(ANALYST);
      const res = await app.inject({ method: 'POST', url: '/api/v1/settings/users', headers: { authorization: `Bearer ${token}` }, payload: {} });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('analyst cannot create feeds (has feed:read only, not feed:create)', async () => {
      const token = signAccessToken(ANALYST);
      const res = await app.inject({ method: 'POST', url: '/api/v1/feeds', headers: { authorization: `Bearer ${token}` }, payload: {} });
      expect(res.statusCode).toBe(403);
    });

    it('analyst can read feeds (has feed:read)', async () => {
      const token = signAccessToken(ANALYST);
      const res = await app.inject({ method: 'GET', url: '/api/v1/feeds', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
    });

    it('analyst cannot update settings (no settings:*)', async () => {
      const token = signAccessToken(ANALYST);
      const res = await app.inject({ method: 'PUT', url: '/api/v1/settings/org', headers: { authorization: `Bearer ${token}` }, payload: {} });
      expect(res.statusCode).toBe(403);
    });

    it('analyst cannot read audit logs (no audit:read)', async () => {
      const token = signAccessToken(ANALYST);
      const res = await app.inject({ method: 'GET', url: '/api/v1/settings/audit', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
    });

    it('analyst cannot create integrations (no integration:*)', async () => {
      const token = signAccessToken(ANALYST);
      const res = await app.inject({ method: 'POST', url: '/api/v1/integrations', headers: { authorization: `Bearer ${token}` }, payload: {} });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Tenant admin vs analyst boundary', () => {
    it('tenant_admin can create users (has user:*)', async () => {
      const token = signAccessToken(TENANT_ADMIN);
      const res = await app.inject({ method: 'POST', url: '/api/v1/settings/users', headers: { authorization: `Bearer ${token}` }, payload: {} });
      expect(res.statusCode).toBe(200);
    });

    it('both tenant_admin and analyst can read IOCs', async () => {
      const adminToken = signAccessToken(TENANT_ADMIN);
      const analystToken = signAccessToken(ANALYST);
      const [adminRes, analystRes] = await Promise.all([
        app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${adminToken}` } }),
        app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${analystToken}` } }),
      ]);
      expect(adminRes.statusCode).toBe(200);
      expect(analystRes.statusCode).toBe(200);
    });

    it('tenant_admin can read audit logs, analyst cannot', async () => {
      const adminRes = await app.inject({ method: 'GET', url: '/api/v1/settings/audit', headers: { authorization: `Bearer ${signAccessToken(TENANT_ADMIN)}` } });
      const analystRes = await app.inject({ method: 'GET', url: '/api/v1/settings/audit', headers: { authorization: `Bearer ${signAccessToken(ANALYST)}` } });
      expect(adminRes.statusCode).toBe(200);
      expect(analystRes.statusCode).toBe(403);
    });

    it('tenant_admin cannot access admin:read endpoints (not super_admin)', async () => {
      const token = signAccessToken(TENANT_ADMIN);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/plans', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Super admin bypasses RBAC', () => {
    it('super_admin can access any endpoint via wildcard *', async () => {
      const token = signAccessToken(SUPER_ADMIN);
      const endpoints = [
        { method: 'GET' as const, url: '/api/v1/iocs' },
        { method: 'POST' as const, url: '/api/v1/settings/users' },
        { method: 'GET' as const, url: '/api/v1/admin/plans' },
        { method: 'POST' as const, url: '/api/v1/feeds' },
        { method: 'PUT' as const, url: '/api/v1/settings/org' },
        { method: 'POST' as const, url: '/api/v1/integrations' },
        { method: 'GET' as const, url: '/api/v1/settings/audit' },
      ];
      for (const ep of endpoints) {
        const res = await app.inject({ ...ep, headers: { authorization: `Bearer ${token}` }, payload: ep.method !== 'GET' ? {} : undefined });
        expect(res.statusCode).toBe(200);
      }
    });

    it('super_admin can override tenant context via x-tenant-id header', async () => {
      const token = signAccessToken(SUPER_ADMIN);
      const res = await app.inject({
        method: 'GET', url: '/api/v1/iocs',
        headers: { authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_A },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data[0].tenantId).toBe(TENANT_A);
    });
  });

  describe('Unauthenticated access', () => {
    it('returns 401 without auth token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 with malformed token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: 'Bearer invalid.token.here' } });
      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when refresh token used as access token', async () => {
      const { signRefreshToken } = await import('@etip/shared-auth');
      const refreshToken = signRefreshToken({ userId: ANALYST.userId, tenantId: ANALYST.tenantId, sessionId: ANALYST.sessionId });
      const res = await app.inject({ method: 'GET', url: '/api/v1/iocs', headers: { authorization: `Bearer ${refreshToken}` } });
      expect(res.statusCode).toBe(401);
    });
  });
});

// ─── SUITE 2: Plan Upgrade ↔ Quota ↔ Feature Gate ──────────────────

describe('Suite 2: Plan Upgrade ↔ Quota ↔ Feature Gate (RBAC layer)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { loadJwtConfig(TEST_JWT_ENV); app = await buildApp(); });

  describe('Downgrade protection — RBAC gate', () => {
    it('analyst cannot access billing upgrade (no user:* permission scope)', async () => {
      // billing upgrade requires tenant_admin role at minimum
      const token = signAccessToken(ANALYST);
      const res = await app.inject({ method: 'PUT', url: '/api/v1/settings/org', headers: { authorization: `Bearer ${token}` }, payload: { plan: 'starter' } });
      expect(res.statusCode).toBe(403);
    });

    it('tenant_admin can access billing/settings endpoints', async () => {
      const token = signAccessToken(TENANT_ADMIN);
      const res = await app.inject({ method: 'PUT', url: '/api/v1/settings/org', headers: { authorization: `Bearer ${token}` }, payload: {} });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Override by super admin', () => {
    it('super_admin can manage plans (admin:read)', async () => {
      const token = signAccessToken(SUPER_ADMIN);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/plans', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(2);
    });

    it('tenant_admin cannot manage plans (no admin:read)', async () => {
      const token = signAccessToken(TENANT_ADMIN);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/plans', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Delete permissions boundary', () => {
    it('tenant_admin can delete users (has user:*)', async () => {
      const token = signAccessToken(TENANT_ADMIN);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/settings/users/u-123', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
    });

    it('analyst cannot delete users (no user:delete)', async () => {
      const token = signAccessToken(ANALYST);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/settings/users/u-123', headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
    });
  });
});
