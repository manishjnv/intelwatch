import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QUEUES } from '@etip/shared-utils';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ok',
      service: 'alerting-service',
      queue: QUEUES.ALERT_EVALUATE,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      ready: true,
      service: 'alerting-service',
      timestamp: new Date().toISOString(),
    });
  });
}
