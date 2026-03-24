/**
 * @module routes/health
 * @description Health and readiness probe endpoints.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CacheManager } from '../services/cache-manager.js';

export interface HealthRouteDeps {
  cacheManager: CacheManager;
  minioConnected: () => Promise<boolean>;
}

/** Register health and readiness routes. */
export function healthRoutes(deps: HealthRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
      const [redisOk, minioOk] = await Promise.all([
        deps.cacheManager.ping(),
        deps.minioConnected(),
      ]);

      return reply.send({
        status: redisOk && minioOk ? 'ok' : 'degraded',
        service: 'caching-service',
        timestamp: new Date().toISOString(),
        redisConnected: redisOk,
        minioConnected: minioOk,
      });
    });

    app.get('/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        ready: true,
        service: 'caching-service',
        timestamp: new Date().toISOString(),
      });
    });
  };
}
