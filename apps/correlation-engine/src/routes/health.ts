import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'correlation-engine',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req, reply) => {
    return reply.status(200).send({
      status: 'ready',
      service: 'correlation-engine',
      timestamp: new Date().toISOString(),
    });
  });
}
