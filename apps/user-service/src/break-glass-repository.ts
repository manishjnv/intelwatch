/**
 * @module break-glass-repository
 * @description Prisma queries for break-glass emergency account operations.
 */
import { prisma } from './prisma.js';

/** Find the break-glass user (system-wide, there's only one) */
export async function findBreakGlassUser() {
  return prisma.user.findFirst({
    where: { isBreakGlass: true },
    include: { tenant: true },
  });
}

/** Find break-glass user by email (for login) */
export async function findBreakGlassUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, isBreakGlass: true },
    include: { tenant: true },
  });
}

/** Update break-glass usage stats after successful login */
export async function updateBreakGlassStats(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      breakGlassLastUsed: new Date(),
      breakGlassUseCount: { increment: 1 },
      lastLoginAt: new Date(),
      loginCount: { increment: 1 },
    },
  });
}

/** Update break-glass password hash */
export async function updateBreakGlassPassword(userId: string, passwordHash: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

/** Create a break-glass session (30-min, non-renewable) */
export async function createBreakGlassSession(data: {
  userId: string; tenantId: string;
  ipAddress: string; userAgent: string; expiresAt: Date;
}) {
  return prisma.session.create({
    data: {
      userId: data.userId, tenantId: data.tenantId,
      refreshTokenHash: 'break-glass-no-refresh',
      ipAddress: data.ipAddress, userAgent: data.userAgent,
      expiresAt: data.expiresAt,
      breakGlassSession: true,
    },
  });
}

/** Find active (non-revoked, non-expired) break-glass session */
export async function findActiveBreakGlassSession() {
  return prisma.session.findFirst({
    where: {
      breakGlassSession: true,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Terminate all active break-glass sessions. Returns count terminated. */
export async function terminateBreakGlassSessions(): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      breakGlassSession: true,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/** Find break-glass audit entries (actions starting with 'break_glass.') */
export async function findBreakGlassAuditEntries(limit: number, offset: number) {
  return prisma.auditLog.findMany({
    where: {
      action: { startsWith: 'break_glass.' },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

/** Check if a session is a break-glass session */
export async function isBreakGlassSession(sessionId: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { breakGlassSession: true },
  });
  return session?.breakGlassSession === true;
}
