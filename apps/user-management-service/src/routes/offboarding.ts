/**
 * @module OffboardingRoutes
 * @description I-19 — Org offboarding lifecycle routes.
 * All routes require super_admin role (enforced at API gateway level).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { OffboardingService } from '../services/offboarding-service.js';
import type { AuditLogger } from '../services/audit-logger.js';

export interface OffboardingRouteDeps {
  offboardingService: OffboardingService;
  auditLogger: AuditLogger;
}

/** Create offboarding route plugin. */
export function offboardingRoutes(deps: OffboardingRouteDeps) {
  const { offboardingService } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** POST /admin/tenants/:tenantId/offboard — Initiate offboarding. */
    app.post(
      '/admin/tenants/:tenantId/offboard',
      async (req: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
        const actorEmail = (req.headers['x-user-email'] as string) || 'system';
        const actorTenantId = (req.headers['x-tenant-id'] as string) || 'default';
        const result = await offboardingService.initiateOffboarding(
          req.params.tenantId, actorEmail, actorTenantId,
        );
        return reply.status(200).send({ data: result });
      },
    );

    /** POST /admin/tenants/:tenantId/cancel-offboard — Cancel offboarding. */
    app.post(
      '/admin/tenants/:tenantId/cancel-offboard',
      async (req: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
        const actorEmail = (req.headers['x-user-email'] as string) || 'system';
        const result = await offboardingService.cancelOffboarding(req.params.tenantId, actorEmail);
        return reply.status(200).send({ data: result });
      },
    );

    /** GET /admin/tenants/:tenantId/offboard-status — Check offboarding progress. */
    app.get(
      '/admin/tenants/:tenantId/offboard-status',
      async (req: FastifyRequest<{ Params: { tenantId: string } }>, reply: FastifyReply) => {
        const result = await offboardingService.getStatus(req.params.tenantId);
        return reply.send({ data: result });
      },
    );

    /** GET /admin/offboarding — List all tenants in offboarding pipeline. */
    app.get(
      '/admin/offboarding',
      async (_req: FastifyRequest, reply: FastifyReply) => {
        const result = await offboardingService.listPipeline();
        return reply.send({ data: result, total: result.length });
      },
    );
  };
}
