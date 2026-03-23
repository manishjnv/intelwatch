import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { AlertRulesStore } from '../services/alert-rules-store.js';
import type { ScheduledMaintenanceStore } from '../services/scheduled-maintenance-store.js';
import { isValidCron } from '../services/scheduled-maintenance-store.js';
import type { TenantAnalyticsStore } from '../services/tenant-analytics-store.js';
import type { AdminActivityStore } from '../services/admin-activity-store.js';
import type { TenantStore } from '../services/tenant-store.js';
import type { AnalyticsPeriod } from '../services/tenant-analytics-store.js';
import {
  CreateAlertRuleSchema,
  UpdateAlertRuleSchema,
  CreateScheduledMaintenanceSchema,
  LogActivitySchema,
} from '../schemas/admin.js';
import { validate } from '../utils/validate.js';

export interface P0RouteDeps {
  alertRulesStore: AlertRulesStore;
  scheduledMaintenanceStore: ScheduledMaintenanceStore;
  tenantAnalyticsStore: TenantAnalyticsStore;
  adminActivityStore: AdminActivityStore;
  tenantStore: TenantStore;
}

/** P0 improvement routes: alert rules (#7), scheduled maintenance (#8), tenant analytics (#9), admin activity (#10). */
export function p0Routes(deps: P0RouteDeps) {
  const { alertRulesStore, scheduledMaintenanceStore, tenantAnalyticsStore, adminActivityStore, tenantStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // ─── P0 #7: Alert Rules ──────────────────────────────────────

    /** GET /alert-rules — list all alert rules. */
    app.get('/alert-rules', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ data: alertRulesStore.list() });
    });

    /** POST /alert-rules — create a new alert rule. */
    app.post('/alert-rules', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = validate(CreateAlertRuleSchema, req.body);
      const rule = alertRulesStore.create(body);
      return reply.status(201).send({ data: rule });
    });

    /** PUT /alert-rules/:id — update an alert rule. */
    app.put(
      '/alert-rules/:id',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const body = validate(UpdateAlertRuleSchema, req.body);
        const updated = alertRulesStore.update(req.params.id, body);
        if (!updated) throw new AppError(404, `Alert rule not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: updated });
      },
    );

    /** DELETE /alert-rules/:id — delete an alert rule. */
    app.delete(
      '/alert-rules/:id',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const deleted = alertRulesStore.delete(req.params.id);
        if (!deleted) throw new AppError(404, `Alert rule not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.status(204).send();
      },
    );

    // ─── P0 #8: Scheduled Maintenance ───────────────────────────

    /** GET /maintenance/scheduled — list scheduled maintenance jobs. */
    app.get('/maintenance/scheduled', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ data: scheduledMaintenanceStore.list() });
    });

    /** POST /maintenance/scheduled — create a scheduled maintenance job. */
    app.post('/maintenance/scheduled', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = validate(CreateScheduledMaintenanceSchema, req.body);
      if (!isValidCron(body.cronExpr)) {
        throw new AppError(400, `Invalid cron expression: ${body.cronExpr}`, 'VALIDATION_ERROR');
      }
      const job = scheduledMaintenanceStore.create(body);
      return reply.status(201).send({ data: job });
    });

    // ─── P0 #9: Tenant Analytics ─────────────────────────────────

    /** GET /tenants/:id/analytics — per-tenant usage analytics. */
    app.get(
      '/tenants/:id/analytics',
      async (req: FastifyRequest<{ Params: { id: string }; Querystring: { period?: string } }>, reply: FastifyReply) => {
        const tenant = tenantStore.getById(req.params.id);
        if (!tenant) throw new AppError(404, `Tenant not found: ${req.params.id}`, 'NOT_FOUND');

        // Register tenant in analytics store so analytics can be returned
        tenantAnalyticsStore.registerTenant(req.params.id);

        const validPeriods: AnalyticsPeriod[] = ['7d', '30d', '90d'];
        const period = validPeriods.includes(req.query.period as AnalyticsPeriod)
          ? (req.query.period as AnalyticsPeriod)
          : '30d';

        const analytics = tenantAnalyticsStore.getAnalytics(req.params.id, period);
        return reply.send({ data: analytics });
      },
    );

    // ─── P0 #10: Admin Activity Log ─────────────────────────────

    /** GET /activity — list admin activity log. */
    app.get(
      '/activity',
      async (req: FastifyRequest<{ Querystring: { adminId?: string; page?: string; limit?: string } }>, reply: FastifyReply) => {
        const result = adminActivityStore.list({
          adminId: req.query.adminId,
          page: req.query.page ? parseInt(req.query.page, 10) : 1,
          limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
        });
        return reply.send({ data: result });
      },
    );

    /** POST /activity — log an admin action (called by other routes / internal). */
    app.post('/activity', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = validate(LogActivitySchema, req.body);
      const activity = adminActivityStore.log(body);
      return reply.status(201).send({ data: activity });
    });
  };
}
