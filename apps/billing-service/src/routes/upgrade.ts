import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';
import { UpgradePlanSchema, DowngradePlanSchema, UpgradePreviewQuerySchema } from '../schemas/billing.js';
import type { UpgradeFlow } from '../services/upgrade-flow.js';
import type { PlanId } from '../schemas/billing.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate<S extends ZodType<any, any, any>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export interface UpgradeRouteDeps {
  upgradeFlow: UpgradeFlow;
}

/** Upgrade and downgrade plan routes. */
export function upgradeRoutes(deps: UpgradeRouteDeps) {
  const { upgradeFlow } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /upgrade/preview?targetPlan=pro — preview upgrade cost and proration. */
    app.get('/upgrade/preview', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const query = validate(UpgradePreviewQuerySchema, req.query);
      const preview = await upgradeFlow.previewUpgrade(tenantId, query.targetPlan);
      return reply.send({ data: preview });
    });

    /** POST /upgrade — execute a plan upgrade. */
    app.post('/upgrade', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(UpgradePlanSchema, req.body);
      const result = await upgradeFlow.upgradePlan(tenantId, input.planId as PlanId, {
        razorpaySubscriptionId: input.razorpaySubscriptionId,
      });
      return reply.send({ data: result });
    });

    /** POST /downgrade — schedule a plan downgrade for end of billing period. */
    app.post('/downgrade', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(DowngradePlanSchema, req.body);
      const result = await upgradeFlow.downgradePlan(tenantId, input.planId as PlanId);
      return reply.send({ data: result });
    });
  };
}
