import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '@etip/shared-auth';
import type { JwtPayload } from '@etip/shared-types';
import { AppError } from '@etip/shared-utils';

export interface AuthenticatedRequest { user: JwtPayload; }

function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) throw new AppError(401, 'Missing Authorization header', 'UNAUTHORIZED');
  if (!authHeader.startsWith('Bearer ')) throw new AppError(401, 'Invalid Authorization format — expected Bearer token', 'UNAUTHORIZED');
  const token = authHeader.slice(7).trim();
  if (!token) throw new AppError(401, 'Empty Bearer token', 'UNAUTHORIZED');
  return token;
}

export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  const payload = verifyAccessToken(token);
  (req as FastifyRequest & AuthenticatedRequest).user = payload;
}

export async function optionalAuthenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return;
  try {
    const token = authHeader.slice(7).trim();
    if (token) { (req as FastifyRequest & AuthenticatedRequest).user = verifyAccessToken(token); }
  } catch { /* silently continue */ }
}

export function getUser(req: FastifyRequest): JwtPayload {
  const user = (req as FastifyRequest & AuthenticatedRequest).user;
  if (!user) throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
  return user;
}
