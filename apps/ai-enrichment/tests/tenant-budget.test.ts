import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { TenantBudgetService, PLAN_AI_DEFAULTS } from '../src/services/tenant-budget.js';

const logger = pino({ level: 'silent' });
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function mockPrisma(plan: string | null) {
  return {
    tenant: {
      findUnique: vi.fn().mockResolvedValue(plan ? { plan } : null),
    },
  } as unknown as { tenant: { findUnique: ReturnType<typeof vi.fn> } };
}

function mockRedis(overrides: Record<string, string | number> = {}) {
  const store = new Map<string, string>(Object.entries(overrides).map(([k, v]) => [k, String(v)]));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    incrby: vi.fn(async (key: string, n: number) => {
      const cur = Number(store.get(key) ?? 0);
      store.set(key, String(cur + n));
      return cur + n;
    }),
    incrbyfloat: vi.fn(async (key: string, n: number) => {
      const cur = Number(store.get(key) ?? 0);
      store.set(key, String(cur + n));
      return String(cur + n);
    }),
    expire: vi.fn().mockResolvedValue(1),
    _store: store,
  };
}

describe('TenantBudgetService', () => {
  describe('plan resolution', () => {
    it('reads Tenant.plan and applies its aiEnabled/budget', async () => {
      const prisma = mockPrisma('free');
      const svc = new TenantBudgetService(prisma as never, null, 5, logger);
      const result = await svc.checkBudget(TENANT_ID);
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { id: TENANT_ID }, select: { plan: true } });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('plan-ai-disabled');
    });

    it('falls back to global USD budget only when tenant/plan is unknown (no prisma)', async () => {
      const svc = new TenantBudgetService(null, null, 5, logger);
      const result = await svc.checkBudget(TENANT_ID);
      expect(result.allowed).toBe(true);
    });

    it('falls back when tenant not found in DB', async () => {
      const prisma = mockPrisma(null);
      const svc = new TenantBudgetService(prisma as never, null, 0, logger);
      const result = await svc.checkBudget(TENANT_ID);
      expect(result.allowed).toBe(true);
    });

    it('enterprise plan (unlimited tokens) still allowed with no Redis usage', async () => {
      const prisma = mockPrisma('enterprise');
      const redis = mockRedis();
      const svc = new TenantBudgetService(prisma as never, redis as never, 5, logger);
      const result = await svc.checkBudget(TENANT_ID);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Redis counters', () => {
    it('increments token and USD counters with the expected key + TTL', async () => {
      const redis = mockRedis();
      const svc = new TenantBudgetService(null, redis as never, 5, logger);
      await svc.recordUsage(TENANT_ID, 200, 0.05);

      const today = new Date().toISOString().slice(0, 10);
      expect(redis.incrby).toHaveBeenCalledWith(`enrichment:budget:${TENANT_ID}:${today}:tokens`, 200);
      expect(redis.incrbyfloat).toHaveBeenCalledWith(`enrichment:budget:${TENANT_ID}:${today}:usd`, 0.05);
      expect(redis.expire).toHaveBeenCalledWith(`enrichment:budget:${TENANT_ID}:${today}:tokens`, 48 * 60 * 60);
      expect(redis.expire).toHaveBeenCalledWith(`enrichment:budget:${TENANT_ID}:${today}:usd`, 48 * 60 * 60);
    });

    it('rejects when plan token budget is exceeded', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const prisma = mockPrisma('starter'); // dailyTokenBudget: 10_000
      const redis = mockRedis({ [`enrichment:budget:${TENANT_ID}:${today}:tokens`]: 10_000 });
      const svc = new TenantBudgetService(prisma as never, redis as never, 5, logger);

      const result = await svc.checkBudget(TENANT_ID);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('plan-token-budget-exceeded');
    });

    it('rejects when global USD budget is exceeded (no plan)', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const redis = mockRedis({ [`enrichment:budget:${TENANT_ID}:${today}:usd`]: 5 });
      const svc = new TenantBudgetService(null, redis as never, 5, logger);

      const result = await svc.checkBudget(TENANT_ID);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('global-usd-budget-exceeded');
    });

    it('allows when under both budgets', async () => {
      const prisma = mockPrisma('starter');
      const redis = mockRedis();
      const svc = new TenantBudgetService(prisma as never, redis as never, 5, logger);
      const result = await svc.checkBudget(TENANT_ID);
      expect(result.allowed).toBe(true);
    });
  });

  describe('5-minute plan cache', () => {
    it('does not refetch within 5 minutes', async () => {
      let clock = 0;
      const prisma = mockPrisma('free');
      const svc = new TenantBudgetService(prisma as never, null, 5, logger, () => clock);

      await svc.checkBudget(TENANT_ID);
      clock += 4 * 60 * 1000; // 4 minutes later
      await svc.checkBudget(TENANT_ID);

      expect(prisma.tenant.findUnique).toHaveBeenCalledOnce();
    });

    it('refetches after 5 minutes', async () => {
      let clock = 0;
      const prisma = mockPrisma('free');
      const svc = new TenantBudgetService(prisma as never, null, 5, logger, () => clock);

      await svc.checkBudget(TENANT_ID);
      clock += 6 * 60 * 1000; // 6 minutes later
      await svc.checkBudget(TENANT_ID);

      expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('fail-closed on Redis error', () => {
    it('skips Haiku (allowed=false) when Redis throws', async () => {
      const prisma = mockPrisma('starter');
      const redis = { get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
      const svc = new TenantBudgetService(prisma as never, redis as never, 5, logger);

      const result = await svc.checkBudget(TENANT_ID);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('redis-error');
    });

    it('recordUsage swallows Redis errors without throwing', async () => {
      const redis = { incrby: vi.fn().mockRejectedValue(new Error('down')) };
      const svc = new TenantBudgetService(null, redis as never, 5, logger);
      await expect(svc.recordUsage(TENANT_ID, 100, 0.01)).resolves.toBeUndefined();
    });
  });

  it('PLAN_AI_DEFAULTS covers all Prisma Plan enum values', () => {
    expect(Object.keys(PLAN_AI_DEFAULTS).sort()).toEqual(['enterprise', 'free', 'pro', 'starter']);
    expect(PLAN_AI_DEFAULTS.free.aiEnabled).toBe(false);
    expect(PLAN_AI_DEFAULTS.enterprise.dailyTokenBudget).toBe(-1);
  });
});
