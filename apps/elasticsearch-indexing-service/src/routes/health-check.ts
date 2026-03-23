import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { EsIndexClient } from '../es-client.js';
import type { IocIndexWorker } from '../worker.js';

export interface HealthRouteDeps {
  esClient: EsIndexClient;
  worker: IocIndexWorker;
}

/** Liveness and readiness probe routes — no auth required. */
export function healthRoutes(deps: HealthRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    /** GET /health — liveness probe with ES connectivity and queue depth. */
    app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
      const [esConnected, queueDepth] = await Promise.all([
        deps.esClient.ping(),
        deps.worker.getQueueDepth(),
      ]);

      return reply.send({
        status: 'ok',
        service: 'elasticsearch-indexing-service',
        esConnected,
        queueDepth,
        timestamp: new Date().toISOString(),
      });
    });

    /** GET /ready — readiness probe. */
    app.get('/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        ready: true,
        service: 'elasticsearch-indexing-service',
        timestamp: new Date().toISOString(),
      });
    });
  };
}
