/**
 * @module api-gateway/routes/plans
 * @description Plan Definition CRUD — super_admin only.
 * 6 endpoints for managing subscription plan definitions + feature limits.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { PlanDefinitionCreateSchema, PlanDefinitionUpdateSchema } from '@etip/shared-types';
import { authenticate, getUser } from '../plugins/auth.js';
import { rbac } from '../plugins/rbac.js';
import { invalidatePlanCacheForPlan } from '../plugins/quota-enforcement.js';
import * as repo from './plan-repository.js';

const superAdmin = [authenticate, rbac('admin:*')];

export async function planRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/admin/plans — List all plan definitions with feature limits */
  app.get('/', { preHandler: superAdmin }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const plans = await repo.findAllPlans();
    return reply.status(200).send({ data: plans, total: plans.length });
  });

  /** GET /api/v1/admin/plans/:planId — Get single plan with all feature limits */
  app.get('/:planId', { preHandler: superAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { planId } = req.params as { planId: string };
    const plan = await repo.findPlanByPlanId(planId);
    if (!plan) throw new AppError(404, `Plan '${planId}' not found`, 'PLAN_NOT_FOUND');
    return reply.status(200).send({ data: plan });
  });

  /** POST /api/v1/admin/plans — Create plan + feature limits (atomic) */
  app.post('/', { preHandler: superAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = PlanDefinitionCreateSchema.parse(req.body);

    // Check planId uniqueness
    const existing = await repo.findPlanByPlanId(body.planId);
    if (existing) throw new AppError(409, `Plan '${body.planId}' already exists`, 'PLAN_ALREADY_EXISTS');

    const user = getUser(req);
    const plan = await repo.createPlan(body, user.email ?? user.sub);
    return reply.status(201).send({ data: plan });
  });

  /** PUT /api/v1/admin/plans/:planId — Update plan details + feature limits */
  app.put('/:planId', { preHandler: superAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { planId } = req.params as { planId: string };
    const body = PlanDefinitionUpdateSchema.parse(req.body);

    const plan = await repo.updatePlan(planId, body);
    if (!plan) throw new AppError(404, `Plan '${planId}' not found`, 'PLAN_NOT_FOUND');
    await invalidatePlanCacheForPlan(planId);
    return reply.status(200).send({ data: plan });
  });

  /** DELETE /api/v1/admin/plans/:planId — Delete plan (reject if tenants assigned) */
  app.delete('/:planId', { preHandler: superAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { planId } = req.params as { planId: string };

    // Check if any tenants are on this plan
    const tenantCount = await repo.countTenantsOnPlan(planId);
    if (tenantCount > 0) {
      throw new AppError(
        409,
        `Cannot delete plan '${planId}' — ${tenantCount} tenant(s) still assigned`,
        'PLAN_HAS_TENANTS',
        { tenantCount },
      );
    }

    const deleted = await repo.deletePlan(planId);
    if (!deleted) throw new AppError(404, `Plan '${planId}' not found`, 'PLAN_NOT_FOUND');
    await invalidatePlanCacheForPlan(planId);
    return reply.status(204).send();
  });

  /** GET /api/v1/admin/plans/:planId/tenants — List tenants on this plan */
  app.get('/:planId/tenants', { preHandler: superAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { planId } = req.params as { planId: string };

    // Verify plan exists
    const plan = await repo.findPlanByPlanId(planId);
    if (!plan) throw new AppError(404, `Plan '${planId}' not found`, 'PLAN_NOT_FOUND');

    const tenants = await repo.findTenantsOnPlan(planId);
    return reply.status(200).send({ data: tenants, total: tenants.length });
  });
}
