import type { FastifyInstance } from 'fastify';
import { PERMISSIONS } from '@etip/shared-auth';
import { authenticate, getUser, rbac } from '../plugins/auth.js';
import { FeedIdParamsSchema } from '../schema.js';
import { SetFeedPolicySchema } from '../schemas/feed-policy.js';
import type { FeedPolicyStore } from '../services/feed-policy-store.js';
import type { FeedRepository } from '../repository.js';

/**
 * Feed policy routes — mounted at /api/v1/feeds alongside feedRoutes.
 *
 * GET  /api/v1/feeds/policies         — list all tenant feed policies
 * GET  /api/v1/feeds/:id/policy       — get policy for a feed
 * PUT  /api/v1/feeds/:id/policy       — create / update policy
 * POST /api/v1/feeds/:id/policy/reset — manually reset daily counter
 */
export function feedPolicyRoutes(policyStore: FeedPolicyStore, repo: FeedRepository) {
  return async function (app: FastifyInstance): Promise<void> {

    // GET /api/v1/feeds/policies — list all policies for tenant
    // Must be registered BEFORE /:id/policy to avoid Fastify treating "policies" as a param.
    app.get('/policies', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_READ)] }, async (req, reply) => {
      const user = getUser(req);
      const policies = policyStore.listPolicies(user.tenantId);
      return reply.send({ data: policies, total: policies.length });
    });

    // GET /api/v1/feeds/:id/policy
    app.get('/:id/policy', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_READ)] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = FeedIdParamsSchema.parse(req.params);
      const feed = await repo.findById(user.tenantId, id);
      if (!feed) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Feed ${id} not found` } });
      }
      const policy = policyStore.getOrInit(user.tenantId, id);
      return reply.send({ data: policy });
    });

    // PUT /api/v1/feeds/:id/policy — create or update
    app.put('/:id/policy', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_UPDATE)] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = FeedIdParamsSchema.parse(req.params);
      const feed = await repo.findById(user.tenantId, id);
      if (!feed) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Feed ${id} not found` } });
      }
      const body = SetFeedPolicySchema.parse(req.body);
      const policy = policyStore.setPolicy(user.tenantId, id, body);
      return reply.send({ data: policy });
    });

    // POST /api/v1/feeds/:id/policy/reset — manual daily counter reset
    app.post('/:id/policy/reset', { preHandler: [authenticate, rbac(PERMISSIONS.FEED_UPDATE)] }, async (req, reply) => {
      const user = getUser(req);
      const { id } = FeedIdParamsSchema.parse(req.params);
      const feed = await repo.findById(user.tenantId, id);
      if (!feed) {
        return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Feed ${id} not found` } });
      }
      // Ensure policy exists before resetting
      policyStore.getOrInit(user.tenantId, id);
      const policy = policyStore.resetCount(user.tenantId, id);
      return reply.send({ data: policy });
    });
  };
}
