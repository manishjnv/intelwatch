import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/** Health and readiness check routes (no auth required). */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  /** GET /health — liveness probe. */
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ok',
      service: 'admin-service',
      timestamp: new Date().toISOString(),
    });
  });

  /** GET /ready — readiness probe. */
  app.get('/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      ready: true,
      service: 'admin-service',
      timestamp: new Date().toISOString(),
    });
  });
}
