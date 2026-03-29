/**
 * @module @etip/shared-auth
 * @description Authentication and authorization package for ETIP.
 * Provides JWT signing/verification, RBAC, password hashing,
 * and service-to-service JWT for internal communication.
 *
 * @example
 * ```typescript
 * import {
 *   loadJwtConfig, signAccessToken, verifyAccessToken,
 *   hashPassword, verifyPassword,
 *   hasPermission, ROLE_PERMISSIONS,
 *   signServiceToken, verifyServiceToken,
 * } from '@etip/shared-auth';
 * ```
 */

// ── JWT (access + refresh tokens) ──────────────────────────────────
export {
  loadJwtConfig,
  getJwtConfig,
  getRefreshExpiryForRole,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type JwtConfig,
  type SignAccessTokenParams,
  RefreshTokenPayloadSchema,
  type RefreshTokenPayload,
} from './jwt.js';

// ── Password & API key hashing ─────────────────────────────────────
export {
  hashPassword,
  verifyPassword,
  hashApiKey,
  verifyApiKey,
} from './password.js';

// ── RBAC permissions ───────────────────────────────────────────────
export {
  PERMISSIONS,
  type Permission,
  ROLE_PERMISSIONS,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getResolvedPermissions,
} from './permissions.js';

// ── System tenant constants ───────────────────────────────────
export {
  SYSTEM_TENANT_ID,
  SYSTEM_TENANT_NAME,
  SYSTEM_TENANT_SLUG,
} from './constants.js';

// ── Row Level Security (RLS) ──────────────────────────────────────
export {
  withRls,
  superAdminRlsContext,
  rlsSetLocalSql,
  RLS_PROTECTED_TABLES,
  RLS_EXCLUDED_TABLES,
  type RlsContext,
} from './rls.js';

// ── MFA challenge tokens ──────────────────────────────────────────
export {
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  signMfaSetupToken,
  verifyMfaSetupToken,
  type MfaChallengePayload,
  type MfaSetupTokenPayload,
} from './mfa.js';

// ── Service-to-service JWT ─────────────────────────────────────────
export {
  loadServiceJwtSecret,
  signServiceToken,
  verifyServiceToken,
  type ServiceTokenPayload,
} from './service-jwt.js';
