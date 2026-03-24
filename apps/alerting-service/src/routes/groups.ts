import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { AlertGroupStore } from '../services/alert-group-store.js';

export interface GroupRouteDeps {
  alertGroupStore: AlertGroupStore;
}

export function groupRoutes(deps: GroupRouteDeps) {
  const { alertGroupStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/v1/alerts/groups — List alert groups
    app.get('/', async (req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) => {
      const tenantId = req.query.tenantId || 'default';
      const status = req.query.status;
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);

      const result = alertGroupStore.list(tenantId, { status, page, limit });
      return reply.send({
        data: result.data,
        meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      });
    });

    // GET /api/v1/alerts/groups/:id — Get group detail
    app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const group = alertGroupStore.getById(req.params.id);
      if (!group) throw new AppError(404, `Group not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.send({ data: group });
    });

    // POST /api/v1/alerts/groups/:id/resolve — Resolve a group
    app.post('/:id/resolve', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const group = alertGroupStore.resolveGroup(req.params.id);
      if (!group) throw new AppError(404, `Group not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.send({ data: group });
    });
  };
}
