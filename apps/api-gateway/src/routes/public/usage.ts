/**
 * @module routes/public/usage
 * @description Public API usage/quota status endpoint.
 * All limits are DB-driven via the plan definition system.
 * The super admin controls every plan tier equally.
 *
 * Field mapping for api_access feature:
 *   limitWeekly  → per-minute burst rate limit
 *   limitDaily   → daily API call quota
 *   limitMonthly → monthly API call quota
 *   limitTotal   → max webhook subscriptions
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PUBLIC_API_BURST_FALLBACK, type PublicApiUsageDto } from '@etip/shared-types';
import { prisma } from '../../prisma.js';
import { apiKeyAuth } from '../../plugins/api-key-auth.js';
import { getUser } from '../../plugins/auth.js';
import { getPlanLimits, getUsage } from '../../plugins/quota-enforcement.js';
import { getTenantPlanName } from '../../quota/plan-cache.js';

export async function publicUsageRoutes(app: FastifyInstance): Promise<void> {
  const auth = apiKeyAuth(null); // any valid key

  // ── GET /usage — Current quota/rate limit status ──────────────────
  app.get('/usage', {
    schema: { tags: ['Usage'], summary: 'Current plan quota and rate limit status' },
    preHandler: [auth],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const tenantId = user.tenantId;

    const [planName, limits, usage, webhookCount] = await Promise.all([
      getTenantPlanName(tenantId),
      getPlanLimits(tenantId),
      getUsage(tenantId, 'api_access'),
      prisma.webhookSubscription.count({ where: { tenantId, active: true } }),
    ]);

    const apiLimits = limits.get('api_access');

    // Per-minute burst from api_access.limitWeekly (-1 = unlimited)
    const burstRaw = apiLimits?.limitWeekly ?? PUBLIC_API_BURST_FALLBACK;
    const burstLimit = burstRaw === -1 ? -1 : burstRaw;

    const result: PublicApiUsageDto = {
      plan: planName,
      rateLimitPerMinute: burstLimit,
      quotas: {
        daily: {
          limit: apiLimits?.limitDaily ?? 0,
          used: usage.daily,
          remaining: apiLimits?.limitDaily === -1
            ? -1
            : Math.max(0, (apiLimits?.limitDaily ?? 0) - usage.daily),
        },
        monthly: {
          limit: apiLimits?.limitMonthly ?? 0,
          used: usage.monthly,
          remaining: apiLimits?.limitMonthly === -1
            ? -1
            : Math.max(0, (apiLimits?.limitMonthly ?? 0) - usage.monthly),
        },
      },
      webhooks: {
        limit: apiLimits?.limitTotal ?? 0,
        used: webhookCount,
      },
    };

    return reply.send({ data: result });
  });
}
