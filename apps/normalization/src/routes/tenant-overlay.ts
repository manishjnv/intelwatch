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
import { SeverityVotingService } from '../services/severity-voting.js';
import { CommunityFpService } from '../services/community-fp.js';
import { calculateCorroborationScore, type CorroborationSource } from '@etip/shared-normalization';
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

const FpReportBodySchema = z.object({
  reason: z.enum(['benign_service', 'internal_infra', 'test_data', 'other']),
  notes: z.string().optional(),
});

const FpCandidatesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
});

export function tenantOverlayRoutes(service: TenantOverlayService, prisma?: any) {
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

    // ── Community FP + Corroboration Routes (Phase G) ──────────

    const fpService = prisma ? new CommunityFpService(prisma) : null;
    const votingService = prisma ? new SeverityVotingService(prisma) : null;

    /** POST /global-iocs/:iocId/report-fp — Report false positive */
    app.post('/:iocId/report-fp', {
      preHandler: [authenticate, rbac('ioc:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      if (!fpService) throw new AppError(503, 'FP service unavailable', 'SERVICE_UNAVAILABLE');
      const user = getUser(req);
      const { iocId } = IocIdParamsSchema.parse(req.params);
      const body = FpReportBodySchema.parse(req.body);
      try {
        const result = await fpService.reportFalsePositive(iocId, {
          tenantId: user.tenantId,
          reason: body.reason,
          notes: body.notes,
          reportedBy: user.sub,
        });
        return reply.status(201).send({ data: result });
      } catch (err: any) {
        if (err.statusCode === 409) throw new AppError(409, err.message, 'DUPLICATE_FP_REPORT');
        throw err;
      }
    });

    /** DELETE /global-iocs/:iocId/report-fp — Withdraw FP report */
    app.delete('/:iocId/report-fp', {
      preHandler: [authenticate, rbac('ioc:write')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      if (!fpService) throw new AppError(503, 'FP service unavailable', 'SERVICE_UNAVAILABLE');
      const user = getUser(req);
      const { iocId } = IocIdParamsSchema.parse(req.params);
      await fpService.withdrawFpReport(iocId, user.tenantId);
      return reply.status(204).send();
    });

    /** GET /global-iocs/:iocId/fp-summary — FP summary */
    app.get('/:iocId/fp-summary', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      if (!fpService) throw new AppError(503, 'FP service unavailable', 'SERVICE_UNAVAILABLE');
      const { iocId } = IocIdParamsSchema.parse(req.params);
      const data = await fpService.getFpSummary(iocId);
      return reply.send({ data });
    });

    /** GET /global-iocs/:iocId/corroboration — Corroboration detail */
    app.get('/:iocId/corroboration', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      const { iocId } = IocIdParamsSchema.parse(req.params);
      const ioc = await service.getIocDetail(getUser(req).tenantId, iocId);
      if (!ioc) throw new AppError(404, `IOC not found: ${iocId}`, 'NOT_FOUND');

      const sightingSources: string[] = (ioc as any).sightingSources ?? [];
      const sources: CorroborationSource[] = sightingSources.map((feedId: string) => ({
        feedId,
        feedName: feedId,
        admiraltySource: 'C',
        admiraltyCred: 3,
        feedReliability: 70,
        firstSeenByFeed: new Date((ioc as any).firstSeen),
        lastSeenByFeed: new Date((ioc as any).lastSeen),
      }));
      const result = calculateCorroborationScore(sources);
      return reply.send({ data: { ...result, sources } });
    });

    /** GET /global-iocs/:iocId/severity-votes — Vote breakdown */
    app.get('/:iocId/severity-votes', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      if (!votingService) throw new AppError(503, 'Voting service unavailable', 'SERVICE_UNAVAILABLE');
      const { iocId } = IocIdParamsSchema.parse(req.params);
      const data = await votingService.getVoteSummary(iocId);
      return reply.send({ data });
    });

    /** GET /global-iocs/fp-candidates — Admin: top FP candidates */
    app.get('/fp-candidates', {
      preHandler: [authenticate, rbac('admin:read')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      requireGlobalEnabled();
      if (!fpService) throw new AppError(503, 'FP service unavailable', 'SERVICE_UNAVAILABLE');
      const { limit } = FpCandidatesQuerySchema.parse(req.query);
      const data = await fpService.getTopFpCandidates(limit);
      return reply.send({ data });
    });
  };
}
