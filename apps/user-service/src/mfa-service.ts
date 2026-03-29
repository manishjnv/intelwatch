/**
 * @module MfaService
 * @description TOTP MFA setup, verification, backup codes, and enforcement.
 * Uses otplib for TOTP generation/verification, AES-256-GCM for secret encryption,
 * bcryptjs for backup code hashing. Compliance: SOC 2 CC6.1, ISO 27001 A.9.4.2.
 */
import { generateSecret as otplibGenerateSecret, generateURI, verifySync } from 'otplib';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AppError } from '@etip/shared-utils';
import {
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  signMfaSetupToken,
  getJwtConfig,
} from '@etip/shared-auth';
import * as repo from './repository.js';
import * as mfaRepo from './mfa-repository.js';

const BCRYPT_ROUNDS = 12;
const BACKUP_CODE_COUNT = 10;
const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
const ISSUER = 'IntelWatch ETIP';

// ── TOTP helpers ─────────────────────────────────────────────────

/** Verify a TOTP token against a secret. ±1 window (30s) for clock drift. */
function verifyTotp(token: string, secret: string): boolean {
  const result = verifySync({ token, secret, epochTolerance: 30 });
  return result?.valid === true;
}

// ── Encryption for TOTP secrets ────────────────────────────────────

function getEncryptionKey(): Buffer {
  const key = process.env['TI_MFA_ENCRYPTION_KEY'];
  if (!key || key.length < 32) {
    throw new AppError(500, 'TI_MFA_ENCRYPTION_KEY must be at least 32 characters', 'CONFIG_ERROR');
  }
  return crypto.scryptSync(key, 'etip-mfa-salt', 32);
}

/** Encrypt a TOTP secret with AES-256-GCM */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Decrypt a TOTP secret from AES-256-GCM */
export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new AppError(500, 'Invalid encrypted MFA secret format', 'MFA_DECRYPT_ERROR');
  const iv = Buffer.from(parts[0]!, 'hex');
  const authTag = Buffer.from(parts[1]!, 'hex');
  const encrypted = Buffer.from(parts[2]!, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// ── Backup code generation ─────────────────────────────────────────

function generateBackupCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

async function generateBackupCodes(count: number = BACKUP_CODE_COUNT): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = generateBackupCode();
    plain.push(code);
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    hashed.push(await bcrypt.hash(code.replace('-', ''), salt));
  }
  return { plain, hashed };
}

// ── In-memory attempt tracking ─────────────────────────────────────

const challengeAttempts = new Map<string, number>();

function trackAttempt(mfaToken: string): number {
  const current = (challengeAttempts.get(mfaToken) ?? 0) + 1;
  challengeAttempts.set(mfaToken, current);
  if (challengeAttempts.size > 10000) {
    const entries = [...challengeAttempts.entries()];
    for (let i = 0; i < 5000; i++) {
      challengeAttempts.delete(entries[i]![0]);
    }
  }
  return current;
}

function isLocked(mfaToken: string): boolean {
  return (challengeAttempts.get(mfaToken) ?? 0) >= MFA_CHALLENGE_MAX_ATTEMPTS;
}

/** Reset attempt tracking — for testing only */
export function resetChallengeAttempts(): void {
  challengeAttempts.clear();
}

// ── Audit helper ───────────────────────────────────────────────────

/** Cast audit changes to Prisma's JsonInputValue-compatible shape */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const auditChanges = (obj: Record<string, unknown>) => obj as any;

// ── MFA Service ────────────────────────────────────────────────────

export class MfaService {

  async setupMfa(userId: string, tenantId: string, ipAddress: string, userAgent: string): Promise<{ secret: string; qrUri: string }> {
    const user = await mfaRepo.findUserForMfa(userId);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

    const secret = otplibGenerateSecret();
    const qrUri = generateURI({ issuer: ISSUER, label: user.email, secret });

    const encrypted = encryptSecret(secret);
    await mfaRepo.updateMfaSecret(userId, encrypted);

    await repo.createAuditLog({
      tenantId, userId, action: 'mfa.setup.initiated',
      entityType: 'user', entityId: userId, ipAddress, userAgent,
    });

    return { secret, qrUri };
  }

  async verifySetup(
    userId: string, tenantId: string, code: string,
    ipAddress: string, userAgent: string
  ): Promise<{ backupCodes: string[] }> {
    const user = await mfaRepo.findUserForMfa(userId);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    if (!user.mfaSecret) throw new AppError(400, 'MFA setup not initiated — call /mfa/setup first', 'MFA_NOT_INITIATED');

    const decrypted = decryptSecret(user.mfaSecret);
    if (!verifyTotp(code, decrypted)) {
      throw new AppError(401, 'Invalid TOTP code', 'MFA_CODE_INVALID');
    }

    const { plain, hashed } = await generateBackupCodes();
    await mfaRepo.enableMfa(userId, hashed);

    await repo.createAuditLog({
      tenantId, userId, action: 'mfa.setup.completed',
      entityType: 'user', entityId: userId,
      changes: auditChanges({ backupCodesGenerated: BACKUP_CODE_COUNT }),
      ipAddress, userAgent,
    });

    return { backupCodes: plain };
  }

