import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { AlertStore } from '../services/alert-store.js';
import type { AlertHistory } from '../services/alert-history.js';
import {
  ListAlertsQuerySchema,
  SuppressAlertSchema,
  BulkAlertIdsSchema,
  type ListAlertsQuery,
  type SuppressAlertDto,
  type BulkAlertIdsDto,
} from '../schemas/alert.js';
import { validate } from '../utils/validate.js';
import { requestTenant } from '../plugins/tenant-guard.js';

export interface AlertRouteDeps {
  alertStore: AlertStore;
  alertHistory?: AlertHistory;
}

export function alertRoutes(deps: AlertRouteDeps) {
  const { alertStore, alertHistory } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/v1/alerts — List alerts
    app.get('/', async (req: FastifyRequest<{ Querystring: ListAlertsQuery }>, reply: FastifyReply) => {
      const query = validate(ListAlertsQuerySchema, req.query);
      const result = await alertStore.list(query.tenantId, {
        severity: query.severity,
        status: query.status,
        ruleId: query.ruleId,
        page: query.page,
        limit: query.limit,
      });

      return reply.send({
        data: result.data,
        meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      });
    });

    // GET /api/v1/alerts/:id — Get alert detail
    app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const alert = await alertStore.getById(req.params.id, requestTenant(req));
      if (!alert) throw new AppError(404, `Alert not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.send({ data: alert });
    });

    // POST /api/v1/alerts/:id/acknowledge — Acknowledge alert
    app.post(
      '/:id/acknowledge',
      async (req: FastifyRequest<{ Params: { id: string }; Body: { userId?: string } }>, reply: FastifyReply) => {
        const userId = req.body?.userId ?? 'system';
        const tenantId = requestTenant(req);
        const before = await alertStore.getById(req.params.id, tenantId);
        if (!before) throw new AppError(404, `Alert not found: ${req.params.id}`, 'NOT_FOUND');
        const alert = await alertStore.acknowledge(req.params.id, userId, tenantId);
        await alertHistory?.record({
          tenantId: alert.tenantId, alertId: alert.id, action: 'acknowledge', fromStatus: before.status,
          toStatus: 'acknowledged', actor: userId,
        });
        return reply.send({ data: alert });
      },
    );

    // POST /api/v1/alerts/:id/resolve — Resolve alert
    app.post(
      '/:id/resolve',
      async (req: FastifyRequest<{ Params: { id: string }; Body: { userId?: string } }>, reply: FastifyReply) => {
        const userId = req.body?.userId ?? 'system';
        const tenantId = requestTenant(req);
        const before = await alertStore.getById(req.params.id, tenantId);
        if (!before) throw new AppError(404, `Alert not found: ${req.params.id}`, 'NOT_FOUND');
        const alert = await alertStore.resolve(req.params.id, userId, tenantId);
        await alertHistory?.record({
          tenantId: alert.tenantId, alertId: alert.id, action: 'resolve', fromStatus: before.status,
          toStatus: 'resolved', actor: userId,
        });
        return reply.send({ data: alert });
      },
    );

    // POST /api/v1/alerts/:id/suppress — Suppress alert with duration
    app.post(
      '/:id/suppress',
      async (req: FastifyRequest<{ Params: { id: string }; Body: SuppressAlertDto }>, reply: FastifyReply) => {
        const body = validate(SuppressAlertSchema, req.body);
        const tenantId = requestTenant(req);
        const before = await alertStore.getById(req.params.id, tenantId);
        if (!before) throw new AppError(404, `Alert not found: ${req.params.id}`, 'NOT_FOUND');
        const alert = await alertStore.suppress(req.params.id, body.durationMinutes, body.reason, tenantId);
        await alertHistory?.record({
          tenantId: alert.tenantId, alertId: alert.id, action: 'suppress', fromStatus: before.status,
          toStatus: 'suppressed', actor: 'system', reason: body.reason,
        });
        return reply.send({ data: alert });
      },
    );

    // POST /api/v1/alerts/:id/escalate — Manual escalation
    app.post(
      '/:id/escalate',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const tenantId = requestTenant(req);
        const before = await alertStore.getById(req.params.id, tenantId);
        if (!before) throw new AppError(404, `Alert not found: ${req.params.id}`, 'NOT_FOUND');
        const alert = await alertStore.escalate(req.params.id, tenantId);
        await alertHistory?.record({
          tenantId: alert.tenantId, alertId: alert.id, action: 'manual_escalate', fromStatus: before.status,
          toStatus: 'escalated', actor: 'system',
        });
        return reply.send({ data: alert });
      },
    );

    // GET /api/v1/alerts/:id/history — Get alert timeline
    app.get(
      '/:id/history',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const alert = await alertStore.getById(req.params.id, requestTenant(req));
        if (!alert) throw new AppError(404, `Alert not found: ${req.params.id}`, 'NOT_FOUND');
        const timeline = (await alertHistory?.getTimeline(req.params.id)) ?? [];
        return reply.send({ data: timeline });
      },
    );

    // POST /api/v1/alerts/bulk-acknowledge — Bulk ack
    app.post(
      '/bulk-acknowledge',
      async (req: FastifyRequest<{ Body: BulkAlertIdsDto }>, reply: FastifyReply) => {
        const body = validate(BulkAlertIdsSchema, req.body);
        const userId = (req.body as Record<string, unknown>).userId as string | undefined ?? 'system';
        const result = await alertStore.bulkAcknowledge(body.ids, userId, requestTenant(req));
        return reply.send({ data: result });
      },
    );

    // POST /api/v1/alerts/bulk-resolve — Bulk resolve
    app.post(
      '/bulk-resolve',
      async (req: FastifyRequest<{ Body: BulkAlertIdsDto }>, reply: FastifyReply) => {
        const body = validate(BulkAlertIdsSchema, req.body);
        const userId = (req.body as Record<string, unknown>).userId as string | undefined ?? 'system';
        const result = await alertStore.bulkResolve(body.ids, userId, requestTenant(req));
        return reply.send({ data: result });
      },
    );

    // GET /api/v1/alerts/search — Full-text search across alerts
    app.get(
      '/search',
      async (req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) => {
        const tenantId = req.query.tenantId || 'default';
        const q = req.query.q || '';
        if (!q) throw new AppError(400, 'Query parameter "q" is required', 'VALIDATION_ERROR');
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '20', 10);

        const result = await alertStore.search(tenantId, q, { page, limit });
        return reply.send({
          data: result.data,
          meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages, query: q },
        });
      },
    );
  };
}
