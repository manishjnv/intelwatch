import { AppError } from '@etip/shared-utils';
import { randomUUID, randomBytes, createHmac } from 'crypto';
import type { AuditLogger } from './audit-logger.js';

/** Break-glass account record. */
export interface BreakGlassAccount {
  id: string;
  tenantId: string;
  recoveryCodes: string[];
  usedCodes: string[];
  totalCodesGenerated: number;
  createdAt: string;
  lastUsedAt: string | null;
  useCount: number;
}

/** Break-glass session (short-lived, non-renewable). */
export interface BreakGlassSession {
  sessionId: string;
  tenantId: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
}

const RECOVERY_CODE_COUNT = 5;

/**
 * In-memory break-glass service.
 * Provides offline emergency admin access that bypasses SSO and MFA.
 * Every use is audit-logged with a mandatory reason field.
 */
export class BreakGlassService {
  private accounts = new Map<string, BreakGlassAccount>();
  private sessions = new Map<string, BreakGlassSession>();
  private sessionTtlMinutes: number;
  private auditLogger: AuditLogger;

  constructor(auditLogger: AuditLogger, sessionTtlMinutes: number = 30) {
    this.auditLogger = auditLogger;
    this.sessionTtlMinutes = sessionTtlMinutes;
  }

  /** Setup break-glass account for a tenant. Returns plaintext recovery codes. */
  setup(tenantId: string, reason: string, adminUserId: string): { accountId: string; codes: string[] } {
    const existing = this.accounts.get(tenantId);
    if (existing && existing.recoveryCodes.length > 0) {
      throw new AppError(409, 'Break-glass account already exists — use rotate to get new codes', 'BREAK_GLASS_EXISTS');
    }

    const codes = this.generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const account: BreakGlassAccount = {
      id: randomUUID(),
      tenantId,
      recoveryCodes: codes.map((c) => this.hashCode(c)),
      usedCodes: [],
      totalCodesGenerated: RECOVERY_CODE_COUNT,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      useCount: 0,
    };
    this.accounts.set(tenantId, account);

    this.auditLogger.log({
      tenantId,
      userId: adminUserId,
      action: 'break_glass.setup',
      riskLevel: 'high',
      details: { accountId: account.id, codesGenerated: RECOVERY_CODE_COUNT, reason },
    });

    return { accountId: account.id, codes };
  }

  /** Login with a recovery code. Returns a short-lived session. */
  login(tenantId: string, code: string, reason: string, ip: string | null): BreakGlassSession {
    const account = this.accounts.get(tenantId);
    if (!account) {
      this.auditLogger.log({
        tenantId, userId: null,
        action: 'break_glass.login_failed',
        riskLevel: 'critical',
        details: { reason: 'No break-glass account configured', ip },
      });
      throw new AppError(404, 'Break-glass account not configured', 'BREAK_GLASS_NOT_FOUND');
    }

    const codeHash = this.hashCode(code);
    const idx = account.recoveryCodes.indexOf(codeHash);
    if (idx === -1) {
      this.auditLogger.log({
        tenantId, userId: null,
        action: 'break_glass.login_failed',
        riskLevel: 'critical',
        details: { reason: 'Invalid recovery code', ip },
      });
      throw new AppError(401, 'Invalid recovery code', 'BREAK_GLASS_INVALID_CODE');
    }

    // Consume the code (single-use)
    const updatedAccount: BreakGlassAccount = {
      ...account,
      recoveryCodes: account.recoveryCodes.filter((_, i) => i !== idx),
      usedCodes: [...account.usedCodes, codeHash],
      lastUsedAt: new Date().toISOString(),
      useCount: account.useCount + 1,
    };
    this.accounts.set(tenantId, updatedAccount);

    // Create non-renewable session
    const now = new Date();
    const session: BreakGlassSession = {
      sessionId: randomUUID(),
      tenantId,
      reason,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.sessionTtlMinutes * 60 * 1000).toISOString(),
    };
    this.sessions.set(session.sessionId, session);

    this.auditLogger.log({
      tenantId, userId: null,
      action: 'break_glass.login_success',
      riskLevel: 'critical',
      details: {
        sessionId: session.sessionId,
        reason,
        expiresAt: session.expiresAt,
        remainingCodes: updatedAccount.recoveryCodes.length,
        ip,
      },
    });

    return session;
  }

  /** Rotate recovery codes (invalidates existing ones). */
  rotateCodes(tenantId: string, reason: string, adminUserId: string): string[] {
    const account = this.accounts.get(tenantId);
    if (!account) {
      throw new AppError(404, 'Break-glass account not configured', 'BREAK_GLASS_NOT_FOUND');
    }

    const codes = this.generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const updated: BreakGlassAccount = {
      ...account,
      recoveryCodes: codes.map((c) => this.hashCode(c)),
      usedCodes: [],
      totalCodesGenerated: account.totalCodesGenerated + RECOVERY_CODE_COUNT,
    };
    this.accounts.set(tenantId, updated);

    this.auditLogger.log({
      tenantId,
      userId: adminUserId,
      action: 'break_glass.rotate',
      riskLevel: 'high',
      details: { reason, codesGenerated: RECOVERY_CODE_COUNT },
    });

    return codes;
  }

  /** Get break-glass usage log for a tenant. */
  getUsageLog(tenantId: string): { account: Record<string, unknown> | null; activeSessions: BreakGlassSession[] } {
    const account = this.accounts.get(tenantId);
    const activeSessions = Array.from(this.sessions.values())
      .filter((s) => s.tenantId === tenantId && new Date(s.expiresAt) > new Date());

    if (!account) return { account: null, activeSessions };

    return {
      account: {
        id: account.id,
        tenantId: account.tenantId,
        usedCodes: account.usedCodes,
        totalCodesGenerated: account.totalCodesGenerated,
        createdAt: account.createdAt,
        lastUsedAt: account.lastUsedAt,
        useCount: account.useCount,
        remainingCodes: account.recoveryCodes.length,
      },
      activeSessions,
    };
  }

  /** Check if a break-glass session is valid. */
  isSessionValid(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return new Date(session.expiresAt) > new Date();
  }

  /** Get remaining recovery codes count. */
  getRemainingCodes(tenantId: string): number {
    const account = this.accounts.get(tenantId);
    return account?.recoveryCodes.length ?? 0;
  }

  private generateRecoveryCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(`BG-${randomBytes(4).toString('hex').toUpperCase()}`);
    }
    return codes;
  }

  private hashCode(code: string): string {
    return createHmac('sha256', 'etip-break-glass-salt').update(code).digest('hex');
  }
}
