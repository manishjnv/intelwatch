import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import { AssetManager } from '../services/asset-manager.js';
import { CreateAssetSchema, UpdateAssetSchema, PaginationSchema } from '../schemas/drp.js';

export interface AssetRouteDeps {
  assetManager: AssetManager;
}

/** Asset management routes — CRUD + scan triggers. */
export function assetRoutes(deps: AssetRouteDeps) {
  const { assetManager } = deps;

  return async function routes(app: FastifyInstance): Promise<void> {

    // POST /assets — Create monitored asset
    app.post(
      '/assets',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const input = CreateAssetSchema.parse(req.body);
        const asset = assetManager.create(user.tenantId, user.userId, input);
        return reply.status(201).send({ data: asset });
      },
    );

    // GET /assets — List monitored assets
    app.get(
      '/assets',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const query = req.query as Record<string, string>;
        const { page, limit } = PaginationSchema.parse(query);
        const type = query.type;
        const result = assetManager.list(user.tenantId, page, limit, type);
        return reply.send(result);
      },
    );

    // GET /assets/stats — Asset statistics
    app.get(
      '/assets/stats',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const stats = assetManager.getStats(user.tenantId);
        return reply.send({ data: stats });
      },
    );

    // GET /assets/:id — Get single asset
    app.get(
      '/assets/:id',
      { preHandler: [authenticate, rbac('alert:read')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const asset = assetManager.get(user.tenantId, id);
        return reply.send({ data: asset });
      },
    );

    // PUT /assets/:id — Update asset
    app.put(
      '/assets/:id',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const updates = UpdateAssetSchema.parse(req.body);
        const asset = assetManager.update(user.tenantId, id, updates);
        return reply.send({ data: asset });
      },
    );

    // DELETE /assets/:id — Delete asset
    app.delete(
      '/assets/:id',
      { preHandler: [authenticate, rbac('alert:update')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        assetManager.delete(user.tenantId, id);
        return reply.status(204).send();
      },
    );

    // POST /assets/:id/scan — Trigger scan on single asset
    app.post(
      '/assets/:id/scan',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { id } = req.params as { id: string };
        const asset = assetManager.get(user.tenantId, id);
        assetManager.markScanned(user.tenantId, id);
        return reply.send({ data: { assetId: asset.id, status: 'scan_triggered', triggeredAt: new Date().toISOString() } });
      },
    );

    // POST /assets/scan-all — Trigger scan on all tenant assets
    app.post(
      '/assets/scan-all',
      { preHandler: [authenticate, rbac('alert:create')] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const user = getUser(req);
        const { data: assets } = assetManager.list(user.tenantId, 1, 500);
        const enabled = assets.filter((a) => a.enabled);
        for (const a of enabled) {
          assetManager.markScanned(user.tenantId, a.id);
        }
        return reply.send({ data: { scanned: enabled.length, total: assets.length, triggeredAt: new Date().toISOString() } });
      },
    );
  };
}
