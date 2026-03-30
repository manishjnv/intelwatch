/**
 * @module BreakGlassService
 * @description Emergency break-glass account login, session management, and admin operations.
 * OTP-verified, 30-minute non-renewable sessions, critical audit trail.
 * Compliance: SOC 2 CC6.1, NIST 800-53 AC-2(2).
 */
import { verifySync } from 'otplib';
import { AppError } from '@etip/shared-utils';
import { verifyPassword, hashPassword, signAccessToken } from '@etip/shared-auth';
import { SYSTEM_TENANT_ID } from '@etip/shared-auth';
import { BREAK_GLASS_AUDIT_EVENTS } from '@etip/shared-types';
import type { BreakGlassAlertPayload } from '@etip/shared-types';
import type { Role } from '@etip/shared-types';
import * as repo from './repository.js';
import * as bgRepo from './break-glass-repository.js';
import { enrichSessionGeo } from './geoip.js';

const BREAK_GLASS_SESSION_TTL = 1800; // 30 minutes in seconds
const MAX_ATTEMPTS = 3;
const LOCKOUT_WINDOW = 15 * 60 * 1000; // 15 minutes in ms

/** In-memory rate limiter for break-glass login attempts (per IP) */
const attemptTracker = new Map<string, { count: number; firstAttempt: number }>();

/** Verify TOTP against env-stored secret */
function verifyBreakGlassOtp(otp: string): boolean {
  const secret = process.env['TI_BREAK_GLASS_OTP_SECRET'];
  if (!secret) {
    throw new AppError(500, 'Break-glass OTP secret not configured', 'CONFIG_ERROR');
  }
  const result = verifySync({ token: otp, secret, epochTolerance: 30 });
  return result?.valid === true;
}

