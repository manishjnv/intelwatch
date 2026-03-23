import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';
import { ApplyCouponSchema } from '../schemas/billing.js';
import type { CouponStore } from '../services/coupon-store.js';
import type { PlanStore } from '../services/plan-store.js';
import type { UsageStore } from '../services/usage-store.js';
import { PLAN_DEFINITIONS } from '../services/plan-store.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate<S extends ZodType<any, any, any>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export interface P0RouteDeps {
  couponStore: CouponStore;
  planStore: PlanStore;
  usageStore: UsageStore;
}

/**
 * P0 improvement routes:
 *   #6  Contextual upgrade prompts
 *   #7  Usage alerts (80/90/100% thresholds)
 *   #10 Coupon validation and application
 */
export function p0Routes(deps: P0RouteDeps) {
  const { couponStore, planStore, usageStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // ── P0 #6: Upgrade prompts ────────────────────────────────────

    /**
     * GET /upgrade-prompts — contextual upgrade prompts.
     * Returns prompts when the tenant is close to plan limits or
     * accessing features not in their current plan.
     */
    app.get('/upgrade-prompts', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const state = planStore.getTenantPlan(tenantId);
      const planDef = PLAN_DEFINITIONS[state.planId];
      const usage = usageStore.getUsage(tenantId);
      const prompts: { feature: string; message: string; targetPlan: string }[] = [];

      // Check if >80% of any limit is hit
      const apiPct = usageStore.getUsagePercent(tenantId, 'api_calls', planDef.limits.iocQueriesPerDay);
      if (apiPct >= 80 && state.planId !== 'enterprise') {
        const nextPlan = state.planId === 'free' ? 'starter' : state.planId === 'starter' ? 'pro' : 'enterprise';
        prompts.push({
          feature: 'api_queries',
          message: `You've used ${apiPct}% of your daily API queries. Upgrade to ${nextPlan} for ${apiPct >= 100 ? 'uninterrupted access' : 'more headroom'}.`,
          targetPlan: nextPlan,
        });
      }

      const storagePct = usageStore.getUsagePercent(tenantId, 'iocs_ingested', planDef.limits.iocStorageK * 1000);
      if (storagePct >= 80 && state.planId !== 'enterprise') {
        const nextPlan = state.planId === 'free' ? 'starter' : state.planId === 'starter' ? 'pro' : 'enterprise';
        prompts.push({
          feature: 'ioc_storage',
          message: `IOC storage is at ${storagePct}%. Upgrade to ${nextPlan} for ${storagePct >= 100 ? 'continued ingestion' : 'more capacity'}.`,
          targetPlan: nextPlan,
        });
      }

      // Feature-gated prompts
      if (!planDef.features.graph_visualization) {
        prompts.push({
          feature: 'graph_visualization',
          message: 'Threat Graph is a Pro feature. Upgrade to visualise entity relationships.',
          targetPlan: 'pro',
        });
      }

      if (!planDef.features.dark_web_monitoring) {
        prompts.push({
          feature: 'dark_web_monitoring',
          message: 'Dark Web Monitoring is a Pro feature. Upgrade to detect credential leaks.',
          targetPlan: 'pro',
        });
      }

      // Suppress if the tenant is already at the max plan
      void usage; // used indirectly via getUsagePercent
      return reply.send({ data: prompts, currentPlan: state.planId });
    });

    // ── P0 #7: Usage alerts ───────────────────────────────────────

    /**
     * GET /alerts — current usage alerts (80%, 90%, 100% threshold crossings).
     */
    app.get('/alerts', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const state = planStore.getTenantPlan(tenantId);
      const planDef = PLAN_DEFINITIONS[state.planId];
      const alerts = usageStore.getAlertThresholds(tenantId, {
        api_calls: planDef.limits.iocQueriesPerDay,
        iocs_ingested: planDef.limits.iocStorageK * 1000,
        enrichments: planDef.limits.enrichmentsPerDay,
        storage_kb: planDef.limits.iocStorageK * 1024,
      });
      return reply.send({ data: alerts });
    });

    // ── P0 #10: Coupons ───────────────────────────────────────────

    /** GET /coupons/:code — validate a coupon code without applying it. */
    app.get('/coupons/:code', async (req: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
      const result = couponStore.validateCoupon(req.params.code.toUpperCase());
      if (!result.valid) {
        throw new AppError(400, result.reason ?? 'Invalid coupon', 'INVALID_COUPON');
      }
      return reply.send({ data: result.coupon });
    });

    /** POST /coupons/apply — apply a coupon to a quoted amount. */
    app.post('/coupons/apply', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(ApplyCouponSchema, req.body);
      const body = req.body as Record<string, unknown>;
      const originalAmount = typeof body['originalAmountInr'] === 'number' ? body['originalAmountInr'] : 0;
      const result = couponStore.applyCoupon(input.code.toUpperCase(), tenantId, originalAmount);
      return reply.send({ data: result });
    });
  };
}
