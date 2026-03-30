/**
 * @module hooks/security-demo-data
 * @description Demo/fallback data for MFA, sessions, and enforcement hooks.
 */
import type { SessionInfo, MfaEnforcement } from '@/types/auth-security'

export const DEMO_SESSIONS: SessionInfo[] = [
  {
    id: 'sess-current',
    ipAddress: '203.0.113.42',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    geoCity: 'Mumbai',
    geoCountry: 'IN',
    geoIsp: 'Reliance Jio',
    createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    lastUsedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    isCurrent: true,
    suspiciousLogin: false,
  },
  {
    id: 'sess-2',
    ipAddress: '198.51.100.23',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    geoCity: 'Delhi',
    geoCountry: 'IN',
    geoIsp: 'Airtel',
    createdAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
    lastUsedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    isCurrent: false,
    suspiciousLogin: false,
  },
  {
    id: 'sess-3',
    ipAddress: '192.0.2.88',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    geoCity: 'Singapore',
    geoCountry: 'SG',
    geoIsp: 'AWS',
    createdAt: new Date(Date.now() - 48 * 3600_000).toISOString(),
    lastUsedAt: new Date(Date.now() - 12 * 3600_000).toISOString(),
    isCurrent: false,
    suspiciousLogin: true,
  },
]

export const DEMO_MFA_SETUP = {
  secret: 'JBSWY3DPEHPK3PXP',
  qrCodeUri: 'otpauth://totp/ETIP:demo@test.com?secret=JBSWY3DPEHPK3PXP&issuer=ETIP',
  backupCodes: [
    'a1b2-c3d4', 'e5f6-g7h8', 'i9j0-k1l2', 'm3n4-o5p6', 'q7r8-s9t0',
    'u1v2-w3x4', 'y5z6-a7b8', 'c9d0-e1f2', 'g3h4-i5j6', 'k7l8-m9n0',
  ],
}

export const DEMO_ENFORCEMENT: MfaEnforcement = {
  enforced: false,
  gracePeriodDays: 14,
  usersWithMfa: 1,
  totalUsers: 3,
}
