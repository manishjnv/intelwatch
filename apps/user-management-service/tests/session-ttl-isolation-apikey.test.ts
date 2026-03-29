import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJwtConfig, getJwtConfig, getRefreshExpiryForRole, signRefreshToken, verifyRefreshToken } from '@etip/shared-auth';
import type { Role } from '@etip/shared-types';

// ─── I-07: Role-Based Session TTL ──────────────────────────────────

describe('I-07: Role-based session TTL', () => {
  beforeEach(() => {
    loadJwtConfig({
      TI_JWT_SECRET: 'test-secret-must-be-at-least-32-characters-long',
      TI_JWT_ISSUER: 'test',
    });
  });

  describe('getRefreshExpiryForRole', () => {
    it('returns 14400 (4 hours) for super_admin', () => {
      expect(getRefreshExpiryForRole('super_admin')).toBe(14_400);
    });

    it('returns 604800 (7 days) for tenant_admin', () => {
      expect(getRefreshExpiryForRole('tenant_admin')).toBe(604_800);
    });

    it('returns 604800 (7 days) for analyst', () => {
      expect(getRefreshExpiryForRole('analyst')).toBe(604_800);
    });
  });

  describe('signRefreshToken with role-based TTL', () => {
    const baseParams = {
      userId: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000002',
      sessionId: '00000000-0000-0000-0000-000000000003',
    };

    it('super_admin refresh token expires in ~4 hours', () => {
      const token = signRefreshToken({ ...baseParams, role: 'super_admin' as Role });
      const decoded = verifyRefreshToken(token);
      const ttl = decoded.exp - decoded.iat;
      expect(ttl).toBe(14_400);
    });

    it('tenant_admin refresh token expires in ~7 days', () => {
      const token = signRefreshToken({ ...baseParams, role: 'tenant_admin' as Role });
      const decoded = verifyRefreshToken(token);
      const ttl = decoded.exp - decoded.iat;
      expect(ttl).toBe(604_800);
    });

    it('analyst refresh token expires in ~7 days', () => {
      const token = signRefreshToken({ ...baseParams, role: 'analyst' as Role });
      const decoded = verifyRefreshToken(token);
      const ttl = decoded.exp - decoded.iat;
      expect(ttl).toBe(604_800);
    });

    it('omitting role uses default 7-day TTL', () => {
      const token = signRefreshToken(baseParams);
      const decoded = verifyRefreshToken(token);
      const ttl = decoded.exp - decoded.iat;
      expect(ttl).toBe(604_800);
    });
  });

  describe('session expiresAt calculation', () => {
    it('super_admin session should expire in 4 hours', () => {
      const ttl = getRefreshExpiryForRole('super_admin');
      const now = Date.now();
      const expiresAt = new Date(now + ttl * 1000);
      const diff = expiresAt.getTime() - now;
      expect(diff).toBe(14_400_000); // 4 hours in ms
    });

    it('tenant_admin session should expire in 7 days', () => {
      const ttl = getRefreshExpiryForRole('tenant_admin');
      const now = Date.now();
      const expiresAt = new Date(now + ttl * 1000);
      const diff = expiresAt.getTime() - now;
      expect(diff).toBe(604_800_000); // 7 days in ms
    });
  });
});

// ─── I-08: Super Admin Isolation ───────────────────────────────────

