import type { FastifyInstance } from 'fastify';
import { verifyNeo4jConnection } from '../driver.js';

/** Registers /health and /ready endpoints for container orchestration. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      service: 'threat-graph',
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req, reply) => {
    const neo4jOk = await verifyNeo4jConnection();
    return reply.send({
      status: neo4jOk ? 'ok' : 'degraded',
      checks: {
        server: 'ok',
        neo4j: neo4jOk ? 'ok' : 'unavailable',
      },
    });
  });
}
