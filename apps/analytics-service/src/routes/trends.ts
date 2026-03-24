/**
 * @module routes/trends
 * @description Time-series trend endpoints.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import type { TrendCalculator } from '../services/trend-calculator.js';

export interface TrendRouteDeps {
  trends: TrendCalculator;
}

const PeriodQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('7d'),
});

const MetricParamsSchema = z.object({ metric: z.string().min(1) });

function periodToDays(period: string): number {
  switch (period) {
    case '30d': return 30;
    case '90d': return 90;
    default: return 7;
  }
}

export function trendRoutes(deps: TrendRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { trends } = deps;

    /** GET /api/v1/analytics/trends — all metric trends */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const { period } = PeriodQuerySchema.parse(req.query);
      const days = periodToDays(period);
      const data = trends.getAllTrends(days);
      return reply.send({ data, period, metrics: trends.getMetrics() });
    });

    /** GET /api/v1/analytics/trends/:metric — specific metric trend */
    app.get('/:metric', async (req: FastifyRequest, reply: FastifyReply) => {
      const { metric } = MetricParamsSchema.parse(req.params);
      const { period } = PeriodQuerySchema.parse(req.query);
      const days = periodToDays(period);
      const trend = trends.getTrend(metric, days);
      if (!trend) throw new AppError(404, `No trend data for metric '${metric}'`, 'TREND_NOT_FOUND');
      return reply.send({ data: trend });
    });
  };
}
