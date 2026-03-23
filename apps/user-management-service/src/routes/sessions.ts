import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SessionManager } from '../services/session-manager.js';
import type { AuditLogger } from '../services/audit-logger.js';
import { SessionListQuerySchema } from '../schemas/user-management.js';

export interface SessionRouteDeps {
  sessionManager: SessionManager;
  auditLogger: AuditLogger;
}

/** Create session management route plugin. */
export function sessionRoutes(deps: SessionRouteDeps) {
  const { sessionManager, auditLogger } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /sessions — List active sessions for current user. */
    app.get('/sessions', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      const query = SessionListQuerySchema.parse(req.query);
      const result = sessionManager.listByUser(userId, tenantId, query.page, query.limit);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    /** DELETE /sessions/:id — Revoke a specific session. */
    app.delete('/sessions/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      sessionManager.revoke(req.params.id, userId, tenantId);
      auditLogger.log({
        tenantId, userId,
        action: 'session.revoked', riskLevel: 'medium',
        details: { sessionId: req.params.id }, ip: req.ip,
      });
      return reply.status(204).send();
    });

    /** DELETE /sessions — Revoke all sessions for current user. */
    app.delete('/sessions', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      const count = sessionManager.revokeAll(userId, tenantId);
      auditLogger.log({
        tenantId, userId,
        action: 'session.revoked_all', riskLevel: 'high',
        details: { count }, ip: req.ip,
      });
      return reply.send({ data: { revoked: count } });
    });

    /** GET /sessions/count — Count active sessions. */
    app.get('/sessions/count', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      const count = sessionManager.countActive(userId, tenantId);
      return reply.send({ data: { active: count } });
    });
  };
}
