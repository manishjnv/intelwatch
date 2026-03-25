import type { FastifyInstance } from 'fastify';

const SERVICE_NAME = 'api-gateway';
const VERSION = '1.0.0';
const startTime = Date.now();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: SERVICE_NAME,
      version: VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', { config: { rateLimit: false } }, async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: SERVICE_NAME,
      checks: { server: 'ok' },
    });
  });
}
