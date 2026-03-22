import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { EnrichmentCostTracker } from '../cost-tracker.js';
import { CostIOCParamsSchema } from '../schema.js';
import { authenticate, getUser } from '../plugins/auth.js';

/**
 * Cost transparency API — Differentiator A.
 * "301 IOCs enriched for $0.12" — no competitor exposes enrichment cost.
 */
export function costRoutes(costTracker: EnrichmentCostTracker, dailyBudgetUsd: number) {
  return async function (app: FastifyInstance): Promise<void> {

    /** GET /api/v1/enrichment/cost/stats — aggregate cost transparency */
    app.get('/stats', {
      preHandler: [authenticate],
    }, async (_req: FastifyRequest, reply: FastifyReply) => {
      const stats = costTracker.getAggregateStats();
      return reply.send({ data: stats });
    });

    /** GET /api/v1/enrichment/cost/ioc/:iocId — per-IOC cost breakdown */
    app.get('/ioc/:iocId', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const { iocId } = CostIOCParamsSchema.parse((req as unknown as { params: unknown }).params);
      const cost = costTracker.getIOCCost(iocId);

      if (cost.providerCount === 0) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `No cost data for IOC: ${iocId}` },
        });
      }

      return reply.send({ data: cost });
    });

    /** GET /api/v1/enrichment/cost/budget — tenant budget status */
    app.get('/budget', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const alert = costTracker.checkBudgetAlert(user.tenantId, dailyBudgetUsd);
      return reply.send({ data: alert });
    });
  };
}
