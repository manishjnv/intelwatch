import { prisma } from './prisma.js';
import { sha256 } from '@etip/shared-utils';

/** Compatible with Prisma.InputJsonValue — avoids dependency on generated client types. */
type JsonInputValue = string | number | boolean | { [key: string]: JsonInputValue | null } | JsonInputValue[] | { toJSON(): unknown };

const GENESIS_HASH = '0'.repeat(64);

// ── Tenant Queries ───────────────────────────────────────────────────

export async function createTenant(data: { name: string; slug: string; plan?: 'free' | 'starter' | 'pro' | 'enterprise'; }) {
  return prisma.tenant.create({ data: { name: data.name, slug: data.slug, plan: data.plan ?? 'free' } });
}

export async function createTenantSubscription(data: {
  tenantId: string; plan: 'free' | 'starter' | 'pro' | 'enterprise';
  status: string; trialEndsAt?: Date;
}) {
  return prisma.tenantSubscription.create({
    data: {
      tenantId: data.tenantId,
      plan: data.plan,
      status: data.status,
      trialEndsAt: data.trialEndsAt ?? null,
    },
  });
}

export async function findTenantBySlug(slug: string) {
  return prisma.tenant.findUnique({ where: { slug } });
}

export async function findTenantById(id: string) {
  return prisma.tenant.findUnique({ where: { id } });
}

// ── User Queries ─────────────────────────────────────────────────────

export async function createUser(data: {
  tenantId: string; email: string; displayName: string; passwordHash?: string;
  role?: 'super_admin' | 'tenant_admin' | 'analyst';
  authProvider?: 'email' | 'google' | 'saml' | 'oidc'; authProviderId?: string;
  emailVerified?: boolean; active?: boolean; designation?: string;
}) {
  return prisma.user.create({
    data: {
      tenantId: data.tenantId, email: data.email, displayName: data.displayName,
      passwordHash: data.passwordHash, role: data.role ?? 'analyst',
      authProvider: data.authProvider ?? 'email', authProviderId: data.authProviderId,
      emailVerified: data.emailVerified ?? false,
      active: data.active ?? true,
      designation: data.designation,
    },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email, active: true }, include: { tenant: true } });
}

/** Find user by email including inactive/unverified (for login email-verified check) */
export async function findUserByEmailAnyStatus(email: string) {
  return prisma.user.findFirst({ where: { email }, include: { tenant: true } });
}

export async function findUserByEmailAndTenant(email: string, tenantId: string) {
  return prisma.user.findFirst({ where: { email, tenantId }, include: { tenant: true } });
}

/** Update SSO-synced fields (role, designation) on login */
export async function updateUserSsoFields(userId: string, role: string, designation: string | null) {
  return prisma.user.update({
    where: { id: userId },
    data: { role: role as 'super_admin' | 'tenant_admin' | 'analyst', designation },
  });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, include: { tenant: true } });
}

export async function findUserByIdAndTenant(id: string, tenantId: string) {
  return prisma.user.findFirst({ where: { id, tenantId, active: true }, include: { tenant: true } });
}

export async function updateUserLoginStats(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date(), loginCount: { increment: 1 } } });
}

export async function countUsersInTenant(tenantId: string) {
  return prisma.user.count({ where: { tenantId, active: true } });
}

// ── Session Queries ──────────────────────────────────────────────────

export async function createSession(data: {
  userId: string; tenantId: string; refreshTokenHash: string;
  ipAddress?: string; userAgent?: string; expiresAt: Date;
}) {
  return prisma.session.create({
    data: {
      userId: data.userId, tenantId: data.tenantId, refreshTokenHash: data.refreshTokenHash,
      ipAddress: data.ipAddress, userAgent: data.userAgent, expiresAt: data.expiresAt,
    },
  });
}

export async function findSessionById(id: string) {
  return prisma.session.findUnique({ where: { id }, include: { user: { include: { tenant: true } } } });
}

export async function revokeSession(sessionId: string) {
  return prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}

export async function updateSessionHash(sessionId: string, refreshTokenHash: string) {
  return prisma.session.update({ where: { id: sessionId }, data: { refreshTokenHash } });
}

export async function revokeAllUserSessions(userId: string) {
  return prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function deleteExpiredSessions() {
  return prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
  });
}

export async function findActiveSessionsByUser(userId: string) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, ipAddress: true, userAgent: true, createdAt: true,
      geoCountry: true, geoCity: true, geoIsp: true,
    },
  });
}

export async function updateSessionGeo(sessionId: string, geo: { geoCountry: string | null; geoCity: string | null; geoIsp: string | null }) {
  return prisma.session.update({ where: { id: sessionId }, data: geo });
}

export async function findLastSessionByUser(userId: string, excludeSessionId: string) {
  return prisma.session.findFirst({
    where: { userId, id: { not: excludeSessionId }, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, geoCountry: true, geoCity: true },
  });
}

// ── Audit Log Queries ────────────────────────────────────────────────

/** Compute hash chain: SHA-256(previousHash + JSON(entry)) */
export function computeHashChain(previousHash: string, entry: {
  action: string; userId?: string; tenantId: string; entityType: string;
  entityId?: string; changes?: unknown; timestamp: string;
}): string {
  return sha256(previousHash + JSON.stringify(entry));
}

export async function createAuditLog(data: {
  tenantId: string; userId?: string; action: string; entityType: string;
  entityId?: string; changes?: JsonInputValue; ipAddress?: string; userAgent?: string;
}) {
  return prisma.$transaction(async (tx) => {
    // Fetch last entry's hash for this tenant
    const lastEntry = await tx.auditLog.findFirst({
      where: { tenantId: data.tenantId },
      orderBy: { createdAt: 'desc' },
      select: { hashChain: true },
    });

    const previousHash = lastEntry?.hashChain ?? GENESIS_HASH;
    const now = new Date();
    const hashChain = computeHashChain(previousHash, {
      action: data.action, userId: data.userId, tenantId: data.tenantId,
      entityType: data.entityType, entityId: data.entityId,
      changes: data.changes ?? undefined, timestamp: now.toISOString(),
    });

    return tx.auditLog.create({
      data: {
        tenantId: data.tenantId, userId: data.userId, action: data.action,
        entityType: data.entityType, entityId: data.entityId,
        changes: data.changes ?? undefined, ipAddress: data.ipAddress,
        userAgent: data.userAgent, hashChain, createdAt: now,
      },
    });
  });
}

export async function findAuditLogById(id: string) {
  return prisma.auditLog.findUnique({ where: { id } });
}

export async function updateAuditLogReplication(id: string, externalRef: string) {
  return prisma.auditLog.update({
    where: { id },
    data: { externalRef, replicatedAt: new Date() },
  });
}

export interface AuditLogFilters {
  action?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export async function findAuditLogsByTenant(tenantId: string, filters: AuditLogFilters = {}) {
  const { action, userId, startDate, endDate, page = 1, limit = 50 } = filters;
  const where: Record<string, unknown> = { tenantId };
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }
  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function findAllAuditLogs(filters: AuditLogFilters = {}) {
  const { action, userId, startDate, endDate, page = 1, limit = 50 } = filters;
  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }
  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/** Fetch all audit logs for a tenant in chronological order (for integrity verification) */
export async function findAuditLogsChronological(tenantId?: string) {
  const where = tenantId ? { tenantId } : {};
  return prisma.auditLog.findMany({
    where, orderBy: { createdAt: 'asc' },
  });
}
