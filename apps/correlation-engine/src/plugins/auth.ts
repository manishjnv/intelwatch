import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, hasPermission } from '@etip/shared-auth';
import type { JwtPayload } from '@etip/shared-types';
import { AppError } from '@etip/shared-utils';

interface AuthenticatedRequest { user: JwtPayload; }

function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) throw new AppError(401, 'Missing Authorization header', 'UNAUTHORIZED');
  if (!authHeader.startsWith('Bearer ')) throw new AppError(401, 'Invalid authorization format', 'UNAUTHORIZED');
  const token = authHeader.slice(7).trim();
  if (!token) throw new AppError(401, 'Empty token', 'UNAUTHORIZED');
  return token;
}

export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  const payload = verifyAccessToken(token);
  (req as FastifyRequest & AuthenticatedRequest).user = payload;
}

export function getUser(req: FastifyRequest): JwtPayload {
  const user = (req as FastifyRequest & AuthenticatedRequest).user;
  if (!user) throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
  return user;
}

export function rbac(permission: string): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const user = (req as FastifyRequest & AuthenticatedRequest).user;
    if (!user) throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    if (!hasPermission(user.role, permission)) {
      throw new AppError(403, `Requires permission: ${permission}`, 'FORBIDDEN', { required: permission, role: user.role });
    }
  };
}
