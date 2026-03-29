/**
 * @module mfa-repository
 * @description Prisma queries for MFA-specific user fields and enforcement policies.
 */
import { prisma } from './prisma.js';

/** Fetch user with MFA-relevant fields only */
export async function findUserForMfa(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      tenantId: true,
      mfaEnabled: true,
      mfaSecret: true,
      mfaBackupCodes: true,
      mfaVerifiedAt: true,
    },
  });
}

/** Store encrypted TOTP secret (setup initiated, not yet verified) */
export async function updateMfaSecret(userId: string, encryptedSecret: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: encryptedSecret },
  });
}

/** Enable MFA after TOTP verification — set flag, timestamp, backup codes */
export async function enableMfa(userId: string, hashedBackupCodes: string[]) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaVerifiedAt: new Date(),
      mfaBackupCodes: hashedBackupCodes,
    },
  });
}

/** Disable MFA — clear all MFA fields */
export async function disableMfa(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: [],
      mfaVerifiedAt: null,
    },
  });
}

/** Update backup codes array (after use or regeneration) */
export async function updateBackupCodes(userId: string, hashedCodes: string[]) {
  return prisma.user.update({
    where: { id: userId },
    data: { mfaBackupCodes: hashedCodes },
  });
}

// ── Enforcement Policies ─────────────────────────────────────────

/** Find enforcement policy by tenantId (null = platform-wide) */
export async function findEnforcementPolicy(tenantId: string | null) {
  if (tenantId === null) {
    // Platform-wide: tenantId IS NULL
    return prisma.mfaEnforcementPolicy.findFirst({
      where: { tenantId: null, scope: 'platform' },
    });
  }
  return prisma.mfaEnforcementPolicy.findUnique({
    where: { tenantId },
  });
}

/** Upsert enforcement policy */
export async function upsertEnforcementPolicy(
  tenantId: string | null,
  scope: string,
  enforced: boolean,
  enforcedBy: string
) {
  if (tenantId === null) {
    // Platform-wide — upsert by scope (find first, then create or update)
    const existing = await prisma.mfaEnforcementPolicy.findFirst({
      where: { tenantId: null, scope: 'platform' },
    });
    if (existing) {
      return prisma.mfaEnforcementPolicy.update({
        where: { id: existing.id },
        data: { enforced, enforcedBy, enforcedAt: new Date() },
      });
    }
    return prisma.mfaEnforcementPolicy.create({
      data: { tenantId: null, scope, enforced, enforcedBy },
    });
  }

  // Org-level — upsert by unique tenantId
  return prisma.mfaEnforcementPolicy.upsert({
    where: { tenantId },
    create: { tenantId, scope, enforced, enforcedBy },
    update: { enforced, enforcedBy, enforcedAt: new Date() },
  });
}
