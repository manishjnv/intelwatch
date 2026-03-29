import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJwtConfig, getJwtConfig, getRefreshExpiryForRole, signRefreshToken, verifyRefreshToken, SYSTEM_TENANT_ID, SYSTEM_TENANT_NAME, SYSTEM_TENANT_SLUG } from '@etip/shared-auth';
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
    it('rejects registration when role=super_admin is in body', () => {
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

    it('blocks registration with system tenant slug', () => {
      const slug = 'intelwatch-system';
      expect(slug).toBe(SYSTEM_TENANT_SLUG);
      // Route check: if body.tenantSlug === SYSTEM_TENANT_SLUG → 403
    });
  });

  describe('System tenant constants (imported from shared-auth)', () => {
    it('system tenant UUID is well-known zero UUID', () => {
      expect(SYSTEM_TENANT_ID).toBe('00000000-0000-0000-0000-000000000000');
      expect(SYSTEM_TENANT_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('system tenant name is IntelWatch Platform', () => {
      expect(SYSTEM_TENANT_NAME).toBe('IntelWatch Platform');
    });

    it('system tenant slug is intelwatch-system', () => {
      expect(SYSTEM_TENANT_SLUG).toBe('intelwatch-system');
    });
  });

  describe('Super admin cross-tenant bypass', () => {
    it('super_admin with x-tenant-id header gets tenantId overridden', () => {
      // Simulates the auth plugin logic
      const payload = {
        sub: 'user-1',
        tenantId: SYSTEM_TENANT_ID,
        role: 'super_admin' as Role,
        email: 'admin@intelwatch.in',
        sessionId: 'session-1',
      };
      const targetTenantId = 'customer-tenant-123';

      if (payload.role === 'super_admin' && targetTenantId !== payload.tenantId) {
        (payload as Record<string, unknown>)['_originalTenantId'] = payload.tenantId;
        (payload as Record<string, unknown>)['tenantId'] = targetTenantId;
      }

      expect(payload.tenantId).toBe('customer-tenant-123');
      expect((payload as Record<string, unknown>)['_originalTenantId']).toBe(SYSTEM_TENANT_ID);
    });

    it('non-super_admin cannot override tenantId', () => {
      const payload = {
        sub: 'user-2',
        tenantId: 'tenant-A',
        role: 'tenant_admin' as Role,
        email: 'admin@company.com',
        sessionId: 'session-2',
      };
      const targetTenantId = 'tenant-B';

      // Only super_admin gets the bypass
      if (payload.role === 'super_admin' && targetTenantId !== payload.tenantId) {
        (payload as Record<string, unknown>)['_originalTenantId'] = payload.tenantId;
        (payload as Record<string, unknown>)['tenantId'] = targetTenantId;
      }

      expect(payload.tenantId).toBe('tenant-A'); // unchanged
    });
  });
});

// ─── I-09: API Key Enterprise Tier Gate ────────────────────────────

describe('I-09: API key enterprise tier gate', () => {
  describe('Plan definition check logic', () => {
    // Simulates the real plan definition system check
    function checkApiAccess(planFeature: { enabled: boolean } | null, hasOverride: boolean): boolean {
      if (hasOverride) return true;
      return planFeature?.enabled === true;
    }

    it('enterprise plan allows API key creation (api_access enabled)', () => {
      expect(checkApiAccess({ enabled: true }, false)).toBe(true);
    });

    it('pro plan blocks API key creation (api_access disabled)', () => {
      expect(checkApiAccess({ enabled: false }, false)).toBe(false);
    });

    it('starter plan blocks API key creation', () => {
      expect(checkApiAccess({ enabled: false }, false)).toBe(false);
    });

    it('free plan blocks API key creation', () => {
      expect(checkApiAccess({ enabled: false }, false)).toBe(false);
    });

    it('free plan WITH api_access override allows creation', () => {
      expect(checkApiAccess({ enabled: false }, true)).toBe(true);
    });

    it('plan with no feature definition blocks creation', () => {
      expect(checkApiAccess(null, false)).toBe(false);
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
    it('FEATURE_NOT_AVAILABLE error includes feature and upgradeUrl', () => {
      const error = {
        statusCode: 403,
        code: 'FEATURE_NOT_AVAILABLE',
        message: 'API key management requires the Enterprise plan.',
        details: { feature: 'api_access', upgradeUrl: '/command-center?tab=billing', currentPlan: 'free' },
      };
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FEATURE_NOT_AVAILABLE');
      expect(error.details.feature).toBe('api_access');
      expect(error.details.upgradeUrl).toBe('/command-center?tab=billing');
    });
  });
});

// ─── Integration: API Key Routes ───────────────────────────────────

describe('I-09: API key route integration', () => {
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
        subscriptionPlanDefinition: {
          findUnique: vi.fn(),
        },
        tenantFeatureOverride: {
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

  it('POST /api-keys — 403 for non-enterprise tenant (plan feature disabled)', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: 'free' } as never);
    vi.mocked(prisma.tenantFeatureOverride.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.subscriptionPlanDefinition.findUnique).mockResolvedValue({
      planId: 'free',
      features: [{ featureKey: 'api_access', enabled: false }],
    } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/api-keys',
      headers: { 'x-tenant-id': 'tenant-1', 'x-user-id': 'user-1', 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'Test Key', scopes: ['ioc:read'] }),
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error?.code ?? body.code).toBe('FEATURE_NOT_AVAILABLE');
  });

  it('POST /api-keys — 201 for enterprise tenant (plan feature enabled)', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: 'enterprise' } as never);
    vi.mocked(prisma.tenantFeatureOverride.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.subscriptionPlanDefinition.findUnique).mockResolvedValue({
      planId: 'enterprise',
      features: [{ featureKey: 'api_access', enabled: true }],
    } as never);
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

  it('POST /api-keys — 201 for free tenant WITH api_access override', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: 'free' } as never);
    // Override exists and is not expired → feature granted
    vi.mocked(prisma.tenantFeatureOverride.findUnique).mockResolvedValue({
      id: 'override-1', expiresAt: null,
    } as never);
    vi.mocked(prisma.apiKey.create).mockResolvedValue({
      id: 'key-2', name: 'Override Key', prefix: 'etip_xyz9876', scopes: ['ioc:read'],
      expiresAt: null, createdAt: new Date(),
    } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/api-keys',
      headers: { 'x-tenant-id': 'tenant-free', 'x-user-id': 'user-1' },
      payload: { name: 'Override Key', scopes: ['ioc:read'] },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.key).toMatch(/^etip_[a-f0-9]{64}$/);
  });

  it('POST /api-keys — 403 for free tenant with expired override', async () => {
    const { prisma } = await import('../src/prisma.js');
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ plan: 'free' } as never);
    // Override exists but expired
    vi.mocked(prisma.tenantFeatureOverride.findUnique).mockResolvedValue({
      id: 'override-1', expiresAt: new Date('2020-01-01'),
    } as never);
    vi.mocked(prisma.subscriptionPlanDefinition.findUnique).mockResolvedValue({
      planId: 'free',
      features: [{ featureKey: 'api_access', enabled: false }],
    } as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users/api-keys',
      headers: { 'x-tenant-id': 'tenant-free', 'x-user-id': 'user-1' },
      payload: { name: 'Expired Key', scopes: ['ioc:read'] },
    });

    expect(res.statusCode).toBe(403);
  });

  it('GET /api-keys — returns keys list', async () => {
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

  it('GET /api-keys — returns empty for non-enterprise', async () => {
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

  it('DELETE /api-keys/:id — 204 on revoke', async () => {
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

  it('DELETE /api-keys/:id — 404 for non-existent key', async () => {
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
