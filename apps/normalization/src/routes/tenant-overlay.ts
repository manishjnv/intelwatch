/**
 * @module TenantOverlayRoutes
 * @description REST routes for tenant IOC overlay — global IOC view with per-tenant customizations.
 * All routes gated by TI_GLOBAL_PROCESSING_ENABLED feature flag.
 * DECISION-029 Phase B2.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import { TenantOverlayService } from '../services/tenant-overlay-service.js';
import { authenticate, getUser, rbac } from '../plugins/auth.js';

const ListQuerySchema = z.object({
  iocType: z.string().optional(),
  severity: z.string().optional(),
  minConfidence: z.coerce.number().min(0).max(100).optional(),
  lifecycle: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const IocIdParamsSchema = z.object({ iocId: z.string().uuid() });

const SetOverlayBodySchema = z.object({
  customSeverity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  customConfidence: z.number().min(0).max(100).optional(),
  customLifecycle: z.string().optional(),
  customTags: z.array(z.string()).optional(),
  customNotes: z.string().optional(),
});

const BulkOverlayBodySchema = z.object({
  globalIocIds: z.array(z.string().uuid()).min(1).max(100),
  overlay: SetOverlayBodySchema,
});

function isGlobalEnabled(): boolean {
  return process.env['TI_GLOBAL_PROCESSING_ENABLED'] === 'true';
}

function requireGlobalEnabled(): void {
  if (!isGlobalEnabled()) {
    throw new AppError(503, 'Global processing is not enabled', 'GLOBAL_PROCESSING_DISABLED');
  }
}

export function tenantOverlayRoutes(service: TenantOverlayService) {
  return async function (app: FastifyInstance): Promise<void> {

    /** GET /global-iocs — Tenant's merged IOC view */
    app.get('/', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      const user = getUser(req);
      const query = ListQuerySchema.parse(req.query);
      const data = await service.getIocsForTenant(user.tenantId, query);
      return reply.send({ data });
    });

    /** GET /global-iocs/stats — Overlay stats for tenant */
    app.get('/stats', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      const user = getUser(req);
      const stats = await service.getOverlayStats(user.tenantId);
      return reply.send({ data: stats });
    });

    /** GET /global-iocs/:iocId — Single IOC detail with overlay */
    app.get('/:iocId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      const user = getUser(req);
      const { iocId } = IocIdParamsSchema.parse(req.params);
      const ioc = await service.getIocDetail(user.tenantId, iocId);
      if (!ioc) throw new AppError(404, `Global IOC not found: ${iocId}`, 'NOT_FOUND');
      return reply.send({ data: ioc });
    });

    /** PUT /global-iocs/:iocId/overlay — Set/update tenant overlay */
    app.put('/:iocId/overlay', {
      preHandler: [authenticate, rbac('ioc:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      const user = getUser(req);
      const { iocId } = IocIdParamsSchema.parse(req.params);
      const body = SetOverlayBodySchema.parse(req.body);
      const result = await service.setOverlay(user.tenantId, iocId, {
        ...body,
        overriddenBy: user.sub,
      });
      return reply.send({ data: result });
    });

    /** DELETE /global-iocs/:iocId/overlay — Remove tenant overlay */
    app.delete('/:iocId/overlay', {
      preHandler: [authenticate, rbac('ioc:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      const user = getUser(req);
      const { iocId } = IocIdParamsSchema.parse(req.params);
      await service.removeOverlay(user.tenantId, iocId);
      return reply.status(204).send();
    });

    /** POST /global-iocs/bulk-overlay — Bulk set overlay */
    app.post('/bulk-overlay', {
      preHandler: [authenticate, rbac('ioc:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      const user = getUser(req);
      const body = BulkOverlayBodySchema.parse(req.body);
      const count = await service.bulkSetOverlay(user.tenantId, body.globalIocIds, {
        ...body.overlay,
        overriddenBy: user.sub,
      });
      return reply.send({ data: { count } });
    });
  };
}