  async disableMfa(
    userId: string, tenantId: string, code: string,
    actorId: string, actorRole: string,
    ipAddress: string, userAgent: string
  ): Promise<void> {
    const user = await mfaRepo.findUserForMfa(userId);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    if (!user.mfaEnabled) throw new AppError(400, 'MFA is not enabled', 'MFA_NOT_ENABLED');

    const isAdminOverride = actorId !== userId &&
      (actorRole === 'super_admin' || actorRole === 'tenant_admin');

    if (!isAdminOverride) {
      if (!user.mfaSecret) throw new AppError(500, 'MFA secret missing', 'INTERNAL_ERROR');
      const decrypted = decryptSecret(user.mfaSecret);
      if (!verifyTotp(code, decrypted)) {
        throw new AppError(401, 'Invalid TOTP code — cannot disable MFA', 'MFA_CODE_INVALID');
      }
    }

    await mfaRepo.disableMfa(userId);

    await repo.createAuditLog({
      tenantId, userId: actorId, action: 'mfa.disabled',
      entityType: 'user', entityId: userId,
      changes: auditChanges({ disabledBy: isAdminOverride ? 'admin' : 'self', actorId }),
      ipAddress, userAgent,
    });
  }

  async checkMfaRequired(
    userId: string, tenantId: string
  ): Promise<{ mfaRequired: boolean; mfaSetupRequired: boolean; mfaToken?: string; setupToken?: string }> {
    const user = await mfaRepo.findUserForMfa(userId);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

    const jwtSecret = getJwtConfig().secret;

    if (user.mfaEnabled) {
      const mfaToken = signMfaChallengeToken(userId, tenantId, jwtSecret);
      return { mfaRequired: true, mfaSetupRequired: false, mfaToken };
    }

    const enforced = await this._isEnforcedForUser(tenantId);
    if (enforced) {
      const setupToken = signMfaSetupToken(userId, tenantId, user.email, jwtSecret);
      return { mfaRequired: false, mfaSetupRequired: true, setupToken };
    }

    return { mfaRequired: false, mfaSetupRequired: false };
  }

  async verifyChallenge(
    mfaToken: string, code: string,
    ipAddress: string, userAgent: string
  ): Promise<{ userId: string; tenantId: string; backupCodesRemaining?: number; warning?: string }> {
    const jwtSecret = getJwtConfig().secret;

    if (isLocked(mfaToken)) {
      throw new AppError(401, 'MFA challenge locked — too many failed attempts. Please login again.', 'MFA_CHALLENGE_LOCKED');
    }

    const payload = verifyMfaChallengeToken(mfaToken, jwtSecret);
    const user = await mfaRepo.findUserForMfa(payload.sub);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new AppError(400, 'MFA is not enabled for this user', 'MFA_NOT_ENABLED');
    }

    // Try TOTP first (6-digit code)
    const isTotp = /^\d{6}$/.test(code);
    if (isTotp) {
      const decrypted = decryptSecret(user.mfaSecret);
      if (!verifyTotp(code, decrypted)) {
        const attempts = trackAttempt(mfaToken);
        if (attempts >= MFA_CHALLENGE_MAX_ATTEMPTS) {
          await repo.createAuditLog({
            tenantId: payload.tenantId, userId: payload.sub, action: 'mfa.challenge.locked',
            entityType: 'session', changes: auditChanges({ attempts }),
            ipAddress, userAgent,
          });
          throw new AppError(401, 'MFA challenge locked — too many failed attempts', 'MFA_CHALLENGE_LOCKED');
        }
        await repo.createAuditLog({
          tenantId: payload.tenantId, userId: payload.sub, action: 'mfa.challenge.failed',
          entityType: 'session', changes: auditChanges({ attempts }),
          ipAddress, userAgent,
        });
        throw new AppError(401, 'Invalid MFA code', 'MFA_CODE_INVALID');
      }

      await repo.createAuditLog({
        tenantId: payload.tenantId, userId: payload.sub, action: 'mfa.challenge.success',
        entityType: 'session', ipAddress, userAgent,
      });

      return { userId: payload.sub, tenantId: payload.tenantId };
    }

