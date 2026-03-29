/**
 * @module email-verification-repository
 * @description Prisma queries for email verification fields on User model.
 */
import { prisma } from './prisma.js';

/** Find user by hashed verification token */
export async function findByVerifyToken(tokenHash: string) {
  return prisma.user.findFirst({
    where: { emailVerifyToken: tokenHash },
    select: {
      id: true, email: true, tenantId: true,
      emailVerified: true, emailVerifyToken: true, emailVerifyExpires: true,
      active: true, createdAt: true,
    },
  });
}

/** Find unverified user by email (for resend flow) */
export async function findUnverifiedByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, emailVerified: false },
    select: {
      id: true, email: true, tenantId: true,
      emailVerifyToken: true, emailVerifyExpires: true, createdAt: true,
      tenant: { select: { name: true } },
    },
  });
}

/** Store verification token hash and expiry */
export async function setVerifyToken(userId: string, tokenHash: string, expiresAt: Date) {
  return prisma.user.update({
    where: { id: userId },
    data: { emailVerifyToken: tokenHash, emailVerifyExpires: expiresAt },
  });
}

/** Mark email as verified, activate user, clear token */
export async function markVerified(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      emailVerified: true,
      active: true,
      emailVerifyToken: null,
      emailVerifyExpires: null,
    },
  });
}

/** Delete unverified users older than the given date */
export async function deleteUnverifiedBefore(cutoffDate: Date) {
  return prisma.user.deleteMany({
    where: {
      emailVerified: false,
      createdAt: { lt: cutoffDate },
    },
  });
}
