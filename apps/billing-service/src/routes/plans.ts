import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';
import { SetTenantPlanSchema } from '../schemas/billing.js';
import type { PlanStore } from '../services/plan-store.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate<S extends ZodType<any, any, any>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export interface PlanRouteDeps {
  planStore: PlanStore;
}

/** Plan management routes: list, get, compare, tenant assignment. */
export function planRoutes(deps: PlanRouteDeps) {
  const { planStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /plans — list all available plans. */
    app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
      const plans = planStore.listPlans();
      return reply.send({ data: plans });
    });

    /**
     * GET /plans/compare — feature comparison matrix.
     * Must be registered before /plans/:planId to avoid ambiguity.
     */
    app.get('/compare', async (_req: FastifyRequest, reply: FastifyReply) => {
      const comparison = planStore.comparePlans();
      return reply.send({ data: comparison });
    });

    /** GET /plans/:planId — get a specific plan. */
    app.get('/:planId', async (req: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) => {
      // validate planId is a known enum value
      const { planId } = req.params;
      const validIds = ['free', 'starter', 'teams', 'enterprise'];
      if (!validIds.includes(planId)) {
        throw new AppError(404, `Plan not found: ${planId}`, 'NOT_FOUND');
      }
      // getPlanById will throw NOT_FOUND if invalid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plan = planStore.getPlanById(planId as any);
      return reply.send({ data: plan });
    });

    /** GET /tenant/plan — get the current plan for this tenant. */
    app.get('/tenant/plan', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const state = await planStore.getTenantPlan(tenantId);
      const planDef = planStore.getPlanById(state.planId);
      return reply.send({ data: { ...state, plan: planDef } });
    });

    /** POST /tenant/plan — assign a plan to the current tenant (admin action). */
    app.post('/tenant/plan', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { planId } = validate(SetTenantPlanSchema, req.body);
      const state = await planStore.setTenantPlan(tenantId, planId);
      return reply.status(201).send({ data: state });
    });
  };
}
