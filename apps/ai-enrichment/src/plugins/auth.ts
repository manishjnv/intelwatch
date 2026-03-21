import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '@etip/shared-auth';
import type { JwtPayload } from '@etip/shared-types';
import { AppError } from '@etip/shared-utils';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing or invalid Authorization header', 'UNAUTHORIZED');
  }
  const token = authHeader.slice(7);
  req.user = verifyAccessToken(token);
}

export function getUser(req: FastifyRequest): JwtPayload {
  if (!req.user) throw new AppError(401, 'Not authenticated', 'UNAUTHORIZED');
  return req.user;
}

export function rbac(...allowedRoles: string[]) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const user = getUser(req);
    if (!allowedRoles.includes(user.role)) {
      throw new AppError(403, `Role '${user.role}' not authorized`, 'FORBIDDEN');
    }
  };
}
