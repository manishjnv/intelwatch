/**
 * E2E Suite 3: Protection Guards
 * Tests: tenant_admin undeletable, self-action denial, last-admin protection.
 * Real: auth, RBAC, error handler. Mock: UserService guard logic.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadJwtConfig, signAccessToken } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
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

const TENANT_ADMIN_1 = {
  userId: 'u-admin-001', tenantId: TENANT_A,
  email: 'admin@acme.com', role: 'tenant_admin' as const, sessionId: 's-admin-001',
};

const TENANT_ADMIN_2 = {
  userId: 'u-admin-002', tenantId: TENANT_A,
  email: 'admin2@acme.com', role: 'tenant_admin' as const, sessionId: 's-admin-002',
};

const ANALYST = {
  userId: 'u-analyst-001', tenantId: TENANT_A,
  email: 'analyst@acme.com', role: 'analyst' as const, sessionId: 's-analyst-001',
};

/** In-memory user store for guard simulation. */
interface MockUser { id: string; tenantId: string; role: string; active: boolean; }
let users: MockUser[] = [];
let tenants: Array<{ id: string; active: boolean }> = [];

function findUser(id: string): MockUser | undefined { return users.find((u) => u.id === id); }
function countActiveAdmins(tenantId: string): number {
  return users.filter((u) => u.tenantId === tenantId && u.role === 'tenant_admin' && u.active).length;
}

async function buildGuardApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  // DELETE /settings/users/:id — with all guards
  app.delete('/api/v1/settings/users/:id', { preHandler: [authenticate, rbac('user:delete')] }, async (req) => {
    const caller = getUser(req);
    const targetId = (req.params as { id: string }).id;
    const target = findUser(targetId);
    if (!target) throw new AppError(404, 'User not found', 'NOT_FOUND');

    // Guard I-04: self-delete denied
    if (caller.sub === targetId) throw new AppError(403, 'Cannot delete yourself', 'SELF_ACTION_DENIED');

    // Guard I-05: tenant_admin undeletable
    if (target.role === 'tenant_admin') throw new AppError(403, 'Tenant admin cannot be deleted', 'TENANT_ADMIN_UNDELETABLE');

    target.active = false;
    return { data: { deleted: true, userId: targetId } };
  });

  // PUT /settings/users/:id/disable — with guards
  app.put('/api/v1/settings/users/:id/disable', { preHandler: [authenticate, rbac('user:update')] }, async (req) => {
    const caller = getUser(req);
    const targetId = (req.params as { id: string }).id;
    const target = findUser(targetId);
    if (!target) throw new AppError(404, 'User not found', 'NOT_FOUND');

    // Guard I-04: self-disable denied
    if (caller.sub === targetId) throw new AppError(403, 'Cannot disable yourself', 'SELF_ACTION_DENIED');

    // Guard I-05: last admin protection
    if (target.role === 'tenant_admin') {
      const adminCount = countActiveAdmins(target.tenantId);
      if (adminCount <= 1) throw new AppError(403, 'Cannot disable the last tenant admin', 'LAST_ADMIN_PROTECTED');
    }

    target.active = false;
    return { data: { disabled: true, userId: targetId } };
  });

  // PUT /admin/tenants/:tenantId/disable — org disable
  app.put('/api/v1/admin/tenants/:tenantId/disable', { preHandler: [authenticate, rbac('admin:write')] }, async (req) => {
    const caller = getUser(req);
    const tenantId = (req.params as { tenantId: string }).tenantId;
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) throw new AppError(404, 'Tenant not found', 'NOT_FOUND');

    // Guard: cannot disable own org
    if (caller.tenantId === tenantId) throw new AppError(403, 'Cannot disable your own organization', 'ORG_SELF_DISABLE_DENIED');

    tenant.active = false;
    return { data: { disabled: true, tenantId } };
  });

  await app.ready();
  return app;
}

