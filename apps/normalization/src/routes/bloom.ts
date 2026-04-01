/**
 * @module routes/bloom
 * @description Admin endpoints for Bloom filter management.
 * POST /admin/bloom/warm/:tenantId — Warm up bloom filter from DB
 * GET  /admin/bloom/stats/:tenantId — Get bloom filter stats + metrics
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { z } from 'zod';
import { authenticate, getUser } from '../plugins/auth.js';
import type { BloomManager } from '../bloom.js';
import type { IOCRepository } from '../repository.js';

const TenantIdParams = z.object({
  tenantId: z.string().uuid(),
});

export interface BloomRouteDeps {
  bloomManager: BloomManager;
  repo: IOCRepository;
}

/**
 * Register Bloom filter admin routes.
 * All routes require authentication and super_admin role.
 */
export function bloomRoutes(deps: BloomRouteDeps) {
  const { bloomManager, repo } = deps;

  /** Fetch dedupe hashes from DB in paginated batches */
  async function fetchHashes(tenantId: string, skip: number, take: number): Promise<string[]> {
    return repo.findDedupeHashes(tenantId, skip, take);
  }

  return async function (app: FastifyInstance): Promise<void> {

    /**
     * POST /admin/bloom/warm/:tenantId
     * Warm up the Bloom filter for a tenant from existing DB hashes.
     * Requires super_admin role.
     */
    app.post('/warm/:tenantId', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      if (user.role !== 'super_admin') {
        throw new AppError(403, 'Only super_admin can warm bloom filters', 'FORBIDDEN');
      }

      const params = TenantIdParams.parse(req.params);
      const result = await bloomManager.warmUp(params.tenantId, fetchHashes);

      return reply.send({
        data: {
          tenantId: params.tenantId,
          loaded: result.loaded,
          elapsedMs: result.elapsed,
        },
      });
    });

    /**
     * GET /admin/bloom/stats/:tenantId
     * Get Bloom filter stats and metrics for a tenant.
     * Requires super_admin role.
     */
    app.get('/stats/:tenantId', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      if (user.role !== 'super_admin') {
        throw new AppError(403, 'Only super_admin can view bloom stats', 'FORBIDDEN');
      }

      const params = TenantIdParams.parse(req.params);
      const stats = await bloomManager.getStats(params.tenantId);

      return reply.send({ data: stats });
    });

    /**
     * POST /admin/bloom/rebuild/:tenantId
     * Reset and rebuild the Bloom filter for a tenant from DB.
     * Requires super_admin role.
     */
    app.post('/rebuild/:tenantId', {
      preHandler: [authenticate],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      if (user.role !== 'super_admin') {
        throw new AppError(403, 'Only super_admin can rebuild bloom filters', 'FORBIDDEN');
      }

      const params = TenantIdParams.parse(req.params);
      const result = await bloomManager.rebuild(params.tenantId, fetchHashes);

      return reply.send({
        data: {
          tenantId: params.tenantId,
          loaded: result.loaded,
          elapsedMs: result.elapsed,
        },
      });
    });
  };
}
