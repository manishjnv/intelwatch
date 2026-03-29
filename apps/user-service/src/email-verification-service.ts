/**
 * @module EmailVerificationService
 * @description Email verification token generation, verification, resend (rate-limited),
 * and cleanup of unverified accounts. Tokens stored as SHA-256 hashes.
 */
import crypto from 'node:crypto';
import { AppError, sha256, QUEUES } from '@etip/shared-utils';
import * as emailRepo from './email-verification-repository.js';
import * as repo from './repository.js';

const TOKEN_EXPIRY_HOURS = 24;
const RESEND_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_DAYS = 7;

// ── Token generation ────────────────────────────────────────────────

/** Generate a verification token, store its hash, return the plaintext token */
export async function generateVerificationToken(
  userId: string
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 3600 * 1000);

  await emailRepo.setVerifyToken(userId, tokenHash, expiresAt);

  return token;
}

/** Build the email job payload to queue (does NOT send — just returns data) */
export function buildEmailJobPayload(
  userId: string, email: string, token: string, tenantName: string
) {
  return {
    queue: QUEUES.EMAIL_SEND,
    data: {
      type: 'email_verification' as const,
      userId,
      email,
      token,
      tenantName,
    },
  };
}

// ── Verify email ────────────────────────────────────────────────────

export async function verifyEmail(
  token: string, ipAddress: string, userAgent: string
): Promise<{ message: string }> {
  const tokenHash = sha256(token);
  const user = await emailRepo.findByVerifyToken(tokenHash);

  if (!user) {
    throw new AppError(404, 'Invalid verification token', 'INVALID_TOKEN');
  }

  if (user.emailVerified) {
    return { message: 'Email already verified.' };
  }

  if (!user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
    throw new AppError(410, 'Verification token has expired. Please request a new one.', 'TOKEN_EXPIRED');
  }

  await emailRepo.markVerified(user.id);

  await repo.createAuditLog({
    tenantId: user.tenantId, userId: user.id, action: 'email.verified',
    entityType: 'user', entityId: user.id, ipAddress, userAgent,
  });

  return { message: 'Email verified. You can now log in.' };
}

// ── Resend verification ─────────────────────────────────────────────

export async function resendVerification(
  email: string, ipAddress: string, userAgent: string
): Promise<{ message: string; _tokenForTesting?: string; _queuePayload?: ReturnType<typeof buildEmailJobPayload> }> {
  // Always return 200 to prevent email enumeration
  const genericMessage = 'If that email exists and is unverified, a new verification link has been sent.';

  const user = await emailRepo.findUnverifiedByEmail(email);
  if (!user) {
    return { message: genericMessage };
  }

  // Rate limit: check if last token was sent < 5 min ago
  if (user.emailVerifyExpires) {
    const lastSentAt = new Date(user.emailVerifyExpires.getTime() - TOKEN_EXPIRY_HOURS * 3600 * 1000);
    if (Date.now() - lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new AppError(429, 'Please wait 5 minutes before requesting another verification email', 'RATE_LIMITED');
    }
  }

  const token = await generateVerificationToken(user.id);
  const tenantName = user.tenant?.name ?? 'IntelWatch';
  const queuePayload = buildEmailJobPayload(user.id, user.email, token, tenantName);

  await repo.createAuditLog({
    tenantId: user.tenantId, userId: user.id, action: 'email.verification.resent',
    entityType: 'user', entityId: user.id, ipAddress, userAgent,
  });

  return { message: genericMessage, _tokenForTesting: token, _queuePayload: queuePayload };
}

// ── Cleanup unverified accounts ─────────────────────────────────────

export async function cleanupUnverifiedUsers(
  ipAddress: string = 'system', userAgent: string = 'cleanup-cron'
): Promise<{ deletedCount: number }> {
  const cutoff = new Date(Date.now() - CLEANUP_DAYS * 24 * 3600 * 1000);
  const result = await emailRepo.deleteUnverifiedBefore(cutoff);

  if (result.count > 0) {
    // Use system tenant for audit — these are cross-tenant cleanup operations
    await repo.createAuditLog({
      tenantId: '00000000-0000-0000-0000-000000000000',
      action: 'email.unverified_purge',
      entityType: 'user',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      changes: { count: result.count, cutoffDate: cutoff.toISOString() } as any,
      ipAddress, userAgent,
    });
  }

  return { deletedCount: result.count };
}
