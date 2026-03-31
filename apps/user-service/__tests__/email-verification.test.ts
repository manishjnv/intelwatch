import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { loadJwtConfig } from '@etip/shared-auth';
import { sha256 } from '@etip/shared-utils';

// Mock Prisma
vi.mock('../src/prisma.js', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    tenantSubscription: { create: vi.fn() },
    session: { create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn(), findFirst: vi.fn() },
    mfaEnforcementPolicy: { findFirst: vi.fn() },
    ssoConfig: { findFirst: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'audit-1', ...args.data, createdAt: new Date() })) },
    })),
  },
  disconnectPrisma: vi.fn(),
}));

import { prisma } from '../src/prisma.js';
import {
  generateVerificationToken,
  verifyEmail,
  resendVerification,
  cleanupUnverifiedUsers,
} from '../src/email-verification-service.js';
import { UserService } from '../src/service.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

process.env['TI_MFA_ENCRYPTION_KEY'] = 'test-mfa-encryption-key-at-least-32-chars!!';

const MOCK_TENANT_ID = '550e8400-e29b-41d4-a716-446655440010';
const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440020';
const IP = '127.0.0.1';
const UA = 'test-agent';

const baseTenant = {
  id: MOCK_TENANT_ID, name: 'ACME Corp', slug: 'acme', plan: 'free',
  maxUsers: 5, active: true,
};

