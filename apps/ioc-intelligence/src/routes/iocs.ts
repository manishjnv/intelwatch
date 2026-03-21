import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import type { IOCService } from '../service.js';
import {
  ListIocsQuerySchema, CreateIocBodySchema, UpdateIocBodySchema,
  BulkOperationSchema, SearchIocsBodySchema, ExportIocsBodySchema,
  IocIdParamSchema,
} from '../schemas/ioc.js';

/** Creates the IOC routes plugin bound to a service instance. */
export function iocRoutes(service: IOCService): FastifyPluginCallback {
  return (app: FastifyInstance, _opts: unknown, done: (err?: Error) => void) => {

    // ── GET / — Paginated IOC list ──────────────────────────────
    app.get('/', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const query = ListIocsQuerySchema.parse(req.query);
      const result = await service.listIocs(user.tenantId, query);
      return reply.send({ data: result.items, total: result.total, page: query.page, limit: query.limit });
    });

    // ── POST / — Create manual IOC ──────────────────────────────
    app.post('/', { preHandler: [authenticate, rbac('ioc:create')] }, async (req, reply) => {
      const user = getUser(req);
      const body = CreateIocBodySchema.parse(req.body);
      const ioc = await service.createIoc(user.tenantId, body);
      return reply.status(201).send({ data: ioc });
    });

    // ── POST /bulk — Bulk operations ────────────────────────────
    app.post('/bulk', { preHandler: [authenticate, rbac('ioc:update')] }, async (req, reply) => {
      const user = getUser(req);
      const body = BulkOperationSchema.parse(req.body);
      const result = await service.bulkOperation(user.tenantId, body);
      return reply.send({ data: result });
    });

    // ── GET /stats — Aggregated statistics ──────────────────────
    app.get('/stats', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const stats = await service.getStats(user.tenantId);
      return reply.send({ data: stats });
    });

    // ── POST /search — Full-text search ─────────────────────────
    app.post('/search', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const body = SearchIocsBodySchema.parse(req.body);
      const result = await service.searchIocs(user.tenantId, body);
      return reply.send({ data: result.items, total: result.total, page: body.page, limit: body.limit });
    });

    // ── POST /export — CSV/JSON export ──────────────────────────
    app.post('/export', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const body = ExportIocsBodySchema.parse(req.body);
      const result = await service.exportIocs(user.tenantId, body);
      return reply
        .header('Content-Type', result.contentType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.data);
    });

    // ── GET /feed-accuracy — B3: Per-feed accuracy report ────────
    app.get('/feed-accuracy', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const report = await service.getFeedAccuracy(user.tenantId);
      return reply.send({ data: report });
    });

    // ── GET /:id — IOC detail with computed accuracy signals ────
    app.get('/:id', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = IocIdParamSchema.parse(req.params);
      const ioc = await service.getIocDetail(user.tenantId, id);
      return reply.send({ data: ioc });
    });

    // ── PUT /:id — Update IOC metadata ──────────────────────────
    app.put('/:id', { preHandler: [authenticate, rbac('ioc:update')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = IocIdParamSchema.parse(req.params);
      const body = UpdateIocBodySchema.parse(req.body);
      const ioc = await service.updateIoc(user.tenantId, id, body);
      return reply.send({ data: ioc });
    });

    // ── DELETE /:id — Soft delete (revoke) ──────────────────────
    app.delete('/:id', { preHandler: [authenticate, rbac('ioc:delete')] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = IocIdParamSchema.parse(req.params);
      await service.deleteIoc(user.tenantId, id);
      return reply.status(204).send();
    });

    // ── GET /:id/pivot — Related IOCs ───────────────────────────
    app.get('/:id/pivot', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = IocIdParamSchema.parse(req.params);
      const pivot = await service.pivotIoc(user.tenantId, id);
      return reply.send({ data: pivot });
    });

    // ── GET /:id/timeline — Confidence history + events ─────────
    app.get('/:id/timeline', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = IocIdParamSchema.parse(req.params);
      const timeline = await service.getTimeline(user.tenantId, id);
      return reply.send({ data: timeline });
    });

    done();
  };
}
