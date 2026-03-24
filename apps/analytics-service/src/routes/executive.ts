/**
 * @module routes/executive
 * @description Executive summary and service health endpoints.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Aggregator } from '../services/aggregator.js';
import type { AnalyticsStore } from '../services/analytics-store.js';
import type { TrendCalculator } from '../services/trend-calculator.js';

export interface ExecutiveRouteDeps {
  aggregator: Aggregator;
  store: AnalyticsStore;
  trends: TrendCalculator;
}

export function executiveRoutes(deps: ExecutiveRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { aggregator, store, trends } = deps;

    /** GET /api/v1/analytics/executive — executive summary with risk posture */
    app.get('/executive', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getExecutiveSummary(tenantId);
      return reply.send({ data });
    });

    /** GET /api/v1/analytics/stats — service-level analytics stats */
    app.get('/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
      const health = await aggregator.getServiceHealth();
      const healthyCount = health.filter(h => h.status === 'healthy').length;
      return reply.send({
        data: {
          cacheEntries: store.size(),
          trendMetrics: trends.getMetrics().length,
          trendSnapshots: trends.totalSnapshots(),
          servicesMonitored: health.length,
          servicesHealthy: healthyCount,
          servicesUnhealthy: health.length - healthyCount,
        },
      });
    });

    /** GET /api/v1/analytics/service-health — health of all ETIP services */
    app.get('/service-health', async (_req: FastifyRequest, reply: FastifyReply) => {
      const cacheKey = 'service-health';
      const data = await store.getOrSet(cacheKey, 60, () => aggregator.getServiceHealth());
      return reply.send({ data });
    });
  };
}

function extractTenantId(req: FastifyRequest): string {
  const user = (req as unknown as Record<string, unknown>).user as { tenantId?: string } | undefined;
  return user?.tenantId ?? 'default';
}
