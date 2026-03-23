import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, hasPermission } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';

function extractBearerToken(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing or invalid Authorization header', 'AUTH_REQUIRED');
  }
  return header.slice(7);
}

/** Verify JWT and attach user to request. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(req);
  const payload = verifyAccessToken(token);
  (req as unknown as Record<string, unknown>).user = payload;
}

/** Extract the authenticated user from the request. */
export function getUser(req: FastifyRequest): {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
} {
  const user = (req as unknown as Record<string, unknown>).user as
    | { userId: string; tenantId: string; role: string; permissions: string[] }
    | undefined;
  if (!user) throw new AppError(401, 'User not authenticated', 'AUTH_REQUIRED');
  return user;
}

/** RBAC factory — returns a preHandler that checks a specific permission. */
export function rbac(permission: string) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = getUser(req);
    if (!hasPermission(user.role as Parameters<typeof hasPermission>[0], permission)) {
      throw new AppError(403, `Missing permission: ${permission}`, 'FORBIDDEN');
    }
  };
}
