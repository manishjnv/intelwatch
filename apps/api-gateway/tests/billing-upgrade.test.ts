/**
 * @module api-gateway/tests/billing-upgrade
 * @description Tests for billing upgrade/downgrade + GET /plans.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ─── Hoisted mocks ─────────────────────────────────────────────────
const { mockPrisma, authState, mockRedis, mockPlanCache, mockUsageCounter, mockPlanRepo } = vi.hoisted(() => {
  const mockPrisma = {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tenantSubscription: {
      upsert: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const authState = {
    user: { sub: 'u-1', userId: 'u-1', email: 'admin@acme.com', role: 'tenant_admin', tenantId: 't-1' } as Record<string, unknown>,
  };
  const mockRedis = {
    lpush: vi.fn().mockResolvedValue(1),
  };
  const mockPlanCache = {
    getPlanLimits: vi.fn().mockResolvedValue(new Map()),
    invalidatePlanCache: vi.fn().mockResolvedValue(undefined),
    getRedis: vi.fn(() => mockRedis),
  };
  const mockUsageCounter = {
    getUsage: vi.fn().mockResolvedValue({ daily: 0, weekly: 0, monthly: 0, total: 0 }),
  };
  const mockPlanRepo = {
    findAllPlans: vi.fn(),
    findPlanByPlanId: vi.fn(),
  };
  return { mockPrisma, authState, mockRedis, mockPlanCache, mockUsageCounter, mockPlanRepo };
});

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

vi.mock('../src/plugins/auth.js', () => ({
  authenticate: async (req: Record<string, unknown>) => { req.user = authState.user; },
  getUser: (req: Record<string, unknown>) => req.user,
}));

vi.mock('../src/plugins/rbac.js', () => ({
  rbac: () => async () => {},
  rbacAny: () => async () => {},
}));

vi.mock('../src/quota/plan-cache.js', () => mockPlanCache);
vi.mock('../src/quota/usage-counter.js', () => mockUsageCounter);
vi.mock('../src/routes/plan-repository.js', () => mockPlanRepo);

// Must import AFTER mocks
import { billingUpgradeRoutes } from '../src/routes/billing-upgrade.js';

// ─── Test app builder ──────────────────────────────────────────────
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(billingUpgradeRoutes, { prefix: '/api/v1/billing' });
  await app.ready();
  return app;
}

// ─── Sample data ───────────────────────────────────────────────────
const freePlanDef = {
  id: 'uuid-free', planId: 'free', name: 'Free', description: 'Free plan',
  priceMonthlyInr: 0, priceAnnualInr: 0, isPublic: true, isDefault: true, sortOrder: 0,
  createdBy: 'system', createdAt: new Date(), updatedAt: new Date(),
  features: [
    { featureKey: 'ioc_management', enabled: true, limitDaily: 10, limitWeekly: -1, limitMonthly: 100, limitTotal: -1 },
    { featureKey: 'users', enabled: true, limitDaily: -1, limitWeekly: -1, limitMonthly: -1, limitTotal: 5 },
  ],
};

const starterPlanDef = {
  ...freePlanDef, id: 'uuid-starter', planId: 'starter', name: 'Starter', sortOrder: 1,
  priceMonthlyInr: 2000, priceAnnualInr: 20000,
  features: [
    { featureKey: 'ioc_management', enabled: true, limitDaily: 100, limitWeekly: -1, limitMonthly: 1000, limitTotal: -1 },
    { featureKey: 'users', enabled: true, limitDaily: -1, limitWeekly: -1, limitMonthly: -1, limitTotal: 20 },
  ],
};

const proPlanDef = {
  ...freePlanDef, id: 'uuid-pro', planId: 'pro', name: 'Pro', sortOrder: 2, isDefault: false,
  priceMonthlyInr: 5000, priceAnnualInr: 50000,
  features: [
    { featureKey: 'ioc_management', enabled: true, limitDaily: 500, limitWeekly: -1, limitMonthly: 5000, limitTotal: -1 },
    { featureKey: 'users', enabled: true, limitDaily: -1, limitWeekly: -1, limitMonthly: -1, limitTotal: 50 },
  ],
};

describe('Billing Upgrade API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    authState.user = { sub: 'u-1', userId: 'u-1', email: 'admin@acme.com', role: 'tenant_admin', tenantId: 't-1' };
    app = await buildTestApp();
  });

  describe('POST /api/v1/billing/upgrade', () => {
    it('200 — upgrades from free to starter', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1', plan: 'free', name: 'Acme' });
      mockPlanRepo.findPlanByPlanId.mockResolvedValue(starterPlanDef);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        payload: { targetPlan: 'starter' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.previousPlan).toBe('free');
      expect(body.data.currentPlan).toBe('starter');
      expect(body.data.isUpgrade).toBe(true);
      expect(mockPlanCache.invalidatePlanCache).toHaveBeenCalledWith('t-1');
      expect(mockRedis.lpush).toHaveBeenCalled();
    });

    it('400 — rejects same plan upgrade', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1', plan: 'starter', name: 'Acme' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        payload: { targetPlan: 'starter' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('ALREADY_ON_PLAN');
    });

    it('404 — rejects non-existent target plan', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1', plan: 'free', name: 'Acme' });
      mockPlanRepo.findPlanByPlanId.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        payload: { targetPlan: 'starter' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('422 — blocks downgrade when usage exceeds target limits (users)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1', plan: 'pro', name: 'Acme' });
      mockPlanRepo.findPlanByPlanId.mockResolvedValue(freePlanDef);
      mockPrisma.user.count.mockResolvedValue(12); // 12 users, free plan limit is 5

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        payload: { targetPlan: 'free' },
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error.code).toBe('DOWNGRADE_EXCEEDS_LIMITS');
      expect(body.error.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ feature: 'users', current: 12, targetLimit: 5 }),
        ]),
      );
    });

    it('422 — blocks downgrade when monthly usage exceeds target', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1', plan: 'starter', name: 'Acme' });
      mockPlanRepo.findPlanByPlanId.mockResolvedValue(freePlanDef);
      mockUsageCounter.getUsage.mockResolvedValue({ daily: 50, weekly: 200, monthly: 500, total: 5000 });
      mockPrisma.user.count.mockResolvedValue(3); // under user limit

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        payload: { targetPlan: 'free' },
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error.code).toBe('DOWNGRADE_EXCEEDS_LIMITS');
      expect(body.error.violations.some((v: Record<string, unknown>) => v.feature === 'ioc_management')).toBe(true);
    });

    it('200 — allows downgrade when usage is within limits', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1', plan: 'starter', name: 'Acme' });
      mockPlanRepo.findPlanByPlanId.mockResolvedValue(freePlanDef);
      mockUsageCounter.getUsage.mockResolvedValue({ daily: 1, weekly: 5, monthly: 10, total: 50 });
      mockPrisma.user.count.mockResolvedValue(3); // under 5 limit
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        payload: { targetPlan: 'free' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.isUpgrade).toBe(false);
    });

    it('invalidates plan cache after switch', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1', plan: 'free', name: 'Acme' });
      mockPlanRepo.findPlanByPlanId.mockResolvedValue(starterPlanDef);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        payload: { targetPlan: 'starter' },
      });

      expect(mockPlanCache.invalidatePlanCache).toHaveBeenCalledWith('t-1');
    });

    it('queues BILLING_PLAN_CHANGED event', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't-1', plan: 'free', name: 'Acme' });
      mockPlanRepo.findPlanByPlanId.mockResolvedValue(starterPlanDef);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        payload: { targetPlan: 'starter' },
      });

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'etip-billing-plan-changed',
        expect.stringContaining('"newPlan":"starter"'),
      );
    });

    it('400 — rejects invalid plan value', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/billing/upgrade',
        payload: { targetPlan: 'ultra_premium' },
      });

      // Zod validation failure
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /api/v1/billing/plans', () => {
    it('returns public plans with isCurrent flag', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'starter' });
      mockPlanRepo.findAllPlans.mockResolvedValue([freePlanDef, starterPlanDef, proPlanDef]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/billing/plans',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toHaveLength(3);

      const currentPlan = body.data.find((p: Record<string, unknown>) => p.isCurrent);
      expect(currentPlan.planId).toBe('starter');

      const freePlan = body.data.find((p: Record<string, unknown>) => p.planId === 'free');
      expect(freePlan.isCurrent).toBe(false);
    });

    it('excludes non-public plans', async () => {
      const privatePlan = { ...proPlanDef, isPublic: false };
      mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'free' });
      mockPlanRepo.findAllPlans.mockResolvedValue([freePlanDef, privatePlan]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/billing/plans',
      });

      expect(res.json().data).toHaveLength(1);
      expect(res.json().data[0].planId).toBe('free');
    });

    it('includes feature limits in plan response', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ plan: 'free' });
      mockPlanRepo.findAllPlans.mockResolvedValue([freePlanDef]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/billing/plans',
      });

      const plan = res.json().data[0];
      expect(plan.features).toBeDefined();
      expect(plan.features.length).toBeGreaterThan(0);
      expect(plan.features[0].featureKey).toBe('ioc_management');
      expect(plan.features[0].enabled).toBe(true);
    });
  });
});
