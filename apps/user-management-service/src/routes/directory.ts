import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { SafeParseReturnType } from 'zod';
import { AppError } from '@etip/shared-utils';
import { hasPermission, PERMISSIONS } from '@etip/shared-auth';
import type { Role } from '@etip/shared-types';
import { prisma } from '../prisma.js';
import { UserDirectoryQuerySchema, DirectoryAuditQuerySchema } from '../schemas/user-management.js';

/**
 * ponytail: GET-route query validation in this service bypasses the shared
 * ZodError→400 mapping (confirmed pre-existing on teams.ts too — Fastify's
 * preValidation phase for querystring swallows it before setErrorHandler
 * sees it), so `.parse()` on `req.query` here surfaces as a 500. Parsing
 * explicitly and throwing AppError keeps this route correct without
 * touching the shared error-handler plugin other routes rely on.
 */
function unwrap<Input, Output>(result: SafeParseReturnType<Input, Output>): Output {
  if (!result.success) {
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', result.error.issues);
  }
  return result.data;
}

/** Tenant ONLY from x-tenant-id (nginx overwrites it from the verified JWT). Never 'default'. */
function requireTenant(req: FastifyRequest): string {
  const tenantId = req.headers['x-tenant-id'] as string | undefined;
  if (!tenantId) throw new AppError(401, 'Missing tenant context', 'UNAUTHORIZED');
  return tenantId;
}

function requirePermission(req: FastifyRequest, permission: string): void {
  const role = req.headers['x-user-role'] as Role | undefined;
  if (!role || !hasPermission(role, permission)) {
    throw new AppError(403, 'Insufficient permissions', 'FORBIDDEN');
  }
}

/** Derive a UI-facing status from Prisma User fields — no `status` column exists on the model. */
function deriveStatus(active: boolean, lastLoginAt: Date | null): 'active' | 'locked' | 'invited' {
  if (!active) return 'locked';
  if (!lastLoginAt) return 'invited';
  return 'active';
}

/** Build the Prisma where-clause for the derived status filter (keeps pagination/total accurate). */
function statusWhere(status: 'active' | 'locked' | 'invited' | undefined): Prisma.UserWhereInput {
  if (status === 'locked') return { active: false };
  if (status === 'invited') return { active: true, lastLoginAt: null };
  if (status === 'active') return { active: true, lastLoginAt: { not: null } };
  return {};
}

/**
 * User directory routes — GET /, /stats, /audit.
 * Registered AFTER teams/roles/sessions/etc. in app.ts; paths are distinct so
 * registration order doesn't affect matching, it just documents intent (S162).
 */
export function directoryRoutes() {
  return async function (app: FastifyInstance): Promise<void> {
    /** GET / — paginated tenant user directory (Prisma User). */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = requireTenant(req);
      requirePermission(req, PERMISSIONS.USER_READ);
      const query = unwrap(UserDirectoryQuerySchema.safeParse(req.query));

      const where: Prisma.UserWhereInput = { tenantId, ...statusWhere(query.status) };
      if (query.role) where.role = query.role;
      if (query.search) {
        where.OR = [
          { email: { contains: query.search, mode: 'insensitive' } },
          { displayName: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true, displayName: true, email: true, role: true,
            active: true, lastLoginAt: true, mfaEnabled: true, createdAt: true,
          },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where }),
      ]);

      const data = users.map((u) => ({
        id: u.id,
        name: u.displayName,
        email: u.email,
        role: u.role,
        team: null as string | null, // ponytail: no Team model in Prisma schema; team-store.ts is a separate in-memory store
        status: deriveStatus(u.active, u.lastLoginAt),
        lastLogin: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        mfaEnabled: u.mfaEnabled,
        createdAt: u.createdAt.toISOString(),
      }));

      return reply.send({ data, total, page: query.page, limit: query.limit });
    });

    /** GET /stats — tenant user-management counters. */
    app.get('/stats', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = requireTenant(req);
      requirePermission(req, PERMISSIONS.USER_READ);

      const [totalUsers, mfaEnabledCount, activeSessions] = await Promise.all([
        prisma.user.count({ where: { tenantId } }),
        prisma.user.count({ where: { tenantId, mfaEnabled: true } }),
        prisma.session.count({ where: { tenantId, revokedAt: null, expiresAt: { gt: new Date() } } }),
      ]);

      const stats = {
        totalUsers,
        activeSessions,
        teams: 0, // ponytail: no Team model in Prisma schema — wire when teams are persisted, not in-memory
        roles: 0, // ponytail: Role is a fixed 3-value Prisma enum, not a configurable resource with a count
        mfaPercent: totalUsers > 0 ? Math.round((mfaEnabledCount / totalUsers) * 100) : 0,
      };
      return reply.send({ data: stats });
    });

    /** GET /audit — paginated tenant audit log (Prisma AuditLog), newest first. */
    app.get('/audit', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = requireTenant(req);
      requirePermission(req, PERMISSIONS.AUDIT_READ);
      const query = unwrap(DirectoryAuditQuerySchema.safeParse(req.query));

      const where: Prisma.AuditLogWhereInput = { tenantId };
      if (query.action) where.action = query.action;

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          select: {
            id: true, action: true, entityType: true, entityId: true,
            changes: true, ipAddress: true, createdAt: true,
            user: { select: { displayName: true } },
          },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.auditLog.count({ where }),
      ]);

      const data = logs.map((l) => ({
        id: l.id,
        timestamp: l.createdAt.toISOString(),
        userName: l.user?.displayName ?? 'system',
        action: l.action,
        resource: l.entityId ? `${l.entityType}:${l.entityId}` : l.entityType,
        ip: l.ipAddress ?? '',
        details: l.changes ? JSON.stringify(l.changes) : '',
      }));

      return reply.send({ data, total, page: query.page, limit: query.limit });
    });
  };
}
