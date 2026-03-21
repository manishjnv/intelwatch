import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { EnrichmentRepository } from '../repository.js';
import { TriggerEnrichmentSchema, EnrichmentStatusQuerySchema } from '../schema.js';
import { authenticate, getUser } from '../plugins/auth.js';
import { getEnrichQueue } from '../queue.js';

export function enrichmentRoutes(repo: EnrichmentRepository) {
  return async function (app: FastifyInstance): Promise<void> {

    /** POST /api/v1/enrichment/trigger — manually trigger enrichment for an IOC */
    app.post('/trigger', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const { iocId } = TriggerEnrichmentSchema.parse(req.body);

      const ioc = await repo.findById(iocId, user.tenantId);
      if (!ioc) {
        throw new AppError(404, `IOC not found: ${iocId}`, 'NOT_FOUND');
      }

      const queue = getEnrichQueue();
      await queue.add(`enrich-${iocId}`, {
        iocId: ioc.id,
        tenantId: user.tenantId,
        iocType: ioc.iocType,
        normalizedValue: ioc.normalizedValue,
        confidence: ioc.confidence,
        severity: ioc.severity,
        existingEnrichment: ioc.enrichmentData as Record<string, unknown> | undefined,
      }, { priority: 1 });

      return reply.status(202).send({
        data: { iocId, status: 'queued', message: 'Enrichment job queued' },
      });
    });

    /** GET /api/v1/enrichment/stats — enrichment statistics */
    app.get('/stats', {
      preHandler: [authenticate],
    }, async (_req: FastifyRequest, reply: FastifyReply) => {
      const stats = await repo.getEnrichmentStats();
      return reply.send({ data: stats });
    });

    /** GET /api/v1/enrichment/pending — list IOCs pending enrichment */
    app.get('/pending', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const query = EnrichmentStatusQuerySchema.parse(req.query);
      const pending = await repo.findPendingEnrichment(query.limit);
      return reply.send({
        data: pending.map((ioc) => ({
          id: ioc.id,
          iocType: ioc.iocType,
          normalizedValue: ioc.normalizedValue,
          confidence: ioc.confidence,
          severity: ioc.severity,
          createdAt: ioc.createdAt,
        })),
        total: pending.length,
        page: query.page,
        limit: query.limit,
      });
    });
  };
}
