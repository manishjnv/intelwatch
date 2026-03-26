/**
 * Feed Quota Routes
 *
 * Manages per-plan feed quotas and per-tenant plan assignments.
 * - GET  /plans                  → list all plan quotas
 * - GET  /plans/:planId          → get quota for one plan
 * - PUT  /plans/:planId          → update plan quota (super_admin)
 * - GET  /tenants/me             → get current tenant's effective quota
 * - GET  /tenants/:tenantId/plan → get tenant's plan assignment
 * - PUT  /tenants/:tenantId/plan → assign plan to tenant (super_admin)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import { FeedQuotaStore, type BillingPlanId } from '../services/feed-quota-store.js';

export interface FeedQuotaRouteDeps {
  feedQuotaStore: FeedQuotaStore;
}

const PlanIdParam = z.object({ planId: z.string() });
const TenantIdParam = z.object({ tenantId: z.string().uuid() });

const UpdateQuotaBody = z.object({
  maxFeeds: z.number().int().optional(),
  minFetchInterval: z.string().optional(),
  retentionDays: z.number().int().optional(),
  defaultFeedNames: z.array(z.string()).optional(),
});

const AssignPlanBody = z.object({
  planId: z.enum(['free', 'starter', 'teams', 'enterprise']),
});

/** Extract tenant/user IDs from request headers. */
function getRequestContext(req: FastifyRequest) {
  return {
    tenantId: (req.headers['x-tenant-id'] as string) || '',
    userId: (req.headers['x-user-id'] as string) || 'unknown',
    role: (req.headers['x-user-role'] as string) || 'viewer',
  };
}

/** Guard: require super_admin role. */
function requireSuperAdmin(req: FastifyRequest): void {
  const { role } = getRequestContext(req);
  if (role !== 'super_admin') {
    throw new AppError(403, 'Only super_admin can perform this action', 'FORBIDDEN');
  }
}

export function feedQuotaRoutes(deps: FeedQuotaRouteDeps) {
  const { feedQuotaStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /plans — list all plan quota definitions. */
    app.get('/plans', async (_req: FastifyRequest, reply: FastifyReply) => {
      const plans = feedQuotaStore.listPlanQuotas();
      return reply.send({ data: plans });
    });

    /** GET /plans/:planId — get quota for a specific plan. */
    app.get(
      '/plans/:planId',
      async (req: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) => {
        const { planId } = PlanIdParam.parse(req.params);
        if (!FeedQuotaStore.isValidPlanId(planId)) {
          throw new AppError(400, `Invalid plan ID: ${planId}`, 'INVALID_PLAN');
        }
        const quota = feedQuotaStore.getPlanQuota(planId as BillingPlanId);
        return reply.send({ data: quota });
      },
    );

    /** PUT /plans/:planId — update plan quota (super_admin only). */
    app.put(
      '/plans/:planId',
      async (req: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) => {
        requireSuperAdmin(req);
        const { planId } = PlanIdParam.parse(req.params);
        if (!FeedQuotaStore.isValidPlanId(planId)) {
          throw new AppError(400, `Invalid plan ID: ${planId}`, 'INVALID_PLAN');
        }
        const body = UpdateQuotaBody.parse(req.body);
        const updated = feedQuotaStore.updatePlanQuota(planId as BillingPlanId, body);
        return reply.send({ data: updated });
      },
    );

    /** GET /tenants/me — get the calling tenant's effective feed quota. */
    app.get('/tenants/me', async (req: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = getRequestContext(req);
      if (!tenantId) {
        throw new AppError(400, 'Missing x-tenant-id header', 'MISSING_TENANT');
      }
      const quota = feedQuotaStore.getTenantFeedQuota(tenantId);
      const nextPlan = feedQuotaStore.getNextPlan(quota.planId);
      const nextPlanQuota = nextPlan ? feedQuotaStore.getPlanQuota(nextPlan) : null;
      return reply.send({
        data: {
          ...quota,
          nextPlan,
          nextPlanMaxFeeds: nextPlanQuota?.feedQuota.maxFeeds ?? null,
        },
      });
    });

    /** GET /tenants/:tenantId/plan — get a tenant's plan assignment. */
    app.get(
      '/tenants/:tenantId/plan',
      async (req: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
        const { tenantId } = TenantIdParam.parse(req.params);
        const assignment = feedQuotaStore.getTenantPlan(tenantId);
        const quota = feedQuotaStore.getTenantFeedQuota(tenantId);
        return reply.send({ data: { ...assignment, feedQuota: quota } });
      },
    );

    /** PUT /tenants/:tenantId/plan — assign plan to tenant (super_admin only). */
    app.put(
      '/tenants/:tenantId/plan',
      async (req: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
        requireSuperAdmin(req);
        const { tenantId } = TenantIdParam.parse(req.params);
        const { userId } = getRequestContext(req);
        const body = AssignPlanBody.parse(req.body);
        const { assignment, previousPlanId } = feedQuotaStore.assignPlan(
          tenantId,
          body.planId,
          userId,
        );
        const isUpgrade = feedQuotaStore.isUpgrade(previousPlanId, body.planId);
        const quota = feedQuotaStore.getTenantFeedQuota(tenantId);
        return reply.send({
          data: {
            ...assignment,
            previousPlanId,
            isUpgrade,
            feedQuota: quota,
          },
        });
      },
    );
  };
}
