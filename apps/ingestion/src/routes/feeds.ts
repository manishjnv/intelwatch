import type { FastifyInstance } from 'fastify';
import { PERMISSIONS } from '@etip/shared-auth';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import { FeedIdParamsSchema, ListFeedsQuerySchema, CreateFeedSchema, UpdateFeedSchema } from '../schema.js';
import type { FeedService } from '../service.js';

export function feedRoutes(service: FeedService) {
  return async function (app: FastifyInstance): Promise<void> {

    // GET /api/v1/feeds — List feeds for tenant (paginated)
    app.get('/', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_READ)] }, async (req, reply) => {
      const user = getUser(req);
      const query = ListFeedsQuerySchema.parse(req.query);
      const result = await service.listFeeds(user.tenantId, query);
      return reply.send(result);
    });

    // POST /api/v1/feeds — Create new feed source
    app.post('/', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_CREATE)] }, async (req, reply) => {
      const user = getUser(req);
      const body = CreateFeedSchema.parse(req.body);
      const feed = await service.createFeed(user.tenantId, body);
      return reply.status(201).send({ data: feed });
    });

    // GET /api/v1/feeds/stats — Aggregate feed statistics (before /:id to avoid param capture)
    app.get('/stats', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_READ)] }, async (req, reply) => {
      const user = getUser(req);
      const stats = await service.getFeedStats(user.tenantId);
      return reply.send({ data: stats });
    });

    // GET /api/v1/feeds/:id — Get feed details
    app.get('/:id', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_READ)] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = FeedIdParamsSchema.parse(req.params);
      const feed = await service.getFeed(user.tenantId, id);
      return reply.send({ data: feed });
    });

    // PUT /api/v1/feeds/:id — Update feed config
    app.put('/:id', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_UPDATE)] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = FeedIdParamsSchema.parse(req.params);
      const body = UpdateFeedSchema.parse(req.body);
      const feed = await service.updateFeed(user.tenantId, id, body);
      return reply.send({ data: feed });
    });

    // DELETE /api/v1/feeds/:id — Soft delete (disable)
    app.delete('/:id', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_DELETE)] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = FeedIdParamsSchema.parse(req.params);
      const result = await service.deleteFeed(user.tenantId, id);
      return reply.send({ data: result });
    });

    // POST /api/v1/feeds/:id/trigger — Manually trigger feed fetch
    app.post('/:id/trigger', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_UPDATE)] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = FeedIdParamsSchema.parse(req.params);
      const result = await service.triggerFeed(user.tenantId, id);
      return reply.status(202).send({ data: result });
    });

    // GET /api/v1/feeds/:id/health — Feed health status
    app.get('/:id/health', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_READ)] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = FeedIdParamsSchema.parse(req.params);
      const health = await service.getFeedHealth(user.tenantId, id);
      return reply.send({ data: health });
    });
  };
}
