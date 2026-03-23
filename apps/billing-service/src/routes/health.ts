import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const startTime = Date.now();

/** Health and readiness check routes. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  /** GET /health — liveness probe. */
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ok',
      service: 'billing-service',
      version: '1.0.0',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  /** GET /ready — readiness probe (same as health for in-memory service). */
  app.get('/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ready',
      service: 'billing-service',
      timestamp: new Date().toISOString(),
    });
  });
}