    // Try backup code
    return this._verifyBackupCode(user, payload, code, ipAddress, userAgent, mfaToken);
  }

  private async _verifyBackupCode(
    user: { id: string; mfaBackupCodes: string[] },
    payload: { sub: string; tenantId: string },
    code: string, ipAddress: string, userAgent: string, mfaToken: string
  ): Promise<{ userId: string; tenantId: string; backupCodesRemaining?: number; warning?: string }> {
    const normalizedCode = code.replace('-', '');
    let matchIndex = -1;

    for (let i = 0; i < user.mfaBackupCodes.length; i++) {
      const match = await bcrypt.compare(normalizedCode, user.mfaBackupCodes[i]!);
      if (match) { matchIndex = i; break; }
    }

    if (matchIndex === -1) {
      const attempts = trackAttempt(mfaToken);
      if (attempts >= MFA_CHALLENGE_MAX_ATTEMPTS) {
        await repo.createAuditLog({
          tenantId: payload.tenantId, userId: payload.sub, action: 'mfa.challenge.locked',
          entityType: 'session', changes: auditChanges({ attempts }),
          ipAddress, userAgent,
        });
        throw new AppError(401, 'MFA challenge locked — too many failed attempts', 'MFA_CHALLENGE_LOCKED');
      }
      await repo.createAuditLog({
        tenantId: payload.tenantId, userId: payload.sub, action: 'mfa.challenge.failed',
        entityType: 'session', changes: auditChanges({ attempts, type: 'backup_code' }),
        ipAddress, userAgent,
      });
      throw new AppError(401, 'Invalid MFA code', 'MFA_CODE_INVALID');
    }

    const remaining = [...user.mfaBackupCodes];
    remaining.splice(matchIndex, 1);
    await mfaRepo.updateBackupCodes(user.id, remaining);

    await repo.createAuditLog({
      tenantId: payload.tenantId, userId: payload.sub, action: 'mfa.backup_code.used',
      entityType: 'session', changes: auditChanges({ codesRemaining: remaining.length }),
      ipAddress, userAgent,
    });

    const result: { userId: string; tenantId: string; backupCodesRemaining?: number; warning?: string } = {
      userId: payload.sub, tenantId: payload.tenantId, backupCodesRemaining: remaining.length,
    };
    if (remaining.length <= 2) result.warning = 'Regenerate backup codes soon';
    return result;
  }

  async regenerateBackupCodes(
    userId: string, tenantId: string, code: string,
    ipAddress: string, userAgent: string
  ): Promise<{ backupCodes: string[] }> {
    const user = await mfaRepo.findUserForMfa(userId);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new AppError(400, 'MFA is not enabled', 'MFA_NOT_ENABLED');
    }

    const decrypted = decryptSecret(user.mfaSecret);
    if (!verifyTotp(code, decrypted)) {
      throw new AppError(401, 'Invalid TOTP code', 'MFA_CODE_INVALID');
    }

    const { plain, hashed } = await generateBackupCodes();
    await mfaRepo.updateBackupCodes(userId, hashed);

    await repo.createAuditLog({
      tenantId, userId, action: 'mfa.backup_codes.regenerated',
      entityType: 'user', entityId: userId,
      changes: auditChanges({ newCodesCount: BACKUP_CODE_COUNT }),
      ipAddress, userAgent,
    });

    return { backupCodes: plain };
  }

  async setPlatformEnforcement(
    enforced: boolean, enforcedBy: string, tenantId: string,
    ipAddress: string, userAgent: string
  ): Promise<{ enforced: boolean }> {
    await mfaRepo.upsertEnforcementPolicy(null, 'platform', enforced, enforcedBy);

    await repo.createAuditLog({
      tenantId, userId: enforcedBy, action: 'mfa.enforcement.changed',
      entityType: 'mfa_policy',
      changes: auditChanges({ scope: 'platform', enforced }),
      ipAddress, userAgent,
    });

    return { enforced };
  }

  async getPlatformEnforcement(): Promise<{ enforced: boolean; enforcedBy?: string; enforcedAt?: Date }> {
    const policy = await mfaRepo.findEnforcementPolicy(null);
    if (!policy) return { enforced: false };
    return { enforced: policy.enforced, enforcedBy: policy.enforcedBy, enforcedAt: policy.enforcedAt };
  }

  async setOrgEnforcement(
    tenantId: string, enforced: boolean, enforcedBy: string,
    ipAddress: string, userAgent: string
  ): Promise<{ enforced: boolean }> {
    await mfaRepo.upsertEnforcementPolicy(tenantId, 'org', enforced, enforcedBy);

    await repo.createAuditLog({
      tenantId, userId: enforcedBy, action: 'mfa.enforcement.changed',
      entityType: 'mfa_policy',
      changes: auditChanges({ scope: 'org', tenantId, enforced }),
      ipAddress, userAgent,
    });

    return { enforced };
  }

  async getOrgEnforcement(tenantId: string): Promise<{ enforced: boolean; enforcedBy?: string; enforcedAt?: Date }> {
    const policy = await mfaRepo.findEnforcementPolicy(tenantId);
    if (!policy) return { enforced: false };
    return { enforced: policy.enforced, enforcedBy: policy.enforcedBy, enforcedAt: policy.enforcedAt };
  }

  private async _isEnforcedForUser(tenantId: string): Promise<boolean> {
    const platform = await mfaRepo.findEnforcementPolicy(null);
    if (platform?.enforced) return true;
    const org = await mfaRepo.findEnforcementPolicy(tenantId);
    return org?.enforced ?? false;
  }
}
