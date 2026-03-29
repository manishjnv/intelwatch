/**
 * @module api-gateway/quota/plan-cache
 * @description Redis-backed cache for tenant plan limits. Merges plan defaults
 * with per-tenant overrides (override wins per non-null field). TTL: 5 minutes.
 */
import Redis from 'ioredis';
import { prisma } from '../prisma.js';
import type { FeatureLimits } from '@etip/shared-types';

const CACHE_TTL_SECONDS = 300; // 5 minutes
const KEY_PREFIX = 'plan_cache:';

let redis: Redis | null = null;

/** Initialize Redis connection for plan cache */
export function initPlanCache(redisUrl: string): void {
  redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  redis.connect().catch(() => {
    /* handled by caller — quota enforcement degrades gracefully */
  });
}

/** Shutdown Redis connection */
export async function closePlanCache(): Promise<void> {
  if (redis) {
    await redis.quit().catch(() => {});
    redis = null;
  }
}

/** Get the Redis instance (for usage-counter and other quota modules) */
export function getRedis(): Redis | null {
  return redis;
}

/**
 * Load merged plan limits for a tenant. Cache-first with 5-min TTL.
 * On cache miss: DB query → merge plan + overrides → cache result.
 */
export async function getPlanLimits(
  tenantId: string,
): Promise<Map<string, FeatureLimits>> {
  const cacheKey = `${KEY_PREFIX}${tenantId}`;

  // Try cache first
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, FeatureLimits>;
        return new Map(Object.entries(parsed));
      }
    } catch {
      /* cache miss — fall through to DB */
    }
  }

  // Cache miss — load from DB
  const limits = await loadLimitsFromDb(tenantId);

  // Write to cache
  if (redis) {
    try {
      const obj = Object.fromEntries(limits);
      await redis.set(cacheKey, JSON.stringify(obj), 'EX', CACHE_TTL_SECONDS);
    } catch {
      /* non-fatal — next request will retry */
    }
  }

  return limits;
}

/**
 * Invalidate cached plan limits for a tenant.
 * Call on: plan change, override change, plan upgrade/downgrade.
 */
export async function invalidatePlanCache(tenantId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(`${KEY_PREFIX}${tenantId}`);
  } catch {
    /* non-fatal */
  }
}

/**
 * Invalidate plan cache for ALL tenants on a given plan.
 * Call on: plan definition update/delete (affects all subscribers).
 */
export async function invalidatePlanCacheForPlan(planId: string): Promise<void> {
  if (!redis) return;
  try {
    const tenants = await prisma.tenant.findMany({
      where: { plan: planId as never },
      select: { id: true },
    });
    const pipeline = redis.pipeline();
    for (const t of tenants) {
      pipeline.del(`${KEY_PREFIX}${t.id}`);
    }
    await pipeline.exec();
  } catch {
    /* non-fatal */
  }
}

/**
 * Load plan limits from DB: tenant → plan definition → feature limits,
 * then overlay non-null override fields.
 */
async function loadLimitsFromDb(
  tenantId: string,
): Promise<Map<string, FeatureLimits>> {
  const result = new Map<string, FeatureLimits>();

  // Get tenant's plan
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });
  if (!tenant) return result;

  // Load plan definition + feature limits
  const planDef = await prisma.subscriptionPlanDefinition.findUnique({
    where: { planId: tenant.plan },
    include: { features: true },
  });

  if (planDef) {
    for (const f of planDef.features) {
      result.set(f.featureKey, {
        enabled: f.enabled,
        limitDaily: f.limitDaily,
        limitWeekly: f.limitWeekly,
        limitMonthly: f.limitMonthly,
        limitTotal: f.limitTotal,
      });
    }
  }

  // Load overrides and overlay non-null fields
  const overrides = await prisma.tenantFeatureOverride.findMany({
    where: {
      tenantId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  for (const ov of overrides) {
    const base = result.get(ov.featureKey) ?? {
      enabled: true,
      limitDaily: -1,
      limitWeekly: -1,
      limitMonthly: -1,
      limitTotal: -1,
    };
    result.set(ov.featureKey, {
      enabled: base.enabled,
      limitDaily: ov.limitDaily !== null ? ov.limitDaily : base.limitDaily,
      limitWeekly: ov.limitWeekly !== null ? ov.limitWeekly : base.limitWeekly,
      limitMonthly: ov.limitMonthly !== null ? ov.limitMonthly : base.limitMonthly,
      limitTotal: ov.limitTotal !== null ? ov.limitTotal : base.limitTotal,
    });
  }

  return result;
}

/**
 * Get the plan name for a tenant (for error responses).
 * Uses a short-lived in-memory approach — not cached in Redis.
 */
export async function getTenantPlanName(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });
  return tenant?.plan ?? 'unknown';
}
