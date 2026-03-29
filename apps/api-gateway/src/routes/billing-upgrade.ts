/**
 * @module api-gateway/routes/billing-upgrade
 * @description Free-to-paid plan upgrade/downgrade + plan listing (I-14).
 * POST /upgrade — switch tenant plan with downgrade protection.
 * GET  /plans   — list public plans for billing page.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { FEATURE_KEYS } from '@etip/shared-types';
import { QUEUES, EVENTS, AppError } from '@etip/shared-utils';
import { authenticate, getUser } from '../plugins/auth.js';
import { rbac } from '../plugins/rbac.js';
import { prisma } from '../prisma.js';
import { invalidatePlanCache, getRedis } from '../quota/plan-cache.js';
import { getUsage } from '../quota/usage-counter.js';
import { findAllPlans, findPlanByPlanId } from './plan-repository.js';

const tenantAdmin = [authenticate, rbac('org:read')];
const tenantMember = [authenticate];

const PLAN_ORDER = ['free', 'starter', 'pro', 'enterprise'] as const;

const UpgradeBodySchema = z.object({
  targetPlan: z.enum(['free', 'starter', 'pro', 'enterprise']),
});

export async function billingUpgradeRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /upgrade — Switch tenant plan.
   * Tenant admin only. Validates downgrade doesn't exceed target limits.
   */
  app.post(
    '/upgrade',
    { preHandler: tenantAdmin },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const tenantId = user.tenantId;
      const { targetPlan } = UpgradeBodySchema.parse(req.body);

      // 1. Get current tenant
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, plan: true, name: true },
      });
      if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');

      const currentPlan = tenant.plan as string;

      // 2. Same plan check
      if (currentPlan === targetPlan) {
        return reply.status(400).send({
          error: {
            code: 'ALREADY_ON_PLAN',
            message: `Tenant is already on the ${currentPlan} plan`,
          },
        });
      }

      // 3. Verify target plan exists
      const targetPlanDef = await findPlanByPlanId(targetPlan);
      if (!targetPlanDef) throw new AppError(404, `Plan '${targetPlan}' not found`, 'PLAN_NOT_FOUND');

      // 4. Downgrade protection — check usage vs target limits
      const currentIdx = PLAN_ORDER.indexOf(currentPlan as typeof PLAN_ORDER[number]);
      const targetIdx = PLAN_ORDER.indexOf(targetPlan);
      const isDowngrade = targetIdx < currentIdx;

      if (isDowngrade) {
        const targetLimitsMap = new Map<string, { enabled: boolean; limitDaily: number; limitMonthly: number; limitTotal: number }>();
        for (const f of targetPlanDef.features) {
          targetLimitsMap.set(f.featureKey, {
            enabled: f.enabled,
            limitDaily: f.limitDaily,
            limitMonthly: f.limitMonthly,
            limitTotal: f.limitTotal,
          });
        }

        const violations: { feature: string; current: number; targetLimit: number; period: string }[] = [];

        for (const key of FEATURE_KEYS) {
          const targetFeature = targetLimitsMap.get(key);
          if (!targetFeature) continue;

          // Feature disabled on target plan — check if currently in use
          if (!targetFeature.enabled) {
            const usage = await getUsage(tenantId, key);
            if (usage.monthly > 0) {
              violations.push({ feature: key, current: usage.monthly, targetLimit: 0, period: 'monthly' });
            }
            continue;
          }

          const usage = await getUsage(tenantId, key);

          // Check monthly limit (most commonly enforced)
          if (targetFeature.limitMonthly > 0 && usage.monthly > targetFeature.limitMonthly) {
            violations.push({
              feature: key,
              current: usage.monthly,
              targetLimit: targetFeature.limitMonthly,
              period: 'monthly',
            });
          }

          // Check daily limit
          if (targetFeature.limitDaily > 0 && usage.daily > targetFeature.limitDaily) {
            violations.push({
              feature: key,
              current: usage.daily,
              targetLimit: targetFeature.limitDaily,
              period: 'daily',
            });
          }
        }

        // Also check user count for 'users' feature
        const usersFeature = targetLimitsMap.get('users');
        if (usersFeature && usersFeature.limitTotal > 0) {
          const userCount = await prisma.user.count({ where: { tenantId, active: true } });
          if (userCount > usersFeature.limitTotal) {
            violations.push({
              feature: 'users',
              current: userCount,
              targetLimit: usersFeature.limitTotal,
              period: 'total',
            });
          }
        }

        if (violations.length > 0) {
          return reply.status(422).send({
            error: {
              code: 'DOWNGRADE_EXCEEDS_LIMITS',
              message: 'Cannot downgrade: current usage exceeds target plan limits',
              violations,
              suggestion: violations
                .map((v) => `Reduce ${v.feature} ${v.period} usage from ${v.current} to ≤${v.targetLimit}`)
                .join('; '),
            },
          });
        }
      }

      // 5. Execute plan switch in transaction
      await prisma.$transaction([
        prisma.tenant.update({
          where: { id: tenantId },
          data: { plan: targetPlan as never },
        }),
        prisma.tenantSubscription.upsert({
          where: { tenantId },
          create: {
            tenantId,
            plan: targetPlan as never,
            status: 'active',
            previousPlan: currentPlan as never,
            currentPeriodStart: new Date(),
          },
          update: {
            plan: targetPlan as never,
            previousPlan: currentPlan as never,
            status: 'active',
            currentPeriodStart: new Date(),
          },
        }),
      ]);

      // 6. Invalidate plan cache
      await invalidatePlanCache(tenantId);

      // 7. Queue billing event
      const redis = getRedis();
      if (redis) {
        const payload = JSON.stringify({
          event: EVENTS.BILLING_PLAN_CHANGED,
          tenantId,
          previousPlan: currentPlan,
          newPlan: targetPlan,
          changedBy: user.sub,
          timestamp: new Date().toISOString(),
        });
        await redis.lpush(QUEUES.BILLING_PLAN_CHANGED, payload).catch(() => {
          req.log.warn('Failed to queue BILLING_PLAN_CHANGED event');
        });
      }

      req.log.info(
        { tenantId, previousPlan: currentPlan, newPlan: targetPlan, changedBy: user.sub },
        'Plan changed',
      );

      return reply.status(200).send({
        data: {
          tenantId,
          previousPlan: currentPlan,
          currentPlan: targetPlan,
          changedAt: new Date().toISOString(),
          isUpgrade: targetIdx > currentIdx,
        },
      });
    },
  );

  /**
   * GET /plans — List public plans with features.
   * Any authenticated user. Marks tenant's current plan with isCurrent flag.
   */
  app.get(
    '/plans',
    { preHandler: tenantMember },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const tenantId = user.tenantId;

      // Get tenant's current plan
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true },
      });
      const currentPlan = (tenant?.plan as string) ?? 'free';

      // Get all public plans
      const allPlans = await findAllPlans();
      const publicPlans = allPlans
        .filter((p) => p.isPublic)
        .map((p) => ({
          planId: p.planId,
          name: p.name,
          description: p.description,
          priceMonthlyInr: p.priceMonthlyInr,
          priceAnnualInr: p.priceAnnualInr,
          sortOrder: p.sortOrder,
          isCurrent: p.planId === currentPlan,
          features: p.features.map((f) => ({
            featureKey: f.featureKey,
            enabled: f.enabled,
            limitDaily: f.limitDaily,
            limitMonthly: f.limitMonthly,
            limitTotal: f.limitTotal,
          })),
        }));

      return reply.status(200).send({ data: publicPlans });
    },
  );
}
