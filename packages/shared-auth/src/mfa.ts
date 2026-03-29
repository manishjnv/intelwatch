/**
 * @module @etip/shared-auth/mfa
 * @description MFA token signing/verification for the two-step login challenge.
 * MFA challenge tokens are short-lived JWTs (5 min) used between
 * password verification and TOTP verification.
 */
import jwt from 'jsonwebtoken';
import { AppError } from '@etip/shared-utils';

/** Payload for a short-lived MFA challenge token */
export interface MfaChallengePayload {
  sub: string;     // userId
  tenantId: string;
  purpose: 'mfa_challenge';
  iat: number;
  exp: number;
}

/** Payload for a restricted MFA setup-only session token */
export interface MfaSetupTokenPayload {
  sub: string;
  tenantId: string;
  email: string;
  purpose: 'mfa_setup_required';
  iat: number;
  exp: number;
}

const MFA_CHALLENGE_TTL = 300; // 5 minutes
const MFA_SETUP_TTL = 900;    // 15 minutes for setup-only session

/**
 * Sign a short-lived MFA challenge token (5 min TTL).
 * Issued after password validation for MFA-enabled users.
 */
export function signMfaChallengeToken(
  userId: string,
  tenantId: string,
  secret: string
): string {
  return jwt.sign(
    { sub: userId, tenantId, purpose: 'mfa_challenge' as const },
    secret,
    { expiresIn: MFA_CHALLENGE_TTL, issuer: 'intelwatch-etip' }
  );
}

/**
 * Verify an MFA challenge token. Throws on invalid/expired/wrong purpose.
 */
export function verifyMfaChallengeToken(
  token: string,
  secret: string
): MfaChallengePayload {
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: 'intelwatch-etip',
    }) as Record<string, unknown>;

    if (decoded['purpose'] !== 'mfa_challenge') {
      throw new AppError(401, 'Invalid MFA token purpose', 'MFA_TOKEN_INVALID');
    }

    return decoded as unknown as MfaChallengePayload;
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'MFA challenge token expired — please login again', 'MFA_TOKEN_EXPIRED');
    }
    throw new AppError(401, 'Invalid MFA challenge token', 'MFA_TOKEN_INVALID');
  }
}

/**
 * Sign a restricted setup-only session token (15 min TTL).
 * Issued when enforcement requires MFA setup before full access.
 */
export function signMfaSetupToken(
  userId: string,
  tenantId: string,
  email: string,
  secret: string
): string {
  return jwt.sign(
    { sub: userId, tenantId, email, purpose: 'mfa_setup_required' as const },
    secret,
    { expiresIn: MFA_SETUP_TTL, issuer: 'intelwatch-etip' }
  );
}

/**
 * Verify a restricted MFA setup token.
 */
export function verifyMfaSetupToken(
  token: string,
  secret: string
): MfaSetupTokenPayload {
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: 'intelwatch-etip',
    }) as Record<string, unknown>;

    if (decoded['purpose'] !== 'mfa_setup_required') {
      throw new AppError(401, 'Invalid MFA setup token purpose', 'MFA_TOKEN_INVALID');
    }

    return decoded as unknown as MfaSetupTokenPayload;
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'MFA setup token expired — please login again', 'MFA_TOKEN_EXPIRED');
    }
    throw new AppError(401, 'Invalid MFA setup token', 'MFA_TOKEN_INVALID');
  }
}