describe('Suite 3: Protection Guards E2E', () => {
  let app: FastifyInstance;
  beforeAll(async () => { loadJwtConfig(TEST_JWT_ENV); app = await buildGuardApp(); });

  beforeEach(() => {
    users = [
      { id: TENANT_ADMIN_1.userId, tenantId: TENANT_A, role: 'tenant_admin', active: true },
      { id: TENANT_ADMIN_2.userId, tenantId: TENANT_A, role: 'tenant_admin', active: true },
      { id: ANALYST.userId, tenantId: TENANT_A, role: 'analyst', active: true },
    ];
    tenants = [
      { id: TENANT_A, active: true },
      { id: SYSTEM_TENANT, active: true },
    ];
  });

  describe('Tenant admin undeletable (I-05)', () => {
    it('tenant_admin cannot delete another tenant_admin', async () => {
      const token = signAccessToken(TENANT_ADMIN_1);
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/settings/users/${TENANT_ADMIN_2.userId}`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('TENANT_ADMIN_UNDELETABLE');
    });

    it('super_admin cannot delete a tenant_admin either', async () => {
      const token = signAccessToken(SUPER_ADMIN);
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/settings/users/${TENANT_ADMIN_1.userId}`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('TENANT_ADMIN_UNDELETABLE');
    });

    it('deleting an analyst succeeds', async () => {
      const token = signAccessToken(TENANT_ADMIN_1);
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/settings/users/${ANALYST.userId}`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.deleted).toBe(true);
    });
  });

  describe('Self-action cascade (I-04)', () => {
    it('user cannot disable self', async () => {
      const token = signAccessToken(TENANT_ADMIN_1);
      const res = await app.inject({ method: 'PUT', url: `/api/v1/settings/users/${TENANT_ADMIN_1.userId}/disable`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('SELF_ACTION_DENIED');
    });

    it('user cannot delete self', async () => {
      const token = signAccessToken(TENANT_ADMIN_1);
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/settings/users/${TENANT_ADMIN_1.userId}`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('SELF_ACTION_DENIED');
    });

    it('super_admin cannot disable own org', async () => {
      const token = signAccessToken(SUPER_ADMIN);
      const res = await app.inject({ method: 'PUT', url: `/api/v1/admin/tenants/${SYSTEM_TENANT}/disable`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('ORG_SELF_DISABLE_DENIED');
    });

    it('super_admin can disable another org', async () => {
      const token = signAccessToken(SUPER_ADMIN);
      const res = await app.inject({ method: 'PUT', url: `/api/v1/admin/tenants/${TENANT_A}/disable`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.disabled).toBe(true);
    });
  });

  describe('Last admin protection (I-05)', () => {
    it('cannot disable the only active tenant_admin', async () => {
      // Disable admin-2 first (2 admins → 1 admin)
      users[1]!.active = false;
      const token = signAccessToken(TENANT_ADMIN_2); // admin-2 disabling admin-1
      // Need a still-active caller — use super_admin
      const saToken = signAccessToken(SUPER_ADMIN);
      const res = await app.inject({ method: 'PUT', url: `/api/v1/settings/users/${TENANT_ADMIN_1.userId}/disable`, headers: { authorization: `Bearer ${saToken}` } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('LAST_ADMIN_PROTECTED');
    });

    it('can disable one of two admins', async () => {
      // Both admins active, disable admin-2
      const token = signAccessToken(TENANT_ADMIN_1);
      const res = await app.inject({ method: 'PUT', url: `/api/v1/settings/users/${TENANT_ADMIN_2.userId}/disable`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.disabled).toBe(true);
    });

    it('after disabling one admin, cannot disable the remaining one', async () => {
      // First disable admin-2
      users[1]!.active = false;
      const token = signAccessToken(SUPER_ADMIN);
      const res = await app.inject({ method: 'PUT', url: `/api/v1/settings/users/${TENANT_ADMIN_1.userId}/disable`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('LAST_ADMIN_PROTECTED');
    });

    it('promoting analyst to admin then disabling one admin succeeds', async () => {
      // Promote analyst to tenant_admin
      users[2]!.role = 'tenant_admin';
      // Now 3 admins — disable one
      const token = signAccessToken(TENANT_ADMIN_1);
      const res = await app.inject({ method: 'PUT', url: `/api/v1/settings/users/${TENANT_ADMIN_2.userId}/disable`, headers: { authorization: `Bearer ${token}` } });
      expect(res.statusCode).toBe(200);
    });
  });
});
