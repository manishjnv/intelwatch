/**
 * @module routes/archive
 * @description Archive management API endpoints (6 endpoints).
 * Manages cold storage archival, retrieval, and retention.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import type { ArchiveEngine } from '../services/archive-engine.js';
import type { ArchiveStore } from '../services/archive-store.js';

export interface ArchiveRouteDeps {
  archiveEngine: ArchiveEngine;
  archiveStore: ArchiveStore;
}

const ManifestListQuerySchema = z.object({
  tenantId: z.string().optional(),
  entityType: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
});

const ManifestIdParamSchema = z.object({
  id: z.string().min(1),
});

const ManifestRestoreParamSchema = z.object({
  manifestId: z.string().min(1),
});

const RunBodySchema = z.object({
  tenantId: z.string().optional().default('default'),
}).optional();

/** Register archive management routes. */
export function archiveRoutes(deps: ArchiveRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { archiveEngine, archiveStore } = deps;

    /**
     * GET /api/v1/archive/status
     * Archive engine status: cron state, last/next run, total runs.
     */
    app.get('/status', async (_req: FastifyRequest, reply: FastifyReply) => {
      const status = archiveEngine.getStatus();
      return reply.send({ data: status });
    });

    /**
     * POST /api/v1/archive/run
     * Trigger a manual archive cycle.
     */
    app.post('/run', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = RunBodySchema.parse(req.body ?? {});
      const tenantId = body?.tenantId ?? 'default';
      const manifest = await archiveEngine.runOnce(tenantId);

      if (!manifest) {
        return reply.status(200).send({
          data: { message: 'Archive cycle completed with no records to archive' },
        });
      }

      return reply.status(201).send({ data: manifest });
    });

    /**
     * GET /api/v1/archive/manifests
     * List archived data manifests with optional filters and pagination.
     */
    app.get('/manifests', async (req: FastifyRequest, reply: FastifyReply) => {
      const query = ManifestListQuerySchema.parse(req.query);
      const result = archiveStore.list({
        tenantId: query.tenantId,
        entityType: query.entityType,
        status: query.status,
        page: query.page,
        limit: query.limit,
      });
      return reply.send({
        data: result.data,
        total: result.total,
        page: query.page,
        limit: query.limit,
      });
    });

    /**
     * GET /api/v1/archive/manifests/:id
     * Get a specific manifest with full metadata.
     */
    app.get('/manifests/:id', async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = ManifestIdParamSchema.parse(req.params);
      const manifest = archiveStore.getById(id);
      if (!manifest) {
        throw new AppError(404, `Manifest ${id} not found`, 'MANIFEST_NOT_FOUND');
      }
      return reply.send({ data: manifest });
    });

    /**
     * POST /api/v1/archive/restore/:manifestId
     * Restore archived data from cold storage to hot storage.
     */
    app.post('/restore/:manifestId', async (req: FastifyRequest, reply: FastifyReply) => {
      const { manifestId } = ManifestRestoreParamSchema.parse(req.params);
      const manifest = archiveStore.getById(manifestId);
      if (!manifest) {
        throw new AppError(404, `Manifest ${manifestId} not found`, 'MANIFEST_NOT_FOUND');
      }

      try {
        const records = await archiveEngine.restore(manifestId);
        return reply.send({
          data: {
            manifestId,
            recordsRestored: records.length,
            entityType: manifest.entityType,
            restoredAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        throw new AppError(500, `Restore failed: ${(err as Error).message}`, 'RESTORE_FAILED');
      }
    });

    /**
     * GET /api/v1/archive/stats
     * Aggregate archive statistics: total records, storage size, by entity type.
     */
    app.get('/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
      const stats = archiveStore.getStats();
      return reply.send({
        data: {
          ...stats,
          retentionDays: 365,
          archiveFormat: 'jsonl+gzip',
        },
      });
    });
  };
}
