import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    return reply.send({ status: 'ok', service: 'ai-enrichment', timestamp: new Date().toISOString() });
  });

  app.get('/ready', async (_req, reply) => {
    return reply.send({ status: 'ready', service: 'ai-enrichment' });
  });
}
