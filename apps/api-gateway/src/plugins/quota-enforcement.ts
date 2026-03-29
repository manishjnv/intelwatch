/**
 * @module plugins/quota-enforcement
 * @description Fastify plugin that enforces per-tenant quota limits.
 * Runs AFTER auth + RBAC, BEFORE route handler (preHandler hook).
 * Adds X-Quota-* response headers and emits threshold warnings via Redis.
 *
 * Flow: resolveFeatureKey → getPlanLimits → checkAndIncrement → headers
 * Super admins bypass entirely. Failed requests get counters rolled back.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QUEUES } from '@etip/shared-utils';
import type { FeatureLimits, QuotaThresholdEvent } from '@etip/shared-types';
import { resolveFeatureKey } from '../config/feature-routes.js';
import { getPlanLimits, getTenantPlanName, getRedis, initPlanCache, closePlanCache } from '../quota/plan-cache.js';
import { checkAndIncrement, decrementCounters, getResetTimestamp } from '../quota/usage-counter.js';
import type { AuthenticatedRequest } from './auth.js';

/** Quota context attached to the request for onSend/onResponse hooks */
interface QuotaContext {
  tenantId: string;
  featureKey: string;
  limits: FeatureLimits;
  counters?: { daily: number; weekly: number; monthly: number; total: number };
}

const QUOTA_SYMBOL = Symbol.for('etip.quota');

/**
 * Register the quota enforcement plugin on a Fastify instance.
 * Call once in app.ts after auth/RBAC plugins are registered.
 */
export async function registerQuotaEnforcement(
  app: FastifyInstance,
  redisUrl: string,
): Promise<void> {
  // Initialize Redis for plan cache + usage counters
  initPlanCache(redisUrl);

  // ── preHandler: enforce quotas ────────────────────────────────────
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as FastifyRequest & AuthenticatedRequest).user;

    // No auth → skip (unauthenticated routes like health/auth)
    if (!user) return;

    // Super admin bypasses quota entirely
    if (user.role === 'super_admin') return;

    // Resolve feature key from route
    const featureKey = resolveFeatureKey(req.method, req.url);
    if (!featureKey) return;

    const tenantId = user.tenantId;
    const limits = await getPlanLimits(tenantId);
    const featureLimits = limits.get(featureKey);

    // No limits defined for this feature → allow
    if (!featureLimits) return;

    // Feature disabled → 403
    if (!featureLimits.enabled) {
      const plan = await getTenantPlanName(tenantId);
      return reply.status(403).send({
        error: {
          code: 'FEATURE_NOT_AVAILABLE',
          message: 'This feature is not available on your current plan',
          feature: featureKey,
          currentPlan: plan,
          upgradeUrl: '/command-center?tab=billing',
        },
      });
    }

    // Check and increment counters atomically
    const result = await checkAndIncrement(tenantId, featureKey, featureLimits);

    if (!result.allowed) {
      const plan = await getTenantPlanName(tenantId);
      const resetAt = getResetTimestamp(result.exceededPeriod!);
      return reply.status(429).send({
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `${formatPeriod(result.exceededPeriod!)} ${formatFeature(featureKey)} limit reached (${result.used}/${result.limit})`,
          feature: featureKey,
          limit: result.limit,
          used: result.used,
          period: result.exceededPeriod,
          resetsAt: resetAt,
          currentPlan: plan,
          upgradeUrl: '/command-center?tab=billing',
        },
      });
    }

    // Stash quota context for onSend hooks (headers + rollback)
    (req as unknown as Record<symbol, unknown>)[QUOTA_SYMBOL] = {
      tenantId,
      featureKey,
      limits: featureLimits,
      counters: result.counters,
    } satisfies QuotaContext;

    // Check threshold warnings (80%, 90%)
    if (result.counters) {
      await checkThresholds(tenantId, featureKey, featureLimits, result.counters);
    }
  });

  // ── onSend: add X-Quota headers + rollback on error ──────────────
  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = (req as unknown as Record<symbol, unknown>)[QUOTA_SYMBOL] as QuotaContext | undefined;
    if (!ctx) return;

    // Rollback counters on 4xx/5xx (don't charge for failed requests)
    if (reply.statusCode >= 400) {
      await decrementCounters(ctx.tenantId, ctx.featureKey);
      return;
    }

    // Add X-Quota-* response headers
    addQuotaHeaders(reply, ctx);
  });

  // Cleanup on shutdown
  app.addHook('onClose', async () => {
    await closePlanCache();
  });
}

// ── X-Quota Response Headers ───────────────────────────────────────────

function addQuotaHeaders(reply: FastifyReply, ctx: QuotaContext): void {
  const { featureKey, limits, counters } = ctx;
  if (!counters) return;

  reply.header('X-Quota-Feature', featureKey);

  if (limits.limitDaily >= 0) {
    reply.header('X-Quota-Limit-Daily', String(limits.limitDaily));
    reply.header('X-Quota-Remaining-Daily', String(Math.max(0, limits.limitDaily - counters.daily)));
    reply.header('X-Quota-Reset-Daily', getResetTimestamp('daily'));
  }

  if (limits.limitMonthly >= 0) {
    reply.header('X-Quota-Limit-Monthly', String(limits.limitMonthly));
    reply.header('X-Quota-Remaining-Monthly', String(Math.max(0, limits.limitMonthly - counters.monthly)));
  }
}

// ── Threshold Warnings (80%, 90%) ──────────────────────────────────────

const THRESHOLDS = [
  { pct: 90, event: 'quota.warning.90' as const },
  { pct: 80, event: 'quota.warning.80' as const },
];

/** Track which thresholds have already been emitted (per tenant:feature:period:percentage) */
const emittedThresholds = new Set<string>();

async function checkThresholds(
  tenantId: string,
  featureKey: string,
  limits: FeatureLimits,
  counters: { daily: number; weekly: number; monthly: number; total: number },
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const periods = [
    { period: 'daily' as const, limit: limits.limitDaily, used: counters.daily },
    { period: 'weekly' as const, limit: limits.limitWeekly, used: counters.weekly },
    { period: 'monthly' as const, limit: limits.limitMonthly, used: counters.monthly },
    { period: 'total' as const, limit: limits.limitTotal, used: counters.total },
  ];

  for (const { period, limit, used } of periods) {
    if (limit <= 0) continue; // unlimited or disabled
    const pct = (used / limit) * 100;

    for (const threshold of THRESHOLDS) {
      if (pct < threshold.pct) continue;

      const key = `${tenantId}:${featureKey}:${period}:${threshold.pct}`;
      if (emittedThresholds.has(key)) continue;
      emittedThresholds.add(key);

      // Emit to alerting queue
      const payload: QuotaThresholdEvent = {
        tenantId,
        featureKey,
        period,
        limit,
        used,
        percentage: Math.round(pct),
        plan: 'unknown', // non-blocking — plan name not critical for alert
        eventType: threshold.event,
      };

      try {
        await redis.lpush(QUEUES.ALERT_EVALUATE, JSON.stringify(payload));
      } catch {
        /* non-fatal */
      }
      break; // Only emit highest threshold per period
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatPeriod(period: string): string {
  return period.charAt(0).toUpperCase() + period.slice(1);
}

function formatFeature(key: string): string {
  return key.replace(/_/g, ' ');
}

/**
 * Re-export getUsage for usage query endpoints.
 * Re-exported here so routes only import from plugins/quota-enforcement.
 */
export { getUsage, getResetTimestamp } from '../quota/usage-counter.js';
export { getPlanLimits, invalidatePlanCache, invalidatePlanCacheForPlan } from '../quota/plan-cache.js';