/** Check and update rate limiter. Returns true if locked out. */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attemptTracker.get(ip);
  if (!entry) return false;
  if (now - entry.firstAttempt > LOCKOUT_WINDOW) {
    attemptTracker.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip: string): number {
  const now = Date.now();
  const entry = attemptTracker.get(ip);
  if (!entry || now - entry.firstAttempt > LOCKOUT_WINDOW) {
    attemptTracker.set(ip, { count: 1, firstAttempt: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

export interface BreakGlassLoginInput {
  email: string;
  password: string;
  otp: string;
  ipAddress: string;
  userAgent: string;
}

export interface BreakGlassLoginResult {
  accessToken: string;
  expiresIn: number;
  renewable: false;
  warning: string;
}

export class BreakGlassService {
  /**
   * Break-glass emergency login.
   * Separate from normal login: OTP required, 30-min non-renewable session.
   */
  async login(input: BreakGlassLoginInput): Promise<BreakGlassLoginResult> {
    const { email, password, otp, ipAddress, userAgent } = input;

    // Rate limit check
    if (isRateLimited(ipAddress)) {
      throw new AppError(429, 'Too many break-glass attempts. Try again in 15 minutes.', 'RATE_LIMITED');
    }

    // Find break-glass user
    const user = await bgRepo.findBreakGlassUserByEmail(email);
    if (!user || !user.isBreakGlass) {
      recordAttempt(ipAddress);
      throw new AppError(404, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (!user.passwordHash) {
      recordAttempt(ipAddress);
      throw new AppError(404, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      const count = recordAttempt(ipAddress);
      await this._auditFailedAttempt(user, ipAddress, 'invalid_password');
      await this._queueFailedAlert(ipAddress, count);
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Verify OTP
    if (!verifyBreakGlassOtp(otp)) {
      const count = recordAttempt(ipAddress);
      await this._auditFailedAttempt(user, ipAddress, 'invalid_otp');
      await this._queueFailedAlert(ipAddress, count);
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Terminate any existing break-glass session (concurrent limit: 1)
    const terminated = await bgRepo.terminateBreakGlassSessions();
    if (terminated > 0) {
      await repo.createAuditLog({
        tenantId: user.tenantId, userId: user.id,
        action: BREAK_GLASS_AUDIT_EVENTS.SESSION_REPLACED,
        entityType: 'session', ipAddress, userAgent,
        changes: { riskLevel: 'critical', terminatedCount: terminated },
      });
    }

    // Create 30-minute non-renewable session
    const expiresAt = new Date(Date.now() + BREAK_GLASS_SESSION_TTL * 1000);
    const session = await bgRepo.createBreakGlassSession({
      userId: user.id, tenantId: user.tenantId,
      ipAddress, userAgent, expiresAt,
    });

    // Sign access token with 30-minute TTL (override default 15min)
    const accessToken = signAccessToken({
      userId: user.id, tenantId: user.tenantId,
      email: user.email, role: user.role as Role,
      sessionId: session.id,
      expiresInOverride: BREAK_GLASS_SESSION_TTL,
      extraClaims: { isBreakGlass: true },
    });

    // Update break-glass stats
    await bgRepo.updateBreakGlassStats(user.id);

    // Audit success
    await repo.createAuditLog({
      tenantId: user.tenantId, userId: user.id,
      action: BREAK_GLASS_AUDIT_EVENTS.LOGIN_SUCCESS,
      entityType: 'session', entityId: session.id,
      ipAddress, userAgent,
      changes: {
        riskLevel: 'critical',
        sessionExpiresAt: expiresAt.toISOString(),
        useCount: user.breakGlassUseCount + 1,
      },
    });

    // Queue success alert (fire-and-forget)
    this._queueSuccessAlert(user, ipAddress, expiresAt).catch(() => {});

    // Geo enrichment (fire-and-forget)
    enrichSessionGeo(session.id, user.id, user.tenantId, ipAddress).catch(() => {});

    return {
      accessToken,
      expiresIn: BREAK_GLASS_SESSION_TTL,
      renewable: false,
      warning: 'Break-glass session expires in 30 minutes and cannot be renewed',
    };
  }

  /** Get break-glass account status for super_admin dashboard */
  async getStatus(): Promise<{
    configured: boolean;
    lastUsed: string | null;
    useCount: number;
    activeSession: {
      sessionId: string; expiresAt: string;
      ipAddress: string | null; geoCountry: string | null; geoCity: string | null;
    } | null;
  }> {
    const user = await bgRepo.findBreakGlassUser();
    if (!user) {
      return { configured: false, lastUsed: null, useCount: 0, activeSession: null };
    }

    const activeSession = await bgRepo.findActiveBreakGlassSession();

    return {
      configured: true,
      lastUsed: user.breakGlassLastUsed?.toISOString() ?? null,
      useCount: user.breakGlassUseCount,
      activeSession: activeSession ? {
        sessionId: activeSession.id,
        expiresAt: activeSession.expiresAt.toISOString(),
        ipAddress: activeSession.ipAddress,
        geoCountry: activeSession.geoCountry,
        geoCity: activeSession.geoCity,
      } : null,
    };
  }

  /** Get break-glass audit entries */
  async getAuditLog(limit = 50, offset = 0) {
    return bgRepo.findBreakGlassAuditEntries(limit, offset);
  }

  /** Rotate break-glass password — terminates active session */
  async rotatePassword(newPassword: string, adminUserId: string, ipAddress: string): Promise<void> {
    if (newPassword.length < 20) {
      throw new AppError(400, 'Break-glass password must be at least 20 characters', 'VALIDATION_ERROR');
    }

    const user = await bgRepo.findBreakGlassUser();
    if (!user) throw new AppError(404, 'Break-glass account not configured', 'NOT_FOUND');

    const passwordHash = await hashPassword(newPassword);
    await bgRepo.updateBreakGlassPassword(user.id, passwordHash);

    // Terminate active sessions
    await bgRepo.terminateBreakGlassSessions();

    await repo.createAuditLog({
      tenantId: user.tenantId, userId: adminUserId,
      action: BREAK_GLASS_AUDIT_EVENTS.PASSWORD_ROTATED,
      entityType: 'user', entityId: user.id,
      ipAddress,
      changes: { riskLevel: 'critical', rotatedBy: adminUserId },
    });
  }

  /** Force-terminate active break-glass sessions */
  async forceTerminateSessions(adminUserId: string, ipAddress: string): Promise<number> {
    const user = await bgRepo.findBreakGlassUser();
    const tenantId = user?.tenantId ?? SYSTEM_TENANT_ID;

    const count = await bgRepo.terminateBreakGlassSessions();

    await repo.createAuditLog({
      tenantId, userId: adminUserId,
      action: BREAK_GLASS_AUDIT_EVENTS.SESSION_FORCE_TERMINATED,
      entityType: 'session', ipAddress,
      changes: { riskLevel: 'critical', terminatedCount: count, terminatedBy: adminUserId },
    });

    return count;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async _auditFailedAttempt(
    user: { id: string; tenantId: string },
    ipAddress: string,
    reason: string,
  ): Promise<void> {
    await repo.createAuditLog({
      tenantId: user.tenantId, userId: user.id,
      action: BREAK_GLASS_AUDIT_EVENTS.LOGIN_FAILED,
      entityType: 'session', ipAddress,
      changes: { riskLevel: 'critical', reason },
    });
  }

  private async _queueFailedAlert(ipAddress: string, attemptCount: number): Promise<void> {
    const alertType = attemptCount >= MAX_ATTEMPTS ? 'break_glass_locked_out' : 'break_glass_failed_attempt';
    const payload: BreakGlassAlertPayload = {
      type: alertType,
      severity: 'critical',
      ipAddress,
      geoCountry: null,
      geoCity: null,
      timestamp: new Date().toISOString(),
    };

    if (attemptCount >= MAX_ATTEMPTS) {
      await repo.createAuditLog({
        tenantId: SYSTEM_TENANT_ID, userId: 'system',
        action: BREAK_GLASS_AUDIT_EVENTS.LOGIN_LOCKED,
        entityType: 'session', ipAddress,
        changes: { riskLevel: 'critical', lockedIp: ipAddress, attemptCount },
      });
    }

    // Store alert payload for consumer (BullMQ integration in gateway)
    this._lastAlertPayload = payload;
  }

  private async _queueSuccessAlert(
    user: { id: string; breakGlassUseCount: number },
    ipAddress: string,
    sessionExpiresAt: Date,
  ): Promise<void> {
    const payload: BreakGlassAlertPayload = {
      type: 'break_glass_login',
      severity: 'critical',
      breakGlassUserId: user.id,
      ipAddress,
      geoCountry: null,
      geoCity: null,
      timestamp: new Date().toISOString(),
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      useCount: user.breakGlassUseCount + 1,
    };
    this._lastAlertPayload = payload;
  }

  /** Last alert payload — accessible by gateway to queue to BullMQ */
  _lastAlertPayload: BreakGlassAlertPayload | null = null;

  /** Get the last alert payload (for gateway to enqueue) and clear it */
  getAndClearAlertPayload(): BreakGlassAlertPayload | null {
    const payload = this._lastAlertPayload;
    this._lastAlertPayload = null;
    return payload;
  }
}
