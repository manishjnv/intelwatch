import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { AlertStore } from '../services/alert-store.js';
import type { AlertHistory } from '../services/alert-history.js';
import type { EscalationDispatcher } from '../services/escalation-dispatcher.js';
import {
  ListAlertsQuerySchema,
  SuppressAlertSchema,
  BulkAlertIdsSchema,
  type ListAlertsQuery,
  type SuppressAlertDto,
  type BulkAlertIdsDto,
} from '../schemas/alert.js';
import { validate } from '../utils/validate.js';

export interface AlertRouteDeps {
  alertStore: AlertStore;
  alertHistory?: AlertHistory;
  escalationDispatcher?: EscalationDispatcher;
}

export function alertRoutes(deps: AlertRouteDeps) {
  const { alertStore, alertHistory, escalationDispatcher } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/v1/alerts — List alerts
    app.get('/', async (req: FastifyRequest<{ Querystring: ListAlertsQuery }>, reply: FastifyReply) => {
      const query = validate(ListAlertsQuerySchema, req.query);
      const result = alertStore.list(query.tenantId, {
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
      const alert = alertStore.getById(req.params.id);
      if (!alert) throw new AppError(404, `Alert not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.send({ data: alert });
    });

    // POST /api/v1/alerts/:id/acknowledge — Acknowledge alert
    app.post(
      '/:id/acknowledge',
      async (req: FastifyRequest<{ Params: { id: string }; Body: { userId?: string } }>, reply: FastifyReply) => {
        const userId = req.body?.userId ?? 'system';
        const prevStatus = alertStore.getById(req.params.id)?.status ?? 'open';
        const alert = alertStore.acknowledge(req.params.id, userId);
        alertHistory?.record({
          alertId: alert.id, action: 'acknowledge', fromStatus: prevStatus,
          toStatus: 'acknowledged', actor: userId,
        });
        escalationDispatcher?.untrack(alert.id);
        return reply.send({ data: alert });
      },
    );

    // POST /api/v1/alerts/:id/resolve — Resolve alert
    app.post(
      '/:id/resolve',
      async (req: FastifyRequest<{ Params: { id: string }; Body: { userId?: string } }>, reply: FastifyReply) => {
        const userId = req.body?.userId ?? 'system';
        const prevStatus = alertStore.getById(req.params.id)?.status ?? 'open';
        const alert = alertStore.resolve(req.params.id, userId);
        alertHistory?.record({
          alertId: alert.id, action: 'resolve', fromStatus: prevStatus,
          toStatus: 'resolved', actor: userId,
        });
        escalationDispatcher?.untrack(alert.id);
        return reply.send({ data: alert });
      },
    );

    // POST /api/v1/alerts/:id/suppress — Suppress alert with duration
    app.post(
      '/:id/suppress',
      async (req: FastifyRequest<{ Params: { id: string }; Body: SuppressAlertDto }>, reply: FastifyReply) => {
        const body = validate(SuppressAlertSchema, req.body);
        const prevStatus = alertStore.getById(req.params.id)?.status ?? 'open';
        const alert = alertStore.suppress(req.params.id, body.durationMinutes, body.reason);
        alertHistory?.record({
          alertId: alert.id, action: 'suppress', fromStatus: prevStatus,
          toStatus: 'suppressed', actor: 'system', reason: body.reason,
        });
        return reply.send({ data: alert });
      },
    );

    // POST /api/v1/alerts/:id/escalate — Manual escalation
    app.post(
      '/:id/escalate',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const prevStatus = alertStore.getById(req.params.id)?.status ?? 'open';
        const alert = alertStore.escalate(req.params.id);
        alertHistory?.record({
          alertId: alert.id, action: 'manual_escalate', fromStatus: prevStatus,
          toStatus: 'escalated', actor: 'system',
        });
        return reply.send({ data: alert });
      },
    );

    // GET /api/v1/alerts/:id/history — Get alert timeline
    app.get(
      '/:id/history',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const alert = alertStore.getById(req.params.id);
        if (!alert) throw new AppError(404, `Alert not found: ${req.params.id}`, 'NOT_FOUND');
        const timeline = alertHistory?.getTimeline(req.params.id) ?? [];
        return reply.send({ data: timeline });
      },
    );

    // POST /api/v1/alerts/bulk-acknowledge — Bulk ack
    app.post(
      '/bulk-acknowledge',
      async (req: FastifyRequest<{ Body: BulkAlertIdsDto }>, reply: FastifyReply) => {
        const body = validate(BulkAlertIdsSchema, req.body);
        const userId = (req.body as Record<string, unknown>).userId as string | undefined ?? 'system';
        const result = alertStore.bulkAcknowledge(body.ids, userId);
        return reply.send({ data: result });
      },
    );

    // POST /api/v1/alerts/bulk-resolve — Bulk resolve
    app.post(
      '/bulk-resolve',
      async (req: FastifyRequest<{ Body: BulkAlertIdsDto }>, reply: FastifyReply) => {
        const body = validate(BulkAlertIdsSchema, req.body);
        const userId = (req.body as Record<string, unknown>).userId as string | undefined ?? 'system';
        const result = alertStore.bulkResolve(body.ids, userId);
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

        const result = alertStore.search(tenantId, q, { page, limit });
        return reply.send({
          data: result.data,
          meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages, query: q },
        });
      },
    );
  };
}
