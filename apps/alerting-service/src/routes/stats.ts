import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AlertStore } from '../services/alert-store.js';
import type { RuleStore } from '../services/rule-store.js';

export interface StatsRouteDeps {
  alertStore: AlertStore;
  ruleStore: RuleStore;
}

export function statsRoutes(deps: StatsRouteDeps) {
  const { alertStore, ruleStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/v1/alerts/stats — Alert statistics
    app.get('/', async (req: FastifyRequest<{ Querystring: { tenantId?: string } }>, reply: FastifyReply) => {
      const tenantId = (req.query as Record<string, string>).tenantId || 'default';
      const alertStats = alertStore.stats(tenantId);
      const ruleCount = ruleStore.count(tenantId);

      return reply.send({
        data: {
          ...alertStats,
          ruleCount,
        },
      });
    });
  };
}
