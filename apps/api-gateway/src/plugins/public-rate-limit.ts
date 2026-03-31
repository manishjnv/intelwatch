/**
 * @module plugins/public-rate-limit
 * @description Per-minute burst rate limiting for public API routes.
 * All limits are DB-driven via the plan definition system:
 *   api_access.limitWeekly = per-minute burst limit (repurposed)
 * The super admin controls every plan tier equally — no hardcoded plan gating.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { PUBLIC_API_BURST_FALLBACK } from '@etip/shared-types';
import { getPlanLimits } from '../quota/plan-cache.js';
import type { AuthenticatedRequest } from './auth.js';

/**
 * Resolve the per-minute burst rate limit from the DB plan definition.
 * Uses api_access.limitWeekly as the per-minute burst value.
 * -1 = unlimited (mapped to a high ceiling of 10000).
 */
async function resolvePublicRateLimit(req: FastifyRequest): Promise<number> {
  const user = (req as FastifyRequest & AuthenticatedRequest).user;
  if (!user?.tenantId) return PUBLIC_API_BURST_FALLBACK;

  try {
    const limits = await getPlanLimits(user.tenantId);
    const apiLimits = limits.get('api_access');
    if (!apiLimits) return PUBLIC_API_BURST_FALLBACK;

    // limitWeekly repurposed as per-minute burst for api_access
    if (apiLimits.limitWeekly === -1) return 10000; // unlimited
    if (apiLimits.limitWeekly > 0) return apiLimits.limitWeekly;
    return PUBLIC_API_BURST_FALLBACK;
  } catch {
    return PUBLIC_API_BURST_FALLBACK;
  }
}

/**
 * Register per-minute burst rate limiting on a Fastify instance.
 * Should be registered within the /api/v1/public scoped plugin.
 */
export async function registerPublicRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: resolvePublicRateLimit,
    timeWindow: 60_000, // 1 minute
    keyGenerator: (req: FastifyRequest) => {
      const user = (req as FastifyRequest & AuthenticatedRequest).user;
      return user?.tenantId ?? req.ip;
    },
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Public API rate limit exceeded — limit is ${context.max} requests per minute`,
        retryAfter: context.after,
      },
    }),
  });
}