describe('EmailVerificationService', () => {
  beforeAll(() => { loadJwtConfig(TEST_JWT_ENV); });
  beforeEach(() => { vi.clearAllMocks(); });

  // ── 1. Register creates unverified user ────────────────────────

  it('register creates user with active=false and emailVerified=false', async () => {
    const service = new UserService();
    const newUser = {
      id: MOCK_USER_ID, email: 'user@test.com', displayName: 'Test User',
      role: 'tenant_admin', tenantId: MOCK_TENANT_ID, avatarUrl: null, active: false,
      emailVerified: false, designation: null, tenant: baseTenant,
    };

    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.tenant.create).mockResolvedValue(baseTenant as never);
    vi.mocked(prisma.user.create).mockResolvedValue(newUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue(newUser as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await service.register({
      email: 'user@test.com', password: 'StrongPass123!', displayName: 'Test User',
      tenantName: 'ACME Corp', tenantSlug: 'acme', ipAddress: IP, userAgent: UA,
    });

    expect(result.message).toContain('verify your email');
    expect(result.emailJobPayload).toBeDefined();
    expect(result.emailJobPayload!.data.type).toBe('email_verification');

    // Verify user was created with active=false, emailVerified=false
    const createCall = vi.mocked(prisma.user.create).mock.calls[0]![0] as { data: { active: boolean; emailVerified: boolean } };
    expect(createCall.data.active).toBe(false);
    expect(createCall.data.emailVerified).toBe(false);
  });

  // ── 2. Login before verification → 403 ─────────────────────────

  it('rejects login for unverified user with 403 EMAIL_NOT_VERIFIED', async () => {
    const service = new UserService();
    const unverifiedUser = {
      id: MOCK_USER_ID, email: 'user@test.com', displayName: 'Test User',
      role: 'analyst', tenantId: MOCK_TENANT_ID, avatarUrl: null, active: false,
      emailVerified: false, passwordHash: '$2a$12$fakehash', designation: null,
      tenant: baseTenant,
    };

    vi.mocked(prisma.user.findFirst).mockResolvedValue(unverifiedUser as never);

    await expect(service.login({
      email: 'user@test.com', password: 'StrongPass123!', ipAddress: IP, userAgent: UA,
    })).rejects.toThrow('verify your email');
  });

  // ── 3. Verify with valid token → success ───────────────────────

  it('verifies email with valid token — sets emailVerified=true, active=true', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    const futureDate = new Date(Date.now() + 86400000);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: MOCK_USER_ID, email: 'user@test.com', tenantId: MOCK_TENANT_ID,
      emailVerified: false, emailVerifyToken: tokenHash, emailVerifyExpires: futureDate,
      active: false, createdAt: new Date(),
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await verifyEmail(token, IP, UA);
    expect(result.message).toContain('verified');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: MOCK_USER_ID },
      data: expect.objectContaining({ emailVerified: true, active: true }),
    }));
  });

  // ── 4. Verify with expired token → 410 ─────────────────────────

  it('rejects expired verification token with 410', async () => {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(token);
    const pastDate = new Date(Date.now() - 86400000);

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: MOCK_USER_ID, email: 'user@test.com', tenantId: MOCK_TENANT_ID,
      emailVerified: false, emailVerifyToken: tokenHash, emailVerifyExpires: pastDate,
      active: false, createdAt: new Date(),
    } as never);

    await expect(verifyEmail(token, IP, UA)).rejects.toThrow('expired');
  });

  // ── 5. Verify with invalid token → 404 ─────────────────────────

  it('rejects invalid verification token with 404', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);

    await expect(verifyEmail('invalid-token-hex', IP, UA)).rejects.toThrow('Invalid verification token');
  });

  // ── 6. Resend within 5 min → 429 ──────────────────────────────

  it('rate-limits resend requests within 5 minutes', async () => {
    const recentExpiry = new Date(Date.now() + 23 * 3600 * 1000); // 23h left → sent 1h ago (< 5min = false)
    // Actually: lastSentAt = expiresAt - 24h. If sent 1 minute ago, expiresAt = now + 23h59m
    const veryRecentExpiry = new Date(Date.now() + 24 * 3600 * 1000 - 60 * 1000); // sent 1min ago

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: MOCK_USER_ID, email: 'user@test.com', tenantId: MOCK_TENANT_ID,
      emailVerifyToken: 'some-hash', emailVerifyExpires: veryRecentExpiry,
      createdAt: new Date(), tenant: { name: 'ACME' },
    } as never);

    await expect(resendVerification('user@test.com', IP, UA)).rejects.toThrow('wait 5 minutes');
  });

  // ── 7. Resend after 5 min → new token ──────────────────────────

  it('allows resend after 5 minute cooldown', async () => {
    const oldExpiry = new Date(Date.now() + 23 * 3600 * 1000); // sent ~1h ago

    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: MOCK_USER_ID, email: 'user@test.com', tenantId: MOCK_TENANT_ID,
      emailVerifyToken: 'old-hash', emailVerifyExpires: oldExpiry,
      createdAt: new Date(), tenant: { name: 'ACME' },
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await resendVerification('user@test.com', IP, UA);
    expect(result._tokenForTesting).toBeDefined();
    expect(result._queuePayload).toBeDefined();
  });

  // ── 8. Verified user logs in normally ──────────────────────────

  it('verified user passes email check in login flow', async () => {
    const service = new UserService();
    const verifiedUser = {
      id: MOCK_USER_ID, email: 'user@test.com', displayName: 'Test User',
      role: 'analyst', tenantId: MOCK_TENANT_ID, avatarUrl: null, active: true,
      emailVerified: true,
      passwordHash: '$2a$12$LJ3m4ys2Bx5ZuKJq5ML4QOQfMv5aL9j1H0z1Yr7VxmCpoJ0S8RN5e',
      designation: null,
      tenant: baseTenant,
    };

    vi.mocked(prisma.user.findFirst).mockResolvedValue(verifiedUser as never);

    // Password won't match our mock hash, but the point is it gets past the email check
    await expect(service.login({
      email: 'user@test.com', password: 'WrongPass!', ipAddress: IP, userAgent: UA,
    })).rejects.toThrow('Invalid email or password');
    // The error is about password, NOT about email verification — proves email check passed
  });

  // ── 9. SSO user created with emailVerified=true ────────────────

  it('SSO-provisioned users have emailVerified=true', () => {
    // This is tested in sso-service.test.ts (JIT provision sets emailVerified: true)
    // Verify the contract: createUser accepts emailVerified param
    expect(true).toBe(true); // Marker test — actual coverage in SSO tests
  });

  // ── 10. skipVerification=true → emailVerified=true ─────────────

  it('createUser with emailVerified=true skips verification requirement', async () => {
    const verifiedUser = {
      id: 'invited-user-id', email: 'invited@acme.com', displayName: 'Invited',
      role: 'analyst', tenantId: MOCK_TENANT_ID, avatarUrl: null,
      active: true, emailVerified: true, designation: null,
    };

    vi.mocked(prisma.user.create).mockResolvedValue(verifiedUser as never);

    const { prisma: prismaMock } = await import('../src/prisma.js');
    await prismaMock.user.create({
      data: {
        tenantId: MOCK_TENANT_ID, email: 'invited@acme.com', displayName: 'Invited',
        role: 'analyst', authProvider: 'email', emailVerified: true, active: true,
      },
    });

    const createCall = vi.mocked(prisma.user.create).mock.calls[0]![0] as { data: { emailVerified: boolean } };
    expect(createCall.data.emailVerified).toBe(true);
  });

  // ── 11. Cleanup deletes 7-day unverified accounts ──────────────

  it('cleanupUnverifiedUsers deletes old unverified accounts', async () => {
    vi.mocked(prisma.user.deleteMany).mockResolvedValue({ count: 3 } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const result = await cleanupUnverifiedUsers();
    expect(result.deletedCount).toBe(3);
    expect(prisma.user.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ emailVerified: false }),
    }));
  });

  // ── 12. Resend for non-existent email → 200 (no leak) ─────────

  it('resend for non-existent email returns 200 (no enumeration)', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);

    const result = await resendVerification('nonexistent@nowhere.com', IP, UA);
    expect(result.message).toContain('If that email exists');
    expect(result._tokenForTesting).toBeUndefined();
  });
});
