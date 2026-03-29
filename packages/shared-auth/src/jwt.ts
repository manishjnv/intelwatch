/**
 * @module @etip/shared-auth/jwt
 * @description JWT access & refresh token signing/verification.
 * Access tokens: 15 min. Refresh tokens: 7 days.
 * All tokens include tenantId for RLS context.
 */
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import type { JwtPayload, Role } from '@etip/shared-types';

/** Configuration sourced from environment */
export interface JwtConfig {
  secret: string;
  issuer: string;
  accessExpirySeconds: number;
  refreshExpirySeconds: number;
}

/** Role-based refresh token / session TTL (seconds) */
const ROLE_SESSION_TTL: Record<string, number> = {
  super_admin: 14_400,  // 4 hours — security requirement for platform operators
};

/**
 * Get the refresh token / session TTL for a given role.
 * super_admin: 4 hours. All others: default refreshExpirySeconds (7 days).
 */
export function getRefreshExpiryForRole(role: Role): number {
  return ROLE_SESSION_TTL[role] ?? _config.refreshExpirySeconds;
}

/** Refresh token payload (subset of access token) */
export const RefreshTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  tenantId: z.string().uuid(),
  sessionId: z.string().uuid(),
  type: z.literal('refresh'),
  iat: z.number(),
  exp: z.number(),
});
export type RefreshTokenPayload = z.infer<typeof RefreshTokenPayloadSchema>;

/** Default config — override via loadJwtConfig() */
const DEFAULT_CONFIG: JwtConfig = {
  secret: '',
  issuer: 'intelwatch-etip',
  accessExpirySeconds: 900,
  refreshExpirySeconds: 604800,
};

let _config: JwtConfig = { ...DEFAULT_CONFIG };

/**
 * Initialize JWT configuration from environment variables.
 * Must be called once at app startup.
 */
export function loadJwtConfig(env: Record<string, string | undefined>): JwtConfig {
  const secret = env['TI_JWT_SECRET'];
  if (!secret || secret.length < 32) {
    throw new AppError(
      500,
      'TI_JWT_SECRET must be at least 32 characters',
      'CONFIG_ERROR'
    );
  }
  _config = {
    secret,
    issuer: env['TI_JWT_ISSUER'] ?? DEFAULT_CONFIG.issuer,
    accessExpirySeconds: Number(env['TI_JWT_ACCESS_EXPIRY']) || DEFAULT_CONFIG.accessExpirySeconds,
    refreshExpirySeconds: Number(env['TI_JWT_REFRESH_EXPIRY']) || DEFAULT_CONFIG.refreshExpirySeconds,
  };
  return _config;
}

/** Get current config (for testing) */
export function getJwtConfig(): Readonly<JwtConfig> {
  return _config;
}

/** Parameters for signing an access token */
export interface SignAccessTokenParams {
  userId: string;
  tenantId: string;
  email: string;
  role: Role;
  sessionId: string;
}

/**
 * Sign a short-lived access token (default 15 min).
 * Contains full user context for request authorization.
 */
export function signAccessToken(params: SignAccessTokenParams): string {
  if (!_config.secret) {
    throw new AppError(500, 'JWT not configured — call loadJwtConfig() first', 'CONFIG_ERROR');
  }
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: params.userId,
    tenantId: params.tenantId,
    email: params.email,
    role: params.role,
    sessionId: params.sessionId,
  };
  return jwt.sign(payload, _config.secret, {
    expiresIn: _config.accessExpirySeconds,
    issuer: _config.issuer,
  });
}

/**
 * Sign a refresh token with role-based TTL.
 * super_admin: 4 hours. All others: default 7 days.
 * Pass `role` to apply role-specific TTL; omit for default.
 */
export function signRefreshToken(params: {
  userId: string;
  tenantId: string;
  sessionId: string;
  role?: Role;
}): string {
  if (!_config.secret) {
    throw new AppError(500, 'JWT not configured — call loadJwtConfig() first', 'CONFIG_ERROR');
  }
  const ttl = params.role ? getRefreshExpiryForRole(params.role) : _config.refreshExpirySeconds;
  return jwt.sign(
    {
      sub: params.userId,
      tenantId: params.tenantId,
      sessionId: params.sessionId,
      type: 'refresh' as const,
    },
    _config.secret,
    {
      expiresIn: ttl,
      issuer: _config.issuer,
    }
  );
}

/**
 * Verify and decode an access token.
 * Throws AppError(401) on invalid/expired tokens.
 */
export function verifyAccessToken(token: string): JwtPayload {
  if (!_config.secret) {
    throw new AppError(500, 'JWT not configured', 'CONFIG_ERROR');
  }
  try {
    const decoded = jwt.verify(token, _config.secret, {
      issuer: _config.issuer,
    }) as Record<string, unknown>;

    // Reject refresh tokens used as access tokens
    if (decoded['type'] === 'refresh') {
      throw new AppError(401, 'Refresh token cannot be used as access token', 'INVALID_TOKEN');
    }

    return decoded as unknown as JwtPayload;
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Access token expired', 'TOKEN_EXPIRED');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError(401, 'Invalid access token', 'INVALID_TOKEN');
    }
    throw new AppError(401, 'Token verification failed', 'TOKEN_VERIFICATION_FAILED');
  }
}

/**
 * Verify and decode a refresh token.
 * Throws AppError(401) on invalid/expired tokens.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  if (!_config.secret) {
    throw new AppError(500, 'JWT not configured', 'CONFIG_ERROR');
  }
  try {
    const decoded = jwt.verify(token, _config.secret, {
      issuer: _config.issuer,
    }) as Record<string, unknown>;

    if (decoded['type'] !== 'refresh') {
      throw new AppError(401, 'Not a refresh token', 'INVALID_TOKEN');
    }

    return decoded as unknown as RefreshTokenPayload;
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Refresh token expired', 'TOKEN_EXPIRED');
    }
    throw new AppError(401, 'Invalid refresh token', 'INVALID_TOKEN');
  }
}
