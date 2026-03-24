import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ok',
      service: 'analytics-service',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      ready: true,
      service: 'analytics-service',
      timestamp: new Date().toISOString(),
    });
  });
}
