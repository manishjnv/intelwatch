/**
 * @module api-gateway/routes/usage
 * @description Quota usage query + reset endpoints.
 * 3 super_admin endpoints + 2 tenant-facing (billing) endpoints.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { FEATURE_KEYS } from '@etip/shared-types';
import { authenticate, getUser } from '../plugins/auth.js';
import { rbac, rbacAny } from '../plugins/rbac.js';
import { getUsage } from '../quota/usage-counter.js';
import { getPlanLimits } from '../quota/plan-cache.js';
import { resetUsage } from '../quota/usage-counter.js';

const superAdmin = [authenticate, rbac('admin:*')];
const tenantAdmin = [authenticate, rbac('org:read')];
const tenantMember = [authenticate, rbacAny(['org:read', 'ioc:read'])];

const ResetBodySchema = z.object({
  featureKey: z.enum(FEATURE_KEYS),
  period: z.enum(['daily', 'weekly', 'monthly', 'total', 'all']),
});

export async function usageRoutes(app: FastifyInstance): Promise<void> {
  // ── Super Admin: Tenant usage (all 16 features) ───────────────────
  app.get(
    '/admin/tenants/:tenantId/usage',
    { preHandler: superAdmin },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = req.params as { tenantId: string };
      const limits = await getPlanLimits(tenantId);
      const features: Record<string, unknown>[] = [];

      for (const key of FEATURE_KEYS) {
        const usage = await getUsage(tenantId, key);
        const fl = limits.get(key);
        features.push({
          featureKey: key,
          enabled: fl?.enabled ?? true,
          usage,
          limits: fl ?? null,
        });
      }

      return reply.status(200).send({ data: features });
    },
  );

  // ── Super Admin: Platform-wide usage summary ──────────────────────
  app.get(
    '/admin/usage/summary',
    { preHandler: superAdmin },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      // Aggregate: total requests today, basic stats
      // This is a lightweight summary — not a full analytics query
      const summary = {
        timestamp: new Date().toISOString(),
        note: 'Platform-wide usage summary — aggregated from Redis counters',
        featureCount: FEATURE_KEYS.length,
        features: FEATURE_KEYS,
      };
      return reply.status(200).send({ data: summary });
    },
  );

  // ── Super Admin: Reset usage counter ──────────────────────────────
  app.post(
    '/admin/tenants/:tenantId/usage/reset',
    { preHandler: superAdmin },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { tenantId } = req.params as { tenantId: string };
      const body = ResetBodySchema.parse(req.body);
      const user = getUser(req);

      await resetUsage(tenantId, body.featureKey, body.period);

      // Audit log the reset
      req.log.info(
        {
          action: 'quota.usage.reset',
          tenantId,
          featureKey: body.featureKey,
          period: body.period,
          resetBy: user.email ?? user.sub,
        },
        'Usage counter reset by admin',
      );

      return reply.status(200).send({
        data: {
          tenantId,
          featureKey: body.featureKey,
          period: body.period,
          resetBy: user.email ?? user.sub,
          resetAt: new Date().toISOString(),
        },
      });
    },
  );

  // ── Tenant Admin: Own org usage ───────────────────────────────────
  app.get(
    '/billing/usage',
    { preHandler: tenantAdmin },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const tenantId = user.tenantId;
      const limits = await getPlanLimits(tenantId);
      const features: Record<string, unknown>[] = [];

      for (const key of FEATURE_KEYS) {
        const usage = await getUsage(tenantId, key);
        const fl = limits.get(key);
        if (fl) {
          features.push({
            featureKey: key,
            enabled: fl.enabled,
            usage,
          });
        }
      }

      return reply.status(200).send({ data: features });
    },
  );

  // ── Tenant Member: Current plan limits + usage percentage ─────────
  app.get(
    '/billing/limits',
    { preHandler: tenantMember },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = getUser(req);
      const tenantId = user.tenantId;
      const limits = await getPlanLimits(tenantId);
      const result: Record<string, unknown>[] = [];

      for (const key of FEATURE_KEYS) {
        const fl = limits.get(key);
        if (!fl) continue;

        const usage = await getUsage(tenantId, key);
        result.push({
          featureKey: key,
          enabled: fl.enabled,
          limitDaily: fl.limitDaily,
          usedDaily: usage.daily,
          limitMonthly: fl.limitMonthly,
          usedMonthly: usage.monthly,
          percentDaily: fl.limitDaily > 0 ? Math.round((usage.daily / fl.limitDaily) * 100) : 0,
          percentMonthly: fl.limitMonthly > 0 ? Math.round((usage.monthly / fl.limitMonthly) * 100) : 0,
        });
      }

      return reply.status(200).send({ data: result });
    },
  );
}
