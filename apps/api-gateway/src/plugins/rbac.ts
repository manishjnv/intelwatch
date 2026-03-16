import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasPermission, hasAllPermissions, hasAnyPermission } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
import type { AuthenticatedRequest } from './auth.js';

export function rbac(permission: string): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const user = (req as FastifyRequest & AuthenticatedRequest).user;
    if (!user) throw new AppError(401, 'Authentication required before RBAC check', 'UNAUTHORIZED');
    if (!hasPermission(user.role, permission)) {
      throw new AppError(403, `Permission denied: requires ${permission}`, 'FORBIDDEN', { required: permission, role: user.role });
    }
  };
}

export function rbacAll(permissions: string[]): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const user = (req as FastifyRequest & AuthenticatedRequest).user;
    if (!user) throw new AppError(401, 'Authentication required before RBAC check', 'UNAUTHORIZED');
    if (!hasAllPermissions(user.role, permissions)) {
      throw new AppError(403, `Permission denied: requires all of [${permissions.join(', ')}]`, 'FORBIDDEN', { required: permissions, role: user.role });
    }
  };
}

export function rbacAny(permissions: string[]): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const user = (req as FastifyRequest & AuthenticatedRequest).user;
    if (!user) throw new AppError(401, 'Authentication required before RBAC check', 'UNAUTHORIZED');
    if (!hasAnyPermission(user.role, permissions)) {
      throw new AppError(403, `Permission denied: requires one of [${permissions.join(', ')}]`, 'FORBIDDEN', { required: permissions, role: user.role });
    }
  };
}
