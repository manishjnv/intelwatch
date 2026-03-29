import { prisma } from './prisma.js';

/** Compatible with Prisma.InputJsonValue — avoids dependency on generated client types. */
type JsonInputValue = string | number | boolean | { [key: string]: JsonInputValue | null } | JsonInputValue[] | { toJSON(): unknown };

// ── Tenant Queries ───────────────────────────────────────────────────

export async function createTenant(data: { name: string; slug: string; plan?: 'free' | 'pro' | 'enterprise'; }) {
  return prisma.tenant.create({ data: { name: data.name, slug: data.slug, plan: data.plan ?? 'free' } });
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
}) {
  return prisma.user.create({
    data: {
      tenantId: data.tenantId, email: data.email, displayName: data.displayName,
      passwordHash: data.passwordHash, role: data.role ?? 'analyst',
      authProvider: data.authProvider ?? 'email', authProviderId: data.authProviderId,
    },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email, active: true }, include: { tenant: true } });
}

export async function findUserByEmailAndTenant(email: string, tenantId: string) {
  return prisma.user.findFirst({ where: { email, tenantId, active: true }, include: { tenant: true } });
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

// ── Audit Log Queries ────────────────────────────────────────────────

export async function createAuditLog(data: {
  tenantId: string; userId?: string; action: string; entityType: string;
  entityId?: string; changes?: JsonInputValue; ipAddress?: string; userAgent?: string;
}) {
  return prisma.auditLog.create({
    data: {
      tenantId: data.tenantId, userId: data.userId, action: data.action,
      entityType: data.entityType, entityId: data.entityId,
      changes: data.changes ?? undefined, ipAddress: data.ipAddress, userAgent: data.userAgent,
    },
  });
}
