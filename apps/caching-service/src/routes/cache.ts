/**
 * @module routes/cache
 * @description Cache management API endpoints (7 endpoints).
 * Provides admin-level visibility and control over the Redis cache layer.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import type { CacheManager } from '../services/cache-manager.js';
import type { CacheInvalidator } from '../services/cache-invalidator.js';

export interface CacheRouteDeps {
  cacheManager: CacheManager;
  cacheInvalidator: CacheInvalidator;
  analyticsUrl: string;
}

const KeysQuerySchema = z.object({
  prefix: z.string().optional().default('etip:'),
  cursor: z.string().optional().default('0'),
  count: z.coerce.number().int().min(1).max(1000).optional().default(100),
});

const KeyParamSchema = z.object({
  key: z.string().min(1),
});

const PrefixParamSchema = z.object({
  prefix: z.string().min(1),
});

const TenantParamSchema = z.object({
  tenantId: z.string().min(1),
});

/** Register cache management routes. */
export function cacheRoutes(deps: CacheRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { cacheManager, cacheInvalidator, analyticsUrl } = deps;

    /**
     * GET /api/v1/cache/stats
     * Redis cache statistics: hit/miss ratio, memory, key count.
     */
    app.get('/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
      const stats = await cacheManager.getStats();
      const invalidatorStats = cacheInvalidator.getStats();
      return reply.send({
        data: {
          redis: stats,
          invalidator: invalidatorStats,
        },
      });
    });

    /**
     * GET /api/v1/cache/keys
     * List cached keys by prefix with SCAN-based pagination.
     */
    app.get('/keys', async (req: FastifyRequest, reply: FastifyReply) => {
      const query = KeysQuerySchema.parse(req.query);
      const result = await cacheManager.listKeys(query.prefix, query.cursor, query.count);
      return reply.send({ data: result });
    });

    /**
     * DELETE /api/v1/cache/keys/:key
     * Invalidate a specific cache key.
     */
    app.delete('/keys/:key', async (req: FastifyRequest, reply: FastifyReply) => {
      const { key } = KeyParamSchema.parse(req.params);
      const decodedKey = decodeURIComponent(key);

      if (!decodedKey.startsWith('etip:')) {
        throw new AppError(400, 'Can only invalidate etip: prefixed keys', 'INVALID_KEY_PREFIX');
      }

      const deleted = await cacheManager.invalidateKey(decodedKey);
      return reply.send({ data: { key: decodedKey, deleted: deleted > 0 } });
    });

    /**
     * DELETE /api/v1/cache/prefix/:prefix
     * Invalidate all keys matching a prefix.
     */
    app.delete('/prefix/:prefix', async (req: FastifyRequest, reply: FastifyReply) => {
      const { prefix } = PrefixParamSchema.parse(req.params);
      const decodedPrefix = decodeURIComponent(prefix);

      if (!decodedPrefix.startsWith('etip:')) {
        throw new AppError(400, 'Can only invalidate etip: prefixed keys', 'INVALID_KEY_PREFIX');
      }

      const deleted = await cacheManager.invalidateByPrefix(decodedPrefix);
      return reply.send({ data: { prefix: decodedPrefix, deletedCount: deleted } });
    });

    /**
     * POST /api/v1/cache/warm
     * Pre-warm dashboard cache by calling analytics-service.
     */
    app.post('/warm', async (_req: FastifyRequest, reply: FastifyReply) => {
      const result = await cacheManager.warmDashboard(analyticsUrl);
      return reply.send({ data: result });
    });

    /**
     * GET /api/v1/cache/namespaces
     * Cache key breakdown by namespace with counts.
     */
    app.get('/namespaces', async (_req: FastifyRequest, reply: FastifyReply) => {
      const namespaces = await cacheManager.getNamespaces();
      const total = namespaces.reduce((sum, ns) => sum + ns.keyCount, 0);
      return reply.send({ data: namespaces, total });
    });

    /**
     * POST /api/v1/cache/invalidate-tenant/:tenantId
     * Flush all cache entries for a specific tenant.
     */
    app.post('/invalidate-tenant/:tenantId', async (req: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = TenantParamSchema.parse(req.params);
      const deleted = await cacheManager.invalidateTenant(tenantId);
      return reply.send({ data: { tenantId, deletedCount: deleted } });
    });
  };
}
