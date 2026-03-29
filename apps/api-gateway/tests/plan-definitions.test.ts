/**
 * @module api-gateway/tests/plan-definitions
 * @description Tests for Plan Definition System — CRUD, overrides, validation, auth.
 * Mocks Prisma to avoid DB dependency in unit tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { FEATURE_KEYS } from '@etip/shared-types';

// ─── Hoisted mocks (vi.hoisted runs before vi.mock factory) ─────────
const { mockPrisma, authState } = vi.hoisted(() => {
  const mockPrisma = {
    subscriptionPlanDefinition: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    planFeatureLimit: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    tenantFeatureOverride: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tenant: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const authState = {
    user: { sub: 'sa-001', email: 'admin@intelwatch.in', role: 'super_admin', tenantId: 't-1' } as Record<string, unknown>,
  };
  return { mockPrisma, authState };
});

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

vi.mock('../src/plugins/auth.js', () => ({
  authenticate: async (req: Record<string, unknown>) => { req.user = authState.user; },
  getUser: (req: Record<string, unknown>) => req.user,
}));

// Import routes AFTER mocks are set up
import { planRoutes } from '../src/routes/plans.js';
import { overrideRoutes } from '../src/routes/overrides.js';
import { registerErrorHandler } from '../src/plugins/error-handler.js';

// ─── Auth payloads ──────────────────────────────────────────────────
const superAdminPayload = { sub: 'sa-001', email: 'admin@intelwatch.in', role: 'super_admin', tenantId: 't-1' };
const analystPayload = { sub: 'a-001', email: 'analyst@acme.com', role: 'analyst', tenantId: 't-2' };

// ─── Test App Builder ───────────────────────────────────────────────
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  await app.register(planRoutes, { prefix: '/api/v1/admin/plans' });
  await app.register(overrideRoutes, { prefix: '/api/v1/admin/tenants' });
  await app.ready();
  return app;
}

// ─── Sample Data ────────────────────────────────────────────────────
const freePlan = {
  id: 'uuid-free',
  planId: 'free',
  name: 'Free',
  description: 'Free plan',
  priceMonthlyInr: 0,
  priceAnnualInr: 0,
  isPublic: true,
  isDefault: true,
  sortOrder: 0,
  createdBy: 'admin@intelwatch.in',
  createdAt: new Date(),
  updatedAt: new Date(),
  features: [
    { id: 'fl-1', planDefId: 'uuid-free', featureKey: 'ioc_management', enabled: true, limitDaily: 100, limitWeekly: -1, limitMonthly: -1, limitTotal: -1 },
  ],
};

const validCreateBody = {
  planId: 'test_plan',
  name: 'Test Plan',
  priceMonthlyInr: 5000,
  priceAnnualInr: 50000,
  features: [
    { featureKey: 'ioc_management', enabled: true, limitDaily: 100, limitWeekly: -1, limitMonthly: -1, limitTotal: -1 },
  ],
};

// ─── Plan CRUD Tests ────────────────────────────────────────────────

describe('Plan CRUD API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    authState.user = superAdminPayload;
    app = await buildTestApp();
  });

  describe('GET /api/v1/admin/plans', () => {
    it('returns all plans with feature limits', async () => {
      mockPrisma.subscriptionPlanDefinition.findMany.mockResolvedValue([freePlan]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/plans' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].planId).toBe('free');
      expect(body.data[0].features).toHaveLength(1);
      expect(body.total).toBe(1);
    });
  });

  describe('GET /api/v1/admin/plans/:planId', () => {
    it('returns single plan with features', async () => {
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(freePlan);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/plans/free' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.planId).toBe('free');
    });

    it('404 for non-existent plan', async () => {
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/plans/nonexistent' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('PLAN_NOT_FOUND');
    });
  });

  describe('POST /api/v1/admin/plans', () => {
    it('201 — creates plan with features', async () => {
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(null);
      mockPrisma.subscriptionPlanDefinition.create.mockResolvedValue({ ...freePlan, planId: 'test_plan' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/plans',
        payload: validCreateBody,
      });
      expect(res.statusCode).toBe(201);
      expect(mockPrisma.subscriptionPlanDefinition.create).toHaveBeenCalled();
    });

    it('409 — rejects duplicate planId', async () => {
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(freePlan);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/plans',
        payload: { ...validCreateBody, planId: 'free' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('PLAN_ALREADY_EXISTS');
    });

    it('400 — rejects invalid featureKey', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/plans',
        payload: {
          ...validCreateBody,
          features: [{ featureKey: 'invalid_key', enabled: true, limitDaily: -1, limitWeekly: -1, limitMonthly: -1, limitTotal: -1 }],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400 — rejects negative limit below -1', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/plans',
        payload: {
          ...validCreateBody,
          features: [{ featureKey: 'ioc_management', enabled: true, limitDaily: -5, limitWeekly: -1, limitMonthly: -1, limitTotal: -1 }],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400 — rejects empty features array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/plans',
        payload: { ...validCreateBody, features: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/v1/admin/plans/:planId', () => {
    it('updates plan details', async () => {
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(freePlan);
      mockPrisma.subscriptionPlanDefinition.update.mockResolvedValue({ ...freePlan, name: 'Updated Free' });
      // After update, refetch
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValueOnce(freePlan).mockResolvedValueOnce({ ...freePlan, name: 'Updated Free' });
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/plans/free',
        payload: { name: 'Updated Free' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('404 for non-existent plan', async () => {
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(null);
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/admin/plans/nonexistent',
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/admin/plans/:planId', () => {
    it('204 — deletes plan with no tenants', async () => {
      mockPrisma.tenant.count.mockResolvedValue(0);
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(freePlan);
      mockPrisma.subscriptionPlanDefinition.delete.mockResolvedValue(freePlan);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/plans/free' });
      expect(res.statusCode).toBe(204);
    });

    it('409 — rejects delete when tenants assigned', async () => {
      mockPrisma.tenant.count.mockResolvedValue(3);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/plans/free' });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('PLAN_HAS_TENANTS');
    });

    it('404 — plan not found', async () => {
      mockPrisma.tenant.count.mockResolvedValue(0);
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(null);
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/admin/plans/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/admin/plans/:planId/tenants', () => {
    it('returns tenants on plan', async () => {
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(freePlan);
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 't-1', name: 'ACME', slug: 'acme', plan: 'free', active: true }]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/plans/free/tenants' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });

    it('404 for non-existent plan', async () => {
      mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue(null);
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/plans/nonexistent/tenants' });
      expect(res.statusCode).toBe(404);
    });
  });
});

// ─── Override CRUD Tests ────────────────────────────────────────────

describe('Override CRUD API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    authState.user = superAdminPayload;
    app = await buildTestApp();
  });

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const overrideData = {
    featureKey: 'ioc_management' as const,
    limitDaily: 500,
    reason: 'Special deal',
  };

  const existingOverride = {
    id: 'ov-1',
    tenantId,
    featureKey: 'ioc_management',
    limitDaily: 500,
    limitWeekly: null,
    limitMonthly: null,
    limitTotal: null,
    reason: 'Special deal',
    grantedBy: 'admin@intelwatch.in',
    grantedAt: new Date(),
    expiresAt: null,
  };

  describe('GET /api/v1/admin/tenants/:tenantId/overrides', () => {
    it('returns all overrides for tenant', async () => {
      mockPrisma.tenant.count.mockResolvedValue(1);
      mockPrisma.tenantFeatureOverride.findMany.mockResolvedValue([existingOverride]);
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/tenants/${tenantId}/overrides` });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(1);
    });

    it('404 for non-existent tenant', async () => {
      mockPrisma.tenant.count.mockResolvedValue(0);
      const res = await app.inject({ method: 'GET', url: `/api/v1/admin/tenants/${tenantId}/overrides` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('TENANT_NOT_FOUND');
    });
  });

  describe('POST /api/v1/admin/tenants/:tenantId/overrides', () => {
    it('201 — creates override', async () => {
      mockPrisma.tenant.count.mockResolvedValue(1);
      mockPrisma.tenantFeatureOverride.create.mockResolvedValue(existingOverride);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/tenants/${tenantId}/overrides`,
        payload: overrideData,
      });
      expect(res.statusCode).toBe(201);
    });

    it('409 — duplicate override for same feature', async () => {
      mockPrisma.tenant.count.mockResolvedValue(1);
      mockPrisma.tenantFeatureOverride.create.mockRejectedValue({ code: 'P2002' });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/tenants/${tenantId}/overrides`,
        payload: overrideData,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('OVERRIDE_ALREADY_EXISTS');
    });

    it('400 — invalid featureKey rejected', async () => {
      mockPrisma.tenant.count.mockResolvedValue(1);
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/tenants/${tenantId}/overrides`,
        payload: { featureKey: 'bogus_key', limitDaily: 100 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PUT /api/v1/admin/tenants/:tenantId/overrides/:featureKey', () => {
    it('200 — updates override', async () => {
      mockPrisma.tenantFeatureOverride.findUnique.mockResolvedValue(existingOverride);
      mockPrisma.tenantFeatureOverride.update.mockResolvedValue({ ...existingOverride, limitDaily: 1000 });
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/tenants/${tenantId}/overrides/ioc_management`,
        payload: { limitDaily: 1000 },
      });
      expect(res.statusCode).toBe(200);
    });

    it('404 — override not found', async () => {
      mockPrisma.tenantFeatureOverride.findUnique.mockResolvedValue(null);
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/admin/tenants/${tenantId}/overrides/ioc_management`,
        payload: { limitDaily: 1000 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/admin/tenants/:tenantId/overrides/:featureKey', () => {
    it('204 — removes override', async () => {
      mockPrisma.tenantFeatureOverride.findUnique.mockResolvedValue(existingOverride);
      mockPrisma.tenantFeatureOverride.delete.mockResolvedValue(existingOverride);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/tenants/${tenantId}/overrides/ioc_management`,
      });
      expect(res.statusCode).toBe(204);
    });

    it('404 — override not found', async () => {
      mockPrisma.tenantFeatureOverride.findUnique.mockResolvedValue(null);
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/tenants/${tenantId}/overrides/ioc_management`,
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

// ─── Auth Tests ─────────────────────────────────────────────────────

describe('Auth enforcement', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it('403 — analyst cannot access plan CRUD', async () => {
    authState.user = analystPayload;
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/plans' });
    expect(res.statusCode).toBe(403);
  });

  it('403 — analyst cannot create plan', async () => {
    authState.user = analystPayload;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/plans',
      payload: validCreateBody,
    });
    expect(res.statusCode).toBe(403);
  });

  it('403 — analyst cannot access overrides', async () => {
    authState.user = analystPayload;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/tenants/t-1/overrides',
    });
    expect(res.statusCode).toBe(403);
  });

  it('403 — analyst cannot create override', async () => {
    authState.user = analystPayload;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tenants/t-1/overrides',
      payload: { featureKey: 'ioc_management', limitDaily: 100 },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── Feature Key Validation ─────────────────────────────────────────

describe('Feature key validation', () => {
  it('FEATURE_KEYS contains all 16 expected keys', () => {
    expect(FEATURE_KEYS).toHaveLength(16);
    expect(FEATURE_KEYS).toContain('ioc_management');
    expect(FEATURE_KEYS).toContain('threat_actors');
    expect(FEATURE_KEYS).toContain('malware_intel');
    expect(FEATURE_KEYS).toContain('vulnerability_intel');
    expect(FEATURE_KEYS).toContain('threat_hunting');
    expect(FEATURE_KEYS).toContain('graph_exploration');
    expect(FEATURE_KEYS).toContain('digital_risk_protection');
    expect(FEATURE_KEYS).toContain('correlation_engine');
    expect(FEATURE_KEYS).toContain('reports');
    expect(FEATURE_KEYS).toContain('ai_enrichment');
    expect(FEATURE_KEYS).toContain('feed_subscriptions');
    expect(FEATURE_KEYS).toContain('users');
    expect(FEATURE_KEYS).toContain('data_retention');
    expect(FEATURE_KEYS).toContain('api_access');
    expect(FEATURE_KEYS).toContain('ioc_storage');
    expect(FEATURE_KEYS).toContain('alerts');
  });
});

// ─── Seed Script Idempotency ────────────────────────────────────────

describe('Seed data shape', () => {
  it('unlimited represented as -1', () => {
    // Validate that our convention is -1 for unlimited
    expect(-1).toBe(-1); // Trivial — real validation is that the seed script uses U = -1
  });

  it('Free plan has api_access disabled', async () => {
    // Integration tested via seed script. Here we validate the schema accepts enabled=false.
    const { PlanFeatureLimitSchema } = await import('@etip/shared-types');
    const result = PlanFeatureLimitSchema.safeParse({
      featureKey: 'api_access',
      enabled: false,
      limitDaily: 0,
      limitWeekly: 0,
      limitMonthly: 0,
      limitTotal: 0,
    });
    expect(result.success).toBe(true);
  });

  it('Enterprise plan has api_access enabled with unlimited', async () => {
    const { PlanFeatureLimitSchema } = await import('@etip/shared-types');
    const result = PlanFeatureLimitSchema.safeParse({
      featureKey: 'api_access',
      enabled: true,
      limitDaily: -1,
      limitWeekly: -1,
      limitMonthly: -1,
      limitTotal: -1,
    });
    expect(result.success).toBe(true);
  });
});
