/**
 * @module api-gateway/tests/quota-enforcement
 * @description Tests for quota enforcement middleware — feature gates, usage counters,
 * headers, super admin bypass, counter rollback, threshold events, route mapping.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────
const { authState, mockRedis, mockPrisma } = vi.hoisted(() => {
  const authState = {
    user: null as Record<string, unknown> | null,
  };

  // Mock Redis instance
  const storedKeys = new Map<string, string>();
  const mockRedis = {
    get: vi.fn(async (key: string) => storedKeys.get(key) ?? null),
    set: vi.fn(async (key: string, val: string) => { storedKeys.set(key, val); }),
    del: vi.fn(async (key: string) => { storedKeys.delete(key); }),
    mget: vi.fn(async (...keys: string[]) => keys.map((k: string) => storedKeys.get(k) ?? null)),
    incr: vi.fn(async (key: string) => {
      const curr = parseInt(storedKeys.get(key) ?? '0', 10);
      storedKeys.set(key, String(curr + 1));
      return curr + 1;
    }),
    decr: vi.fn(async (key: string) => {
      const curr = parseInt(storedKeys.get(key) ?? '0', 10);
      storedKeys.set(key, String(curr - 1));
      return curr - 1;
    }),
    eval: vi.fn(),
    evalsha: vi.fn(),
    script: vi.fn(),
    pipeline: vi.fn(() => ({
      del: vi.fn().mockReturnThis(),
      decr: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
    lpush: vi.fn(async () => 1),
    connect: vi.fn(async () => {}),
    quit: vi.fn(async () => {}),
    _storedKeys: storedKeys,
  };

  const mockPrisma = {
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    subscriptionPlanDefinition: {
      findUnique: vi.fn(),
    },
    tenantFeatureOverride: {
      findMany: vi.fn(),
    },
  };

  return { authState, mockRedis, mockPrisma };
});

// ─── Module mocks ──────────────────────────────────────────────────────
vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

vi.mock('../src/plugins/auth.js', () => ({
  authenticate: async (req: Record<string, unknown>) => {
    if (authState.user) req.user = authState.user;
  },
  getUser: (req: Record<string, unknown>) => req.user,
}));

vi.mock('../src/plugins/rbac.js', () => ({
  rbac: () => async () => {},
  rbacAny: () => async () => {},
}));

// Mock ioredis — constructor returns our mock Redis
vi.mock('ioredis', () => {
  function MockRedis() { return mockRedis; }
  MockRedis.prototype = {};
  return { default: MockRedis };
});

// ─── Imports (after mocks) ─────────────────────────────────────────────
import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { registerQuotaEnforcement } from '../src/plugins/quota-enforcement.js';
import { resolveFeatureKey } from '../src/config/feature-routes.js';
import { FEATURE_KEYS } from '@etip/shared-types';

// ─── Test Data ─────────────────────────────────────────────────────────
const tenantId = 'tenant-test-001';
const superAdminUser = { sub: 'sa-001', email: 'admin@intelwatch.in', role: 'super_admin', tenantId };
const analystUser = { sub: 'a-001', email: 'analyst@acme.com', role: 'analyst', tenantId };

const freePlanFeatures = [
  { featureKey: 'ioc_management', enabled: true, limitDaily: 100, limitWeekly: -1, limitMonthly: 1000, limitTotal: -1 },
  { featureKey: 'threat_actors', enabled: true, limitDaily: 50, limitWeekly: -1, limitMonthly: -1, limitTotal: -1 },
  { featureKey: 'digital_risk_protection', enabled: false, limitDaily: 0, limitWeekly: 0, limitMonthly: 0, limitTotal: 0 },
  { featureKey: 'ai_enrichment', enabled: true, limitDaily: -1, limitWeekly: -1, limitMonthly: -1, limitTotal: -1 },
];

function setupPrismaForTenant(planId = 'free', features = freePlanFeatures): void {
  mockPrisma.tenant.findUnique.mockResolvedValue({ id: tenantId, plan: planId });
  mockPrisma.subscriptionPlanDefinition.findUnique.mockResolvedValue({
    planId,
    features,
  });
  mockPrisma.tenantFeatureOverride.findMany.mockResolvedValue([]);
}

// ─── Lua Script Mock ───────────────────────────────────────────────────
function setupLuaMock(allowed: boolean, counters = { daily: 1, weekly: 1, monthly: 1, total: 1 }, exceeded?: { period: string; limit: number; used: number }): void {
  const result = allowed
    ? JSON.stringify({ allowed: true, counters })
    : JSON.stringify({ allowed: false, exceededPeriod: exceeded?.period ?? 'daily', limit: exceeded?.limit ?? 100, used: exceeded?.used ?? 100 });
  mockRedis.script.mockResolvedValue('fake-sha');
  mockRedis.evalsha.mockResolvedValue(result);
  mockRedis.eval.mockResolvedValue(result);
}

// ─── Test App Builder ──────────────────────────────────────────────────
async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  // Simulate auth middleware — set user on every request (quota reads req.user)
  app.addHook('onRequest', async (req) => {
    if (authState.user) {
      (req as Record<string, unknown>).user = authState.user;
    }
  });

  await registerQuotaEnforcement(app, 'redis://localhost:6379');

  // Simple test route for IOC endpoint
  app.get('/api/v1/iocs', async (_req, reply) => reply.send({ data: [] }));
  app.post('/api/v1/iocs', async (_req, reply) => reply.send({ data: { id: '1' } }));
  app.get('/api/v1/drp/alerts', async (_req, reply) => reply.send({ data: [] }));
  app.get('/api/v1/enrichment/check', async (_req, reply) => reply.send({ data: {} }));
  app.get('/health', async (_req, reply) => reply.send({ status: 'ok' }));
  app.get('/api/v1/auth/me', async (_req, reply) => reply.send({ data: {} }));
  // Route that returns 500 (for rollback test)
  app.get('/api/v1/iocs/fail', async () => { throw new Error('test error'); });

  await app.ready();
  return app;
}

// ─── Tests ─────────────────────────────────────────────────────────────
describe('Quota Enforcement', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedis._storedKeys.clear();
    setupPrismaForTenant();
    setupLuaMock(true);
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── 1. Route Mapping ──────────────────────────────────────────────
  describe('Route-to-Feature Mapping', () => {
    it('resolves all 14 route patterns correctly', () => {
      expect(resolveFeatureKey('GET', '/api/v1/iocs')).toBe('ioc_management');
      expect(resolveFeatureKey('POST', '/api/v1/iocs')).toBe('ioc_management');
      expect(resolveFeatureKey('GET', '/api/v1/threat-actors')).toBe('threat_actors');
      expect(resolveFeatureKey('GET', '/api/v1/malware')).toBe('malware_intel');
      expect(resolveFeatureKey('GET', '/api/v1/vulnerabilities')).toBe('vulnerability_intel');
      expect(resolveFeatureKey('GET', '/api/v1/hunting/sessions')).toBe('threat_hunting');
      expect(resolveFeatureKey('GET', '/api/v1/graph/nodes')).toBe('graph_exploration');
      expect(resolveFeatureKey('GET', '/api/v1/drp/alerts')).toBe('digital_risk_protection');
      expect(resolveFeatureKey('GET', '/api/v1/correlation/rules')).toBe('correlation_engine');
      expect(resolveFeatureKey('GET', '/api/v1/reports/daily')).toBe('reports');
      expect(resolveFeatureKey('GET', '/api/v1/enrichment/check')).toBe('ai_enrichment');
      expect(resolveFeatureKey('GET', '/api/v1/feeds/list')).toBe('feed_subscriptions');
      expect(resolveFeatureKey('GET', '/api/v1/users/me')).toBe('users');
      expect(resolveFeatureKey('GET', '/api/v1/alerts/active')).toBe('alerts');
      expect(resolveFeatureKey('GET', '/api/v1/integrations/siem')).toBe('api_access');
      expect(resolveFeatureKey('GET', '/api/v1/search?q=test')).toBe('ioc_management');
    });

    it('returns null for exempt routes (health, auth, admin/plans, billing)', () => {
      expect(resolveFeatureKey('GET', '/health')).toBeNull();
      expect(resolveFeatureKey('GET', '/ready')).toBeNull();
      expect(resolveFeatureKey('GET', '/metrics')).toBeNull();
      expect(resolveFeatureKey('POST', '/api/v1/auth/login')).toBeNull();
      expect(resolveFeatureKey('GET', '/api/v1/admin/plans')).toBeNull();
      expect(resolveFeatureKey('GET', '/api/v1/admin/tenants/t-1/overrides')).toBeNull();
      expect(resolveFeatureKey('GET', '/api/v1/billing/limits')).toBeNull();
      expect(resolveFeatureKey('GET', '/api/v1/billing/usage')).toBeNull();
      expect(resolveFeatureKey('GET', '/api/v1/gateway/error-stats')).toBeNull();
    });

    it('returns null for unknown routes', () => {
      expect(resolveFeatureKey('GET', '/api/v1/unknown/endpoint')).toBeNull();
      expect(resolveFeatureKey('GET', '/some/other/path')).toBeNull();
    });
  });

  // ── 2. Feature Gate ───────────────────────────────────────────────
  describe('Feature Gate (disabled feature → 403)', () => {
    it('returns 403 FEATURE_NOT_AVAILABLE for disabled feature', async () => {
      authState.user = analystUser;

      const resp = await app.inject({ method: 'GET', url: '/api/v1/drp/alerts' });
      expect(resp.statusCode).toBe(403);
      const body = resp.json();
      expect(body.error.code).toBe('FEATURE_NOT_AVAILABLE');
      expect(body.error.feature).toBe('digital_risk_protection');
      expect(body.error.upgradeUrl).toBe('/command-center?tab=billing');
    });
  });

  // ── 3. Quota Enforcement ──────────────────────────────────────────
  describe('Quota Enforcement (limit exceeded → 429)', () => {
    it('returns 429 QUOTA_EXCEEDED when daily limit reached', async () => {
      authState.user = analystUser;
      setupLuaMock(false, undefined, { period: 'daily', limit: 100, used: 100 });

      const resp = await app.inject({ method: 'GET', url: '/api/v1/iocs' });
      expect(resp.statusCode).toBe(429);
      const body = resp.json();
      expect(body.error.code).toBe('QUOTA_EXCEEDED');
      expect(body.error.period).toBe('daily');
      expect(body.error.limit).toBe(100);
      expect(body.error.used).toBe(100);
      expect(body.error.resetsAt).toBeDefined();
      expect(body.error.upgradeUrl).toBe('/command-center?tab=billing');
    });
  });

  // ── 4. Unlimited Plan ─────────────────────────────────────────────
  describe('Unlimited Plan (-1 limits)', () => {
    it('allows requests when all limits are -1 (enterprise/unlimited)', async () => {
      authState.user = analystUser;
      setupLuaMock(true, { daily: 9999, weekly: 9999, monthly: 9999, total: 9999 });

      const resp = await app.inject({ method: 'GET', url: '/api/v1/enrichment/check' });
      expect(resp.statusCode).toBe(200);
    });
  });

  // ── 5. Override Applied ───────────────────────────────────────────
  describe('Override Applied', () => {
    it('uses override limits instead of plan defaults', async () => {
      authState.user = analystUser;
      // Override: bump daily IOC limit from 100 to 5000
      mockPrisma.tenantFeatureOverride.findMany.mockResolvedValue([
        {
          tenantId,
          featureKey: 'ioc_management',
          limitDaily: 5000,
          limitWeekly: null,
          limitMonthly: null,
          limitTotal: null,
          expiresAt: null,
        },
      ]);
      // Force cache miss by clearing Redis mock
      mockRedis.get.mockResolvedValueOnce(null);
      setupLuaMock(true, { daily: 101, weekly: 1, monthly: 1, total: 1 });

      const resp = await app.inject({ method: 'GET', url: '/api/v1/iocs' });
      // Should pass (daily 101 < override 5000)
      expect(resp.statusCode).toBe(200);
    });
  });

  // ── 6. Super Admin Bypass ─────────────────────────────────────────
  describe('Super Admin Bypass', () => {
    it('super_admin requests skip quota entirely', async () => {
      authState.user = superAdminUser;

      const resp = await app.inject({ method: 'GET', url: '/api/v1/iocs' });
      expect(resp.statusCode).toBe(200);
      // Lua script should NOT be called
      expect(mockRedis.evalsha).not.toHaveBeenCalled();
      expect(mockRedis.eval).not.toHaveBeenCalled();
    });
  });

  // ── 7. X-Quota Headers ───────────────────────────────────────────
  describe('X-Quota Response Headers', () => {
    it('includes X-Quota headers on quota-checked routes', async () => {
      authState.user = analystUser;
      setupLuaMock(true, { daily: 5, weekly: 5, monthly: 5, total: 5 });

      const resp = await app.inject({ method: 'GET', url: '/api/v1/iocs' });
      expect(resp.statusCode).toBe(200);
      expect(resp.headers['x-quota-feature']).toBe('ioc_management');
      expect(resp.headers['x-quota-limit-daily']).toBe('100');
      expect(resp.headers['x-quota-remaining-daily']).toBe('95');
    });

    it('omits X-Quota headers on exempt routes', async () => {
      authState.user = null; // unauthenticated
      const resp = await app.inject({ method: 'GET', url: '/health' });
      expect(resp.statusCode).toBe(200);
      expect(resp.headers['x-quota-feature']).toBeUndefined();
    });
  });

  // ── 8. Counter Rollback ───────────────────────────────────────────
  describe('Counter Rollback on Error', () => {
    it('decrements counters when route returns 5xx', async () => {
      authState.user = analystUser;
      setupLuaMock(true, { daily: 10, weekly: 10, monthly: 10, total: 10 });

      const resp = await app.inject({ method: 'GET', url: '/api/v1/iocs/fail' });
      expect(resp.statusCode).toBe(500);

      // Verify pipeline-based decrement was called
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });
  });

  // ── 9. No Auth → Skip ────────────────────────────────────────────
  describe('Unauthenticated Requests', () => {
    it('skips quota for unauthenticated requests', async () => {
      authState.user = null;

      const resp = await app.inject({ method: 'GET', url: '/health' });
      expect(resp.statusCode).toBe(200);
      expect(mockRedis.evalsha).not.toHaveBeenCalled();
    });
  });

  // ── 10. Threshold Events ──────────────────────────────────────────
  describe('Threshold Events', () => {
    it('emits alert when usage reaches 80%', async () => {
      authState.user = analystUser;
      // 80 of 100 daily limit = 80%
      setupLuaMock(true, { daily: 80, weekly: 1, monthly: 1, total: 1 });

      await app.inject({ method: 'GET', url: '/api/v1/iocs' });

      // Should have called lpush to alert queue
      expect(mockRedis.lpush).toHaveBeenCalled();
      const [queueName, payload] = mockRedis.lpush.mock.calls[0];
      expect(queueName).toBe('etip-alert-evaluate');
      const parsed = JSON.parse(payload);
      expect(parsed.eventType).toBe('quota.warning.80');
      expect(parsed.featureKey).toBe('ioc_management');
      expect(parsed.percentage).toBe(80);
    });

    it('emits 90% alert (takes priority over 80%)', async () => {
      authState.user = analystUser;
      // 90 of 100 daily limit = 90%
      setupLuaMock(true, { daily: 90, weekly: 1, monthly: 1, total: 1 });

      await app.inject({ method: 'GET', url: '/api/v1/iocs' });

      expect(mockRedis.lpush).toHaveBeenCalled();
      const payload = JSON.parse(mockRedis.lpush.mock.calls[0][1]);
      expect(payload.eventType).toBe('quota.warning.90');
    });
  });

  // ── 11. Cache Invalidation ────────────────────────────────────────
  describe('Cache Invalidation', () => {
    it('invalidatePlanCache deletes Redis key for tenant', async () => {
      const { invalidatePlanCache } = await import('../src/plugins/quota-enforcement.js');
      await invalidatePlanCache(tenantId);
      expect(mockRedis.del).toHaveBeenCalledWith(`plan_cache:${tenantId}`);
    });
  });

  // ── 12. Usage Counter Helpers ─────────────────────────────────────
  describe('Usage Counter', () => {
    it('getUsage returns zeros when no counters exist', async () => {
      const { getUsage } = await import('../src/quota/usage-counter.js');
      const usage = await getUsage('tenant-new', 'ioc_management');
      expect(usage.daily).toBe(0);
      expect(usage.weekly).toBe(0);
      expect(usage.monthly).toBe(0);
      expect(usage.total).toBe(0);
    });

    it('resetUsage deletes the correct period key', async () => {
      const { resetUsage } = await import('../src/quota/usage-counter.js');
      await resetUsage(tenantId, 'ioc_management', 'daily');
      // Pipeline del should have been called
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('getResetTimestamp returns valid ISO dates', async () => {
      const { getResetTimestamp } = await import('../src/quota/usage-counter.js');
      const daily = getResetTimestamp('daily');
      expect(new Date(daily).getTime()).toBeGreaterThan(Date.now());

      const weekly = getResetTimestamp('weekly');
      expect(new Date(weekly).getTime()).toBeGreaterThan(Date.now());

      const monthly = getResetTimestamp('monthly');
      expect(new Date(monthly).getTime()).toBeGreaterThan(Date.now());

      expect(getResetTimestamp('total')).toBe('never');
    });
  });
});
