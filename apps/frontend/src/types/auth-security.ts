/**
 * @module types/auth-security
 * @description Types for MFA, active sessions, and email verification features.
 */

// ─── MFA Types ─────────────────────────────────────────────────

export interface MfaSetupResponse {
  secret: string
  qrCodeUri: string
  backupCodes: string[]
}

export interface MfaVerifySetupInput {
  code: string
}

export interface MfaDisableInput {
  code: string
}

export interface MfaChallengeInput {
  mfaToken: string
  code: string
}

export interface MfaChallengeResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: {
    id: string
    email: string
    displayName: string
    role: string
    tenantId: string
    avatarUrl: string | null
    mfaEnabled: boolean
    emailVerified: boolean
  }
  tenant?: {
    id: string
    name: string
    slug: string
    plan: string
  }
}

export interface BackupCodesResponse {
  codes: string[]
}

export interface MfaEnforcement {
  enforced: boolean
  gracePeriodDays?: number
  usersWithMfa?: number
  totalUsers?: number
}

// ─── Session Types ─────────────────────────────────────────────

export interface SessionInfo {
  id: string
  ipAddress: string
  userAgent: string
  geoCity: string | null
  geoCountry: string | null
  geoIsp: string | null
  createdAt: string
  lastUsedAt: string
  isCurrent: boolean
  suspiciousLogin: boolean
}

// ─── Email Verification Types ──────────────────────────────────

export interface VerifyEmailInput {
  token: string
}

export interface ResendVerificationInput {
  email: string
}

// ─── Extended Auth Response ────────────────────────────────────

export interface ExtendedAuthResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: {
    id: string
    email: string
    displayName: string
    role: string
    tenantId: string
    avatarUrl: string | null
    mfaEnabled?: boolean
    emailVerified?: boolean
    mfaVerifiedAt?: string | null
  }
  tenant?: {
    id: string
    name: string
    slug: string
    plan: string
  }
  mfaRequired?: boolean
  mfaSetupRequired?: boolean
  mfaToken?: string
}
