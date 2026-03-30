/**
 * @module RetentionRoutes
 * @description I-20 — Data retention enforcement routes.
 * Admin endpoints: super_admin. Tenant endpoint: tenant_admin.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RetentionService } from '../services/retention-service.js';

export interface RetentionRouteDeps {
  retentionService: RetentionService;
}

/** Create retention route plugin. */
export function retentionRoutes(deps: RetentionRouteDeps) {
  const { retentionService } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /admin/retention/status — Per-tenant retention stats (super_admin). */
    app.get(
      '/admin/retention/status',
      async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await retentionService.getAdminStatus();
        return reply.send({ data: result });
      },
    );

    /** GET /admin/retention/history — Past retention job runs (super_admin). */
    app.get(
      '/admin/retention/history',
      async (_req: FastifyRequest, reply: FastifyReply) => {
        const history = retentionService.getHistory();
        return reply.send({ data: history, total: history.length });
      },
    );

    /** GET /billing/retention — Own org's retention policy (tenant_admin). */
    app.get(
      '/billing/retention',
      async (req: FastifyRequest, reply: FastifyReply) => {
        const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
        const result = await retentionService.getTenantRetentionInfo(tenantId);
        return reply.send({ data: result });
      },
    );
  };
}
