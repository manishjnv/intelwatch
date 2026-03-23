import type { FastifyInstance } from 'fastify';

/** Health and readiness probe routes (no auth). */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      service: 'integration-service',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req, reply) => {
    return reply.send({ status: 'ready' });
  });
}
