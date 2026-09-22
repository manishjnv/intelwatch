/**
 * @module api-gateway/routes/auth-verify
 * @description nginx `auth_request` target for every /api/v1/* location that nginx proxies
 * straight to a backend service (S147 security fix).
 *
 * GET /api/v1/auth/verify              — any authenticated user
 * GET /api/v1/auth/verify/super-admin  — super_admin only (403 otherwise)
 *   204 + X-Auth-Tenant-Id / X-Auth-User-Id / X-Auth-Role → nginx overwrites the client's
 *       x-tenant-id / x-user-id / x-user-role headers with these values before proxying.
 *   401 → missing/invalid/expired access token.
 *
 * The role requirement is chosen by the nginx location that matched (a separate internal
 * auth location per requirement), never by parsing the client URL here. Super-admin cross-tenant access (I-08) is
 * inherited from `authenticate`. Exempt from rate limiting: it runs once per proxied API call.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { authenticate, getUser } from '../plugins/auth.js';

function verifyHandler(requireSuperAdmin: boolean) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    if (requireSuperAdmin && user.role !== 'super_admin') {
      throw new AppError(403, 'Super admin access required', 'FORBIDDEN');
    }
    return reply
      .header('x-auth-tenant-id', user.tenantId)
      .header('x-auth-user-id', user.sub)
      .header('x-auth-role', user.role)
      .header('cache-control', 'no-store')
      .code(204)
      .send();
  };
}

export async function authVerifyRoutes(app: FastifyInstance): Promise<void> {
  const opts: RouteShorthandOptions = { preHandler: [authenticate], config: { rateLimit: false } };
  app.get('/verify', opts, verifyHandler(false));
  app.get('/verify/super-admin', opts, verifyHandler(true));
}
