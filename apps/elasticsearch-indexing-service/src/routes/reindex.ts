import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { ReindexBodySchema } from '../schemas.js';
import type { IocIndexer } from '../ioc-indexer.js';

export interface ReindexRouteDeps {
  indexer: IocIndexer;
}

/** Re-index route — POST /api/v1/search/reindex */
export function reindexRoutes(deps: ReindexRouteDeps) {
  const { indexer } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /**
     * POST /reindex — rebuild the tenant IOC index from a provided list.
     * Body: { tenantId: string, iocs: IocDocument[] }
     * Returns 202 Accepted with indexed/failed counts.
     */
    app.post('/reindex', async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = ReindexBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'Invalid reindex request body',
          'VALIDATION_ERROR',
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        );
      }

      const { tenantId, iocs } = parsed.data;
      const result = await indexer.reindexTenant(tenantId, iocs);

      return reply.status(202).send({
        data: {
          status: 'accepted',
          tenantId,
          indexed: result.indexed,
          failed: result.failed,
        },
      });
    });
  };
}
