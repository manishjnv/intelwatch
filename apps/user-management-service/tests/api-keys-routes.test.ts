/**
 * @module user-management-service/tests/api-keys-routes
 * @description RBAC regression tests for POST/GET/DELETE /api-keys (security fix: analyst
 * could previously mint/list/revoke long-lived public API keys with no role check).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    tenant: { findUnique: vi.fn() },
    tenantFeatureOverride: { findUnique: vi.fn() },
    subscriptionPlanDefinition: { findUnique: vi.fn() },
    apiKey: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

import { buildApp } from '../src/app.js';
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
const ADMIN_HEADERS = { 'x-tenant-id': TENANT, 'x-user-role': 'tenant_admin', 'x-user-id': 'user-1' };
const ANALYST_HEADERS = { 'x-tenant-id': TENANT, 'x-user-role': 'analyst', 'x-user-id': 'user-2' };

describe('API key routes (POST/GET/DELETE /api-keys)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      config: TEST_CONFIG,
      apiKeyDeps: { auditLogger: new AuditLogger() },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /api/v1/users/api-keys ───────────────────────────────
  describe('POST /api/v1/users/api-keys', () => {
    it('403s for analyst (no settings:update) before touching the plan lookup', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/api-keys', headers: ANALYST_HEADERS,
        payload: { name: 'My key' },
      });
      expect(res.statusCode).toBe(403);
      expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('401s when x-tenant-id is missing', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/api-keys',
        headers: { 'x-user-role': 'tenant_admin' },
        payload: { name: 'My key' },
      });
      expect(res.statusCode).toBe(401);
      expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('403s when x-user-role is missing', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/api-keys',
        headers: { 'x-tenant-id': TENANT },
        payload: { name: 'My key' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('tenant_admin proceeds past the role/tenant checks to the plan lookup', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'enterprise' });
      mockPrisma.tenantFeatureOverride.findUnique.mockResolvedValue(null);
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue({
        features: [{ enabled: true }],
      });
      mockPrisma.apiKey.create.mockResolvedValue({
        id: 'key-1', name: 'My key', prefix: 'etip_abcd1234', scopes: ['ioc:read'],
        expiresAt: null, createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/api-keys', headers: ADMIN_HEADERS,
        payload: { name: 'My key' },
      });
      expect(res.statusCode).toBe(201);
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TENANT } }),
      );
    });

    it('super_admin proceeds past the role/tenant checks', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null); // tenant lookup still runs, just 404s
      const res = await app.inject({
        method: 'POST', url: '/api/v1/users/api-keys',
        headers: { 'x-tenant-id': TENANT, 'x-user-role': 'super_admin' },
        payload: { name: 'My key' },
      });
      expect(res.statusCode).toBe(404);
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalled();
    });
  });

  // ─── GET /api/v1/users/api-keys ────────────────────────────────
  describe('GET /api/v1/users/api-keys', () => {
    it('403s for analyst (no settings:read)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/api-keys', headers: ANALYST_HEADERS });
      expect(res.statusCode).toBe(403);
      expect(mockPrisma.apiKey.findMany).not.toHaveBeenCalled();
    });

    it('401s when x-tenant-id is missing', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/users/api-keys', headers: { 'x-user-role': 'tenant_admin' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('allows tenant_admin', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/api-keys', headers: ADMIN_HEADERS });
      expect(res.statusCode).toBe(200);
    });
  });

  // ─── DELETE /api/v1/users/api-keys/:id ─────────────────────────
  describe('DELETE /api/v1/users/api-keys/:id', () => {
    it('403s for analyst (no settings:update) before the lookup', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/api-keys/key-1', headers: ANALYST_HEADERS });
      expect(res.statusCode).toBe(403);
      expect(mockPrisma.apiKey.findFirst).not.toHaveBeenCalled();
    });

    it('401s when x-tenant-id is missing', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/users/api-keys/key-1', headers: { 'x-user-role': 'tenant_admin' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('allows tenant_admin', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue({ id: 'key-1', name: 'My key' });
      mockPrisma.apiKey.update.mockResolvedValue({});
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/users/api-keys/key-1', headers: ADMIN_HEADERS });
      expect(res.statusCode).toBe(204);
    });
  });
});
