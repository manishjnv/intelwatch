/**
 * @module user-management-service/tests/directory-routes
 * @description Tests for GET /users, /users/stats, /users/audit (S162 honest UI).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    session: {
      count: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

import { buildApp } from '../src/app.js';
import { PermissionStore } from '../src/services/permission-store.js';
import { TeamStore } from '../src/services/team-store.js';
import { AuditLogger } from '../src/services/audit-logger.js';
import type { FastifyInstance } from 'fastify';

const TEST_CONFIG = {
  TI_NODE_ENV: 'test' as const,
  TI_USER_MANAGEMENT_PORT: 0,
  TI_USER_MANAGEMENT_HOST: '127.0.0.1',
  TI_REDIS_URL: 'redis://localhost:6379',
  TI_JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-chars',
  TI_SERVICE_JWT_SECRET: 'test-service-secret-16',
  TI_CORS_ORIGINS: 'http://localhost:3002',
  TI_RATE_LIMIT_MAX: 200,
  TI_RATE_LIMIT_WINDOW_MS: 60000,
  TI_LOG_LEVEL: 'silent' as const,
  TI_MFA_ISSUER: 'ETIP Test',
  TI_MFA_BACKUP_CODE_COUNT: 10,
  TI_BREAK_GLASS_SESSION_TTL_MIN: 30,
  TI_SSO_CALLBACK_BASE_URL: 'http://localhost:3016',
};

const TENANT = 'tenant-1';
const ADMIN_HEADERS = { 'x-tenant-id': TENANT, 'x-user-role': 'tenant_admin' };

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    displayName: 'Alice Smith',
    email: 'alice@acme.com',
    role: 'analyst',
    active: true,
    lastLoginAt: new Date('2026-01-01T00:00:00.000Z'),
    mfaEnabled: true,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    action: 'user.login',
    entityType: 'user',
    entityId: 'user-1',
    changes: { field: 'value' },
    ipAddress: '10.0.0.1',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    user: { displayName: 'Alice Smith' },
    ...overrides,
  };
}

describe('Directory routes (GET /users, /users/stats, /users/audit)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const auditLogger = new AuditLogger();
    const permissionStore = new PermissionStore();
    const teamStore = new TeamStore(permissionStore);

    app = await buildApp({
      config: TEST_CONFIG,
      // Included to prove directory registration order doesn't shadow existing routes.
      permissionDeps: { permissionStore, auditLogger },
      teamDeps: { teamStore, auditLogger },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET /api/v1/users ─────────────────────────────────────────
  describe('GET /api/v1/users', () => {
    it('returns the exact UserRecord shape', async () => {
      mockPrisma.user.findMany.mockResolvedValue([makeUser()]);
      mockPrisma.user.count.mockResolvedValue(1);

      const res = await app.inject({ method: 'GET', url: '/api/v1/users', headers: ADMIN_HEADERS });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        data: [{
          id: 'user-1',
          name: 'Alice Smith',
          email: 'alice@acme.com',
          role: 'analyst',
          team: null,
          status: 'active',
          lastLogin: '2026-01-01T00:00:00.000Z',
          mfaEnabled: true,
          createdAt: '2025-01-01T00:00:00.000Z',
        }],
        total: 1,
        page: 1,
        limit: 50,
      });
    });

    it('scopes the query to the tenant from x-tenant-id', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await app.inject({ method: 'GET', url: '/api/v1/users', headers: ADMIN_HEADERS });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
      );
      expect(mockPrisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
      );
    });

    it('401s when x-tenant-id is missing', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      const res = await app.inject({ method: 'GET', url: '/api/v1/users', headers: { 'x-user-role': 'tenant_admin' } });
      expect(res.statusCode).toBe(401);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('403s for a role without user:read (analyst)', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/users',
        headers: { 'x-tenant-id': TENANT, 'x-user-role': 'analyst' },
      });
      expect(res.statusCode).toBe(403);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('403s when x-user-role is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users', headers: { 'x-tenant-id': TENANT } });
      expect(res.statusCode).toBe(403);
    });

    it('allows super_admin', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);
      const res = await app.inject({
        method: 'GET', url: '/api/v1/users',
        headers: { 'x-tenant-id': TENANT, 'x-user-role': 'super_admin' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('400s on limit exceeding max (limit=1000)', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/users?limit=1000', headers: ADMIN_HEADERS,
      });
      expect(res.statusCode).toBe(400);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('400s on an unknown role filter instead of passing it to Prisma', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users?role=owner', headers: ADMIN_HEADERS });
      expect(res.statusCode).toBe(400);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('paginates and returns total independent of page size', async () => {
      mockPrisma.user.findMany.mockResolvedValue([makeUser()]);
      mockPrisma.user.count.mockResolvedValue(37);

      const res = await app.inject({
        method: 'GET', url: '/api/v1/users?page=2&limit=10', headers: ADMIN_HEADERS,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(37);
      expect(body.page).toBe(2);
      expect(body.limit).toBe(10);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('derives status: locked for inactive users, invited for never-logged-in users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        makeUser({ id: 'u-locked', active: false }),
        makeUser({ id: 'u-invited', active: true, lastLoginAt: null }),
      ]);
      mockPrisma.user.count.mockResolvedValue(2);

      const res = await app.inject({ method: 'GET', url: '/api/v1/users', headers: ADMIN_HEADERS });
      const body = res.json();
      expect(body.data.find((u: { id: string }) => u.id === 'u-locked').status).toBe('locked');
      expect(body.data.find((u: { id: string }) => u.id === 'u-invited').status).toBe('invited');
    });
  });

  // ─── GET /api/v1/users/stats ───────────────────────────────────
  describe('GET /api/v1/users/stats', () => {
    it('returns the exact UserManagementStats shape', async () => {
      mockPrisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
      mockPrisma.session.count.mockResolvedValue(3);

      const res = await app.inject({ method: 'GET', url: '/api/v1/users/stats', headers: ADMIN_HEADERS });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: { totalUsers: 10, activeSessions: 3, teams: 0, roles: 0, mfaPercent: 40 },
      });
    });

    it('401s when x-tenant-id is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/stats', headers: { 'x-user-role': 'tenant_admin' } });
      expect(res.statusCode).toBe(401);
    });

    it('403s for analyst role', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/users/stats',
        headers: { 'x-tenant-id': TENANT, 'x-user-role': 'analyst' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── GET /api/v1/users/audit ───────────────────────────────────
  describe('GET /api/v1/users/audit', () => {
    it('returns the exact AuditLogEntry shape', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([makeAuditLog()]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const res = await app.inject({ method: 'GET', url: '/api/v1/users/audit', headers: ADMIN_HEADERS });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: [{
          id: 'audit-1',
          timestamp: '2026-01-02T00:00:00.000Z',
          userName: 'Alice Smith',
          action: 'user.login',
          resource: 'user:user-1',
          ip: '10.0.0.1',
          details: JSON.stringify({ field: 'value' }),
        }],
        total: 1,
        page: 1,
        limit: 50,
      });
    });

    it('scopes to tenant and filters by action', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await app.inject({ method: 'GET', url: '/api/v1/users/audit?action=user.login', headers: ADMIN_HEADERS });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT, action: 'user.login' } }),
      );
    });

    it('401s when x-tenant-id is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/audit', headers: { 'x-user-role': 'tenant_admin' } });
      expect(res.statusCode).toBe(401);
    });

    it('403s for analyst role (no audit:read)', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/users/audit',
        headers: { 'x-tenant-id': TENANT, 'x-user-role': 'analyst' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('400s on limit exceeding max', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/audit?limit=1000', headers: ADMIN_HEADERS });
      expect(res.statusCode).toBe(400);
    });

    it('paginates with accurate total', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([makeAuditLog()]);
      mockPrisma.auditLog.count.mockResolvedValue(120);

      const res = await app.inject({ method: 'GET', url: '/api/v1/users/audit?page=3&limit=50', headers: ADMIN_HEADERS });
      const body = res.json();
      expect(body.total).toBe(120);
      expect(body.page).toBe(3);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 50 }),
      );
    });
  });

  // ─── Registration order: existing /team, /roles handlers unaffected ──────
  describe('Registration order regression', () => {
    it('GET /api/v1/users/roles still resolves to permissionRoutes (not directory)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/roles', headers: ADMIN_HEADERS });
      expect(res.statusCode).toBe(200);
      // permissionRoutes shape is { data, total } with a roles catalog — not our stats/user shape
      expect(Array.isArray(res.json().data)).toBe(true);
    });

    it('GET /api/v1/users/team still resolves to teamRoutes (not directory)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/team', headers: ADMIN_HEADERS });
      expect(res.statusCode).toBe(200);
      // teamRoutes reads from the in-memory TeamStore, never touches prisma.user
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });
  });
});