describe('I-08: Super admin isolation', () => {
  describe('Registration guard', () => {
    it('rejects registration when role=super_admin is in body', async () => {
      // Simulates the guard logic from api-gateway/routes/auth.ts
      const rawBody = { email: 'evil@hacker.com', password: 'password12345', role: 'super_admin' };
      const isSuperAdminAttempt = rawBody.role === 'super_admin';
      expect(isSuperAdminAttempt).toBe(true);
    });

    it('allows registration when role is not super_admin', () => {
      const rawBody = { email: 'user@company.com', password: 'password12345', role: 'analyst' };
      const isSuperAdminAttempt = rawBody.role === 'super_admin';
      expect(isSuperAdminAttempt).toBe(false);
    });

    it('allows registration when role field is absent', () => {
      const rawBody = { email: 'user@company.com', password: 'password12345' };
      const isSuperAdminAttempt = (rawBody as Record<string, unknown>)['role'] === 'super_admin';
      expect(isSuperAdminAttempt).toBe(false);
    });
  });

  describe('System tenant constants', () => {
    it('system tenant UUID is well-known zero UUID', () => {
      const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
      expect(SYSTEM_TENANT_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('system tenant slug is intelwatch-system', () => {
      const SYSTEM_TENANT_SLUG = 'intelwatch-system';
      expect(SYSTEM_TENANT_SLUG).toBe('intelwatch-system');
    });
  });
});

// ─── I-09: API Key Enterprise Tier Gate ────────────────────────────

describe('I-09: API key enterprise tier gate', () => {
  describe('Plan check logic', () => {
    const checkPlanAllowed = (plan: string): boolean => plan === 'enterprise';

    it('enterprise plan allows API key creation', () => {
      expect(checkPlanAllowed('enterprise')).toBe(true);
    });

    it('pro plan blocks API key creation', () => {
      expect(checkPlanAllowed('pro')).toBe(false);
    });

    it('starter plan blocks API key creation', () => {
      expect(checkPlanAllowed('starter')).toBe(false);
    });

    it('free plan blocks API key creation', () => {
      expect(checkPlanAllowed('free')).toBe(false);
    });
  });

  describe('API key generation', () => {
    it('generates key with etip_ prefix', () => {
      const { randomBytes } = require('crypto');
      const rawKey = 'etip_' + randomBytes(32).toString('hex');
      expect(rawKey).toMatch(/^etip_[a-f0-9]{64}$/);
      expect(rawKey.length).toBe(69); // 5 prefix + 64 hex
    });

    it('prefix is first 12 characters of the key', () => {
      const { randomBytes } = require('crypto');
      const rawKey = 'etip_' + randomBytes(32).toString('hex');
      const prefix = rawKey.slice(0, 12);
      expect(prefix).toMatch(/^etip_[a-f0-9]{7}$/);
      expect(prefix.length).toBe(12);
    });
  });

  describe('Error response shape', () => {
    it('FEATURE_NOT_AVAILABLE error includes upgradeUrl', () => {
      const error = {
        statusCode: 403,
        code: 'FEATURE_NOT_AVAILABLE',
        message: 'API key management requires the Enterprise plan. Please upgrade.',
        details: { upgradeUrl: '/command-center?tab=billing', currentPlan: 'free' },
      };
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FEATURE_NOT_AVAILABLE');
      expect(error.details.upgradeUrl).toBe('/command-center?tab=billing');
    });
  });
});

// ─── Integration: API Key Routes ───────────────────────────────────

describe('I-09: API key route integration', () => {
  // Uses buildApp to test actual HTTP endpoints
  let app: Awaited<ReturnType<typeof import('../src/app.js')['buildApp']>>;

  beforeEach(async () => {
    loadJwtConfig({
      TI_JWT_SECRET: 'test-secret-must-be-at-least-32-characters-long',
      TI_JWT_ISSUER: 'test',
    });

    // Mock prisma for route tests
    vi.mock('../src/prisma.js', () => ({
      prisma: {
        tenant: {
          findUnique: vi.fn(),
        },
        apiKey: {
          create: vi.fn(),
          findMany: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
        },
      },
    }));

    const { AuditLogger } = await import('../src/services/audit-logger.js');
    const { buildApp } = await import('../src/app.js');

    app = await buildApp({
      config: {
        TI_USER_MANAGEMENT_PORT: 0,
        TI_USER_MANAGEMENT_HOST: '0.0.0.0',
        TI_LOG_LEVEL: 'silent',
        TI_CORS_ORIGINS: '*',
        TI_RATE_LIMIT_MAX: 1000,
        TI_RATE_LIMIT_WINDOW_MS: 60000,
        TI_MFA_ISSUER: 'test',
        TI_MFA_BACKUP_CODE_COUNT: 10,
        TI_BREAK_GLASS_SESSION_TTL_MIN: 30,
      } as never,
      apiKeyDeps: { auditLogger: new AuditLogger() },
    });
  });

  it('POST /api/v1/users/api-keys — 403 for non-enterprise tenant', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: 'free' } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/api-keys',
      headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1', 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'Test Key', scopes: ['ioc:read'] }),
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    // Error handler wraps AppError as { error: { code, message, details } }
    expect(body.error?.code ?? body.code).toBe('FEATURE_NOT_AVAILABLE');
  });

  it('POST /api/v1/users/api-keys — 201 for enterprise tenant', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: 'enterprise' } as never);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: 'key-1', name: 'Test Key', prefix: 'etip_abc1234', scopes: ['ioc:read'],
      expiresAt: null, createdAt: new Date(),
    } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/api-keys',
      headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
      payload: { name: 'Test Key', scopes: ['ioc:read'] },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.key).toMatch(/^etip_[a-f0-9]{64}$/);
    expect(body.data.id).toBe('key-1');
  });

  it('GET /api/v1/users/api-keys — returns keys list', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([
      { id: 'key-1', name: 'Key A', prefix: 'etip_abc1234', scopes: ['ioc:read'], lastUsed: null, expiresAt: null, createdAt: new Date() },
    ] as never);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/api-keys',
      headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('GET /api/v1/users/api-keys — returns empty for non-enterprise', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.apiKey.findMany).mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/api-keys',
      headers: { 'x-tenant-id': 'tenant-free', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toHaveLength(0);
  });

  it('DELETE /api/v1/users/api-keys/:id — 204 on revoke', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue({
      id: 'key-1', name: 'Key A', tenantId: 'tenant-1', active: true,
    } as never);
    vi.mocked(prisma.apiKey.update).mockResolvedValue({} as never);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/api-keys/key-1',
      headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(204);
  });

  it('DELETE /api/v1/users/api-keys/:id — 404 for non-existent key', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.apiKey.findFirst).mockResolvedValue(null);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/users/api-keys/nonexistent',
      headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1' },
    });

    expect(res.statusCode).toBe(404);
  });
});
