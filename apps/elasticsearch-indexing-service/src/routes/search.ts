import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { SearchQueryParamsSchema } from '../schemas.js';
import type { IocSearchService } from '../search-service.js';

export interface SearchRouteDeps {
  searchService: IocSearchService;
}

/** IOC search routes — GET /api/v1/search/iocs and GET /api/v1/search/iocs/stats */
export function searchRoutes(deps: SearchRouteDeps) {
  const { searchService } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /**
     * GET /iocs — full-text + faceted search.
     * Query params: tenantId (required), q, type, severity, tlp, enriched, page, limit
     */
    app.get('/iocs', async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = SearchQueryParamsSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(
          400,
          'Invalid query parameters',
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        );
      }

      const { tenantId, ...searchParams } = parsed.data;
      const result = await searchService.search(tenantId, searchParams);
      return reply.send({ data: result });
    });

    /**
     * GET /iocs/stats — index statistics for a tenant.
     * Query params: tenantId (required)
     */
    app.get('/iocs/stats', async (req: FastifyRequest, reply: FastifyReply) => {
      const query = req.query as Record<string, unknown>;
      if (!query.tenantId || typeof query.tenantId !== 'string') {
        throw new AppError(400, 'tenantId is required', 'VALIDATION_ERROR');
      }
      const stats = await searchService.getIndexStats(query.tenantId);
      return reply.send({ data: stats });
    });
  };
}
