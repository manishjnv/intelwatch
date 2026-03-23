import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, hasPermission } from '@etip/shared-auth';
import type { Role } from '@etip/shared-types';
import { AppError } from '@etip/shared-utils';

/** Extract Bearer token from Authorization header. */
function extractBearerToken(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing or invalid Authorization header', 'AUTH_REQUIRED');
  }
  return header.slice(7);
}

/** Authenticate preHandler — verifies JWT, sets req.user. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(req);
  const payload = verifyAccessToken(token);
  (req as unknown as Record<string, unknown>).user = payload;
}

/** Extract user from request. Throws 401 if not authenticated. */
export function getUser(req: FastifyRequest): {
  userId: string;
  tenantId: string;
  role: Role;
  permissions: string[];
} {
  const user = (req as unknown as Record<string, unknown>).user as {
    userId: string;
    tenantId: string;
    role: Role;
    permissions: string[];
  } | undefined;
  if (!user) {
    throw new AppError(401, 'User not authenticated', 'AUTH_REQUIRED');
  }
  return user;
}

/** RBAC preHandler factory. */
export function rbac(permission: string) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = getUser(req);
    if (!hasPermission(user.role, permission)) {
      throw new AppError(403, `Missing permission: ${permission}`, 'FORBIDDEN');
    }
  };
}
