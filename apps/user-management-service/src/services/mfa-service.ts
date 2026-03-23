import { AppError } from '@etip/shared-utils';
import { randomBytes, createHmac } from 'crypto';
import type { MfaPolicy } from '../schemas/user-management.js';

/** MFA enrollment record. */
export interface MfaEnrollment {
  userId: string;
  tenantId: string;
  secret: string;
  enabled: boolean;
  backupCodes: string[];
  usedBackupCodes: string[];
  enrolledAt: string | null;
  lastVerifiedAt: string | null;
}

/**
 * In-memory MFA service for TOTP authentication.
 * Manages secret generation, code verification, backup codes, and enforcement policies.
 */
export class MfaService {
  private enrollments = new Map<string, MfaEnrollment>();
  private policies = new Map<string, MfaPolicy>();
  private issuer: string;
  private backupCodeCount: number;

  constructor(issuer: string = 'ETIP Platform', backupCodeCount: number = 10) {
    this.issuer = issuer;
    this.backupCodeCount = backupCodeCount;
  }

  /** Begin MFA setup: generate secret and OTP auth URL. */
  setup(userId: string, tenantId: string, userEmail: string): { secret: string; otpauthUrl: string; qrDataUrl: string } {
    const secret = this.generateSecret();
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(this.issuer)}:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=${encodeURIComponent(this.issuer)}&algorithm=SHA1&digits=6&period=30`;
    const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;

    const enrollment: MfaEnrollment = {
      userId, tenantId, secret, enabled: false,
      backupCodes: [], usedBackupCodes: [],
      enrolledAt: null, lastVerifiedAt: null,
    };
    this.enrollments.set(this.key(userId, tenantId), enrollment);

    return { secret, otpauthUrl, qrDataUrl };
  }

  /** Verify a TOTP code and enable MFA if valid. */
  verifyAndEnable(userId: string, tenantId: string, code: string): { enabled: boolean; backupCodes: string[] } {
    const enrollment = this.getEnrollment(userId, tenantId);
    if (enrollment.enabled) {
      throw new AppError(400, 'MFA is already enabled', 'MFA_ALREADY_ENABLED');
    }

    if (!this.verifyTotpCode(enrollment.secret, code)) {
      throw new AppError(401, 'Invalid TOTP code', 'MFA_INVALID_CODE');
    }

    const backupCodes = this.generateBackupCodes(this.backupCodeCount);
    const updated: MfaEnrollment = {
      ...enrollment,
      enabled: true,
      backupCodes: backupCodes.map((c) => this.hashCode(c)),
      usedBackupCodes: [],
      enrolledAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
    };
    this.enrollments.set(this.key(userId, tenantId), updated);

    return { enabled: true, backupCodes };
  }

  /** Validate a TOTP code on login (MFA already enabled). */
  validate(userId: string, tenantId: string, code: string): boolean {
    const enrollment = this.getEnrollment(userId, tenantId);
    if (!enrollment.enabled) {
      throw new AppError(400, 'MFA is not enabled', 'MFA_NOT_ENABLED');
    }

    const valid = this.verifyTotpCode(enrollment.secret, code);
    if (valid) {
      this.enrollments.set(this.key(userId, tenantId), {
        ...enrollment, lastVerifiedAt: new Date().toISOString(),
      });
    }
    return valid;
  }

  /** Verify a backup code (consumes it on success). */
  verifyBackupCode(userId: string, tenantId: string, code: string): boolean {
    const enrollment = this.getEnrollment(userId, tenantId);
    if (!enrollment.enabled) {
      throw new AppError(400, 'MFA is not enabled', 'MFA_NOT_ENABLED');
    }

    const codeHash = this.hashCode(code);
    const idx = enrollment.backupCodes.indexOf(codeHash);
    if (idx === -1) return false;

    const updated: MfaEnrollment = {
      ...enrollment,
      backupCodes: enrollment.backupCodes.filter((_, i) => i !== idx),
      usedBackupCodes: [...enrollment.usedBackupCodes, codeHash],
      lastVerifiedAt: new Date().toISOString(),
    };
    this.enrollments.set(this.key(userId, tenantId), updated);
    return true;
  }

  /** Disable MFA for a user. */
  disable(userId: string, tenantId: string): void {
    const k = this.key(userId, tenantId);
    if (!this.enrollments.has(k)) {
      throw new AppError(404, 'MFA enrollment not found', 'MFA_NOT_FOUND');
    }
    this.enrollments.delete(k);
  }

  /** Regenerate backup codes (requires MFA enabled). */
  regenerateBackupCodes(userId: string, tenantId: string): string[] {
    const enrollment = this.getEnrollment(userId, tenantId);
    if (!enrollment.enabled) {
      throw new AppError(400, 'MFA is not enabled', 'MFA_NOT_ENABLED');
    }

    const newCodes = this.generateBackupCodes(this.backupCodeCount);
    this.enrollments.set(this.key(userId, tenantId), {
      ...enrollment,
      backupCodes: newCodes.map((c) => this.hashCode(c)),
      usedBackupCodes: [],
    });
    return newCodes;
  }

  /** Check if MFA is enabled for a user. */
  isEnabled(userId: string, tenantId: string): boolean {
    const enrollment = this.enrollments.get(this.key(userId, tenantId));
    return enrollment?.enabled ?? false;
  }

  /** Get remaining backup code count. */
  getRemainingBackupCodes(userId: string, tenantId: string): number {
    const enrollment = this.enrollments.get(this.key(userId, tenantId));
    return enrollment?.backupCodes.length ?? 0;
  }

  /** Set MFA enforcement policy for a tenant. */
  setPolicy(tenantId: string, policy: MfaPolicy): MfaPolicy {
    this.policies.set(tenantId, policy);
    return policy;
  }

  /** Get MFA enforcement policy for a tenant. */
  getPolicy(tenantId: string): MfaPolicy {
    return this.policies.get(tenantId) ?? { enforcement: 'optional', gracePeriodDays: 7 };
  }

  /** Check if MFA is required for a user based on tenant policy. */
  isRequired(tenantId: string): boolean {
    const policy = this.getPolicy(tenantId);
    return policy.enforcement === 'required';
  }

  private getEnrollment(userId: string, tenantId: string): MfaEnrollment {
    const enrollment = this.enrollments.get(this.key(userId, tenantId));
    if (!enrollment) {
      throw new AppError(404, 'MFA enrollment not found — run setup first', 'MFA_NOT_FOUND');
    }
    return enrollment;
  }

  private key(userId: string, tenantId: string): string {
    return `${tenantId}:${userId}`;
  }

  private generateSecret(): string {
    return randomBytes(20).toString('hex').toUpperCase().slice(0, 32);
  }

  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(randomBytes(4).toString('hex').toUpperCase().slice(0, 8));
    }
    return codes;
  }

  private hashCode(code: string): string {
    return createHmac('sha256', 'etip-backup-code-salt').update(code).digest('hex');
  }

  /**
   * Simplified TOTP verification (time-based, 30s window, ±1 step tolerance).
   * In production, use a proper TOTP library (otpauth).
   */
  private verifyTotpCode(secret: string, code: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    for (let offset = -1; offset <= 1; offset++) {
      const counter = Math.floor((now + offset * 30) / 30);
      const generated = this.generateTotp(secret, counter);
      if (generated === code) return true;
    }
    return false;
  }

  private generateTotp(secret: string, counter: number): string {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const hmac = createHmac('sha1', Buffer.from(secret, 'hex'));
    hmac.update(buffer);
    const hash = hmac.digest();
    const lastByte = hash[hash.length - 1];
    if (lastByte === undefined) return '000000';
    const offset = lastByte & 0x0f;
    const b0 = hash[offset];
    const b1 = hash[offset + 1];
    const b2 = hash[offset + 2];
    const b3 = hash[offset + 3];
    if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) return '000000';
    const code = ((b0 & 0x7f) << 24 | b1 << 16 | b2 << 8 | b3) % 1000000;
    return code.toString().padStart(6, '0');
  }
}
