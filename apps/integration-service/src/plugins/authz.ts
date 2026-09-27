import type { FastifyRequest } from 'fastify';
import { hasPermission } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
import type { Role } from '@etip/shared-types';

/**
 * Fastify preHandler factory enforcing RBAC on a route.
 * Must run AFTER the route's `auth` preHandler, which verifies the JWT and
 * sets `req.user` to the decoded payload (including `role`).
 * Fails closed: a missing or unrecognized role is rejected, never allowed.
 */
export function requirePermission(permission: string) {
  return async (req: FastifyRequest): Promise<void> => {
    const user = (req as unknown as Record<string, unknown>).user as { role?: Role } | undefined;
    if (!user?.role || !hasPermission(user.role, permission)) {
      throw new AppError(403, 'Insufficient permissions', 'FORBIDDEN');
    }
  };
}
