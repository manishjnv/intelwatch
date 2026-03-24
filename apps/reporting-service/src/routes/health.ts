import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QUEUES } from '@etip/shared-utils';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ok',
      service: 'reporting-service',
      queue: QUEUES.REPORT_GENERATE,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      ready: true,
      service: 'reporting-service',
      timestamp: new Date().toISOString(),
    });
  });
}
