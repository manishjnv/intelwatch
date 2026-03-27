/**
 * @module routes/dashboard
 * @description Dashboard widget endpoints — returns pre-aggregated data.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import type { Aggregator } from '../services/aggregator.js';
import { getWidget, WIDGET_REGISTRY } from '../services/widget-registry.js';

export interface DashboardRouteDeps {
  aggregator: Aggregator;
}

const WidgetParamsSchema = z.object({ widgetId: z.string().min(1) });
const CategoryQuerySchema = z.object({ category: z.enum(['overview', 'threats', 'operations', 'performance']).optional() });

export function dashboardRoutes(deps: DashboardRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { aggregator } = deps;

    /** GET /api/v1/analytics/dashboard — all widgets in one call */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getDashboard(tenantId);
      return reply.send({ data });
    });

    /** GET /api/v1/analytics/widgets — list widget definitions */
    app.get('/widgets', async (req: FastifyRequest, reply: FastifyReply) => {
      const query = CategoryQuerySchema.parse(req.query);
      const widgets = query.category
        ? WIDGET_REGISTRY.filter(w => w.category === query.category)
        : WIDGET_REGISTRY;
      return reply.send({ data: widgets, total: widgets.length });
    });

    /** GET /api/v1/analytics/widgets/:widgetId — single widget data */
    app.get('/widgets/:widgetId', async (req: FastifyRequest, reply: FastifyReply) => {
      const { widgetId } = WidgetParamsSchema.parse(req.params);
      const def = getWidget(widgetId);
      if (!def) throw new AppError(404, `Widget '${widgetId}' not found`, 'WIDGET_NOT_FOUND');

      const tenantId = extractTenantId(req);
      const dashboard = await aggregator.getDashboard(tenantId);
      const widgetData = dashboard.widgets[widgetId];
      return reply.send({ data: widgetData ?? { id: widgetId, label: def.label, value: null } });
    });

    /** GET /api/v1/analytics/top-iocs — highest severity IOCs */
    app.get('/top-iocs', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getTopIocs(tenantId);
      return reply.send({ data });
    });

    /** GET /api/v1/analytics/top-actors — most active threat actors */
    app.get('/top-actors', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getTopActors(tenantId);
      return reply.send({ data });
    });

    /** GET /api/v1/analytics/top-vulns — highest-risk vulnerabilities */
    app.get('/top-vulns', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getTopVulns(tenantId);
      return reply.send({ data });
    });

    /** GET /api/v1/analytics/feed-performance — feed ingestion metrics */
    app.get('/feed-performance', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getFeedPerformance(tenantId);
      return reply.send({ data });
    });

    /** GET /api/v1/analytics/alert-summary — alert status breakdown */
    app.get('/alert-summary', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getAlertSummary(tenantId);
      return reply.send({ data });
    });

    /** GET /api/v1/analytics/enrichment-quality — confidence tier breakdown */
    app.get('/enrichment-quality', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getEnrichmentQuality(tenantId);
      return reply.send({ data });
    });

    /** GET /api/v1/analytics/distributions — IOC type/severity/confidence/lifecycle */
    app.get('/distributions', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getDistributions(tenantId);
      return reply.send({ data });
    });

    /** GET /api/v1/analytics/cost-tracking — AI cost summary + trend */
    app.get('/cost-tracking', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = extractTenantId(req);
      const data = await aggregator.getCostTracking(tenantId);
      return reply.send({ data });
    });
  };
}

function extractTenantId(req: FastifyRequest): string {
  const user = (req as unknown as Record<string, unknown>).user as { tenantId?: string } | undefined;
  return user?.tenantId ?? 'default';
}
