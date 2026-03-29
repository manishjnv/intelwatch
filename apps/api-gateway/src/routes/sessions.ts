import type { FastifyInstance } from 'fastify';
import { authenticate, getUser } from '../plugins/auth.js';

export async function sessionRoutes(app: FastifyInstance) {
  const { UserService } = await import('@etip/user-service');
  const svc = new UserService();

  /** GET /sessions — list active sessions for current user */
  app.get('/sessions', { preHandler: [authenticate] }, async (req) => {
    const user = getUser(req);
    const sessions = await svc.listSessions(user.sub, user.sessionId);
    return { status: 'ok', data: sessions };
  });

  /** DELETE /sessions/:sessionId — terminate a specific session */
  app.delete('/sessions/:sessionId', { preHandler: [authenticate] }, async (req, reply) => {
    const user = getUser(req);
    const { sessionId } = req.params as { sessionId: string };
    await svc.terminateSession(user.sub, sessionId, user.sessionId, user.tenantId, req.ip);
    return reply.code(204).send();
  });
}
