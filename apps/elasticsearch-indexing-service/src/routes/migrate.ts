import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { EsIndexClient } from '../es-client.js';
import { migrateToPerTypeIndices } from '../migration.js';

export interface MigrateRouteDeps {
  esClient: EsIndexClient;
}

/** Migration route — POST /api/v1/admin/migrate-indices/:tenantId */
export function migrateRoutes(deps: MigrateRouteDeps) {
  const { esClient } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /**
     * POST /migrate-indices/:tenantId
     * Migrates a tenant's IOCs from the legacy single index to per-type indices.
     * Returns 200 with migration result (counts per category).
     */
    app.post('/migrate-indices/:tenantId', async (req: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = req.params as { tenantId: string };
      if (!tenantId || typeof tenantId !== 'string' || tenantId.length < 1) {
        throw new AppError(400, 'tenantId is required', 'VALIDATION_ERROR');
      }

      const result = await migrateToPerTypeIndices(esClient, tenantId);
      return reply.send({ data: result });
    });
  };
}
