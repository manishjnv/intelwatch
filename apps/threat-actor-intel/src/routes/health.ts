import type { FastifyInstance } from 'fastify';

/** Registers /health and /ready endpoints for container orchestration. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      service: 'threat-actor-intel',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      checks: { server: 'ok' },
    });
  });
}
