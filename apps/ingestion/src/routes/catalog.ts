/**
 * @module Catalog Routes
 * @description Global Feed Catalog API routes (DECISION-029).
 * All routes gated behind TI_GLOBAL_PROCESSING_ENABLED feature flag.
 */
import type { FastifyInstance } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import { CreateCatalogSchema, UpdateCatalogSchema, CatalogQuerySchema } from '../schemas/catalog.js';
import { formatAdmiraltyCode } from '@etip/shared-normalization';
import type { GlobalFeedRepository } from '../repositories/global-feed-repo.js';
import type { SubscriptionRepository } from '../repositories/subscription-repo.js';

const PLAN_TIER_ORDER = ['free', 'starter', 'teams', 'enterprise'];

function tierIndex(tier: string): number {
  const idx = PLAN_TIER_ORDER.indexOf(tier);
  return idx === -1 ? 0 : idx;
}

export interface CatalogRouteDeps {
  globalFeedRepo: GlobalFeedRepository;
  subscriptionRepo: SubscriptionRepository;
  isGlobalProcessingEnabled: () => boolean;
  getMaxSubscriptions: (plan: string) => number;
}

export function catalogRoutes(deps: CatalogRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {

    // Feature flag gate — all routes return 503 when disabled
    app.addHook('onRequest', async () => {
      if (!deps.isGlobalProcessingEnabled()) {
        throw new AppError(503, 'Global feed processing is not enabled', 'FEATURE_DISABLED');
      }
    });

    // GET /api/v1/catalog — list global feeds
    app.get('/', { preHandler: [authenticate] }, async (req, reply) => {
      const query = CatalogQuerySchema.parse(req.query);
      const feeds = await deps.globalFeedRepo.listCatalog(query);
      const enriched = feeds.map((f) => ({
        ...f,
        admiraltyCode: formatAdmiraltyCode(f.sourceReliability, f.infoCred),
      }));
      return reply.send({ data: enriched });
    });

    // POST /api/v1/catalog — create global feed (super_admin only)
    app.post('/', { preHandler: [authenticate, rbac('catalog:create')] }, async (req, reply) => {
      const body = CreateCatalogSchema.parse(req.body);
      const feed = await deps.globalFeedRepo.createCatalogEntry(body);
      return reply.status(201).send({ data: feed });
    });

    // PUT /api/v1/catalog/:id — update global feed (super_admin only)
    app.put('/:id', { preHandler: [authenticate, rbac('catalog:update')] }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = UpdateCatalogSchema.parse(req.body);
      const existing = await deps.globalFeedRepo.getCatalogEntry(id);
      if (!existing) throw new AppError(404, 'Catalog entry not found', 'NOT_FOUND');
      const feed = await deps.globalFeedRepo.updateCatalogEntry(id, body);
      return reply.send({ data: feed });
    });

    // DELETE /api/v1/catalog/:id — remove global feed (super_admin only)
    app.delete('/:id', { preHandler: [authenticate, rbac('catalog:delete')] }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = await deps.globalFeedRepo.getCatalogEntry(id);
      if (!existing) throw new AppError(404, 'Catalog entry not found', 'NOT_FOUND');
      await deps.globalFeedRepo.deleteCatalogEntry(id);
      return reply.status(204).send();
    });

    // POST /api/v1/catalog/:id/subscribe — tenant subscribes to feed
    app.post('/:id/subscribe', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };

      const feed = await deps.globalFeedRepo.getCatalogEntry(id);
      if (!feed) throw new AppError(404, 'Catalog entry not found', 'NOT_FOUND');

      // Plan tier check
      const tenantPlan = (user as Record<string, unknown>).tenantPlan as string ?? 'free';
      if (tierIndex(tenantPlan) < tierIndex(feed.minPlanTier)) {
        throw new AppError(403, `Plan ${tenantPlan} does not meet minimum tier ${feed.minPlanTier}`, 'PLAN_INSUFFICIENT');
      }

      // Subscription limit check
      const currentCount = await deps.subscriptionRepo.getSubscriptionCount(user.tenantId);
      const maxSubs = deps.getMaxSubscriptions(tenantPlan);
      if (currentCount >= maxSubs) {
        throw new AppError(403, `Subscription limit reached (${maxSubs})`, 'SUBSCRIPTION_LIMIT');
      }

      // Duplicate check
      const alreadySubscribed = await deps.subscriptionRepo.isSubscribed(user.tenantId, id);
      if (alreadySubscribed) {
        throw new AppError(409, 'Already subscribed to this feed', 'ALREADY_SUBSCRIBED');
      }

      const subscription = await deps.subscriptionRepo.subscribe(user.tenantId, id);
      await deps.globalFeedRepo.incrementSubscriberCount(id, 1);
      return reply.status(201).send({ data: subscription });
    });

    // DELETE /api/v1/catalog/:id/unsubscribe — tenant unsubscribes
    app.delete('/:id/unsubscribe', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = req.params as { id: string };

      const isSubbed = await deps.subscriptionRepo.isSubscribed(user.tenantId, id);
      if (!isSubbed) throw new AppError(404, 'Not subscribed to this feed', 'NOT_SUBSCRIBED');

      await deps.subscriptionRepo.unsubscribe(user.tenantId, id);
      await deps.globalFeedRepo.incrementSubscriberCount(id, -1);
      return reply.status(204).send();
    });

    // GET /api/v1/catalog/subscriptions — tenant's active subscriptions
    app.get('/subscriptions', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const subs = await deps.subscriptionRepo.getSubscriptions(user.tenantId);
      return reply.send({ data: subs });
    });
  };
}
