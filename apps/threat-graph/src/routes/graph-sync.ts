import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { GraphReconciler } from '../services/graph-reconciler.js';

/** Admin routes for the IOC→graph reconciler (S171 P3b). Tenant-scoped to the caller only. */
export function graphSyncRoutes(reconciler: GraphReconciler) {
  return async function routes(app: FastifyInstance): Promise<void> {
    app.get('/sync/status', {
      preHandler: [authenticate, rbac('graph:admin')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const state = await reconciler.getState(user.tenantId);
      return reply.send({ data: state });
    });

    app.post('/sync/run', {
      preHandler: [authenticate, rbac('graph:admin')],
    }, async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      await reconciler.triggerFullSync(user.tenantId);
      return reply.status(202).send({ data: { started: true } });
    });
  };
}
