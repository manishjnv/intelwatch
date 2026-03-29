import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig, signRefreshToken } from '@etip/shared-auth';
import { sha256 } from '@etip/shared-utils';

vi.mock('../src/geoip.js', () => ({ enrichSessionGeo: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/audit-replication.js', () => ({ buildAuditReplicationJob: vi.fn().mockReturnValue({ queue: 'etip-audit-replication', data: {} }) }));

const { _auditCreate } = vi.hoisted(() => ({
  _auditCreate: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'audit-1', ...args.data, createdAt: new Date() })),
}));

vi.mock('../src/prisma.js', () => ({
  prisma: {
    tenant: { create: vi.fn(), findUnique: vi.fn() },
    user: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: _auditCreate, findFirst: vi.fn() },
    mfaEnforcementPolicy: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: _auditCreate },
    })),
  },
  disconnectPrisma: vi.fn(),
}));

import { prisma } from '../src/prisma.js';
import { UserService } from '../src/service.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

const mockTenant = {
  id: '550e8400-e29b-41d4-a716-446655440010', name: 'ACME Corp', slug: 'acme-corp', plan: 'free',
  maxUsers: 5, maxFeedsPerDay: 10, maxIOCs: 10000, aiCreditsMonthly: 100, aiCreditsUsed: 0,
  settings: {}, active: true, createdAt: new Date(), updatedAt: new Date(),
};

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440020', tenantId: mockTenant.id,
  email: 'analyst@acme.com', displayName: 'Jane Analyst', avatarUrl: null,
  role: 'tenant_admin' as const, authProvider: 'email' as const, authProviderId: null,
  passwordHash: '', designation: null, emailVerified: true,
  emailVerifyToken: null, emailVerifyExpires: null,
  mfaEnabled: false, mfaSecret: null,
  mfaBackupCodes: [], mfaVerifiedAt: null, lastLoginAt: null, loginCount: 0,
  active: true, createdAt: new Date(), updatedAt: new Date(), tenant: mockTenant,
};

const mockSession = {
  id: '550e8400-e29b-41d4-a716-446655440030', userId: mockUser.id, tenantId: mockTenant.id,
  refreshTokenHash: '', ipAddress: '127.0.0.1', userAgent: 'test-agent',
  expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), revokedAt: null,
  createdAt: new Date(), user: mockUser,
};

/** Helper: create a valid refresh token + session with matching hash */
function createRefreshTokenAndSession() {
  const refreshToken = signRefreshToken({
    userId: mockUser.id,
    tenantId: mockTenant.id,
    sessionId: mockSession.id,
  });
  const hash = sha256(refreshToken);
  const session = { ...mockSession, refreshTokenHash: hash };
  return { refreshToken, session };
}

describe('UserService', () => {
  let service: UserService;
  beforeAll(() => { loadJwtConfig(TEST_JWT_ENV); });
  beforeEach(() => { vi.clearAllMocks(); service = new UserService(); });

  // ── Matrix #83: User Creation ──────────────────────────────────────

  describe('register (#83)', () => {
    it('creates tenant, user (unverified), and returns verification job payload', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.tenant.create).mockResolvedValue(mockTenant as never);
      vi.mocked(prisma.user.create).mockResolvedValue({ ...mockUser, active: false, emailVerified: false } as never);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.register({
        email: 'analyst@acme.com', password: 'SecurePassword123!', displayName: 'Jane Analyst',
        tenantName: 'ACME Corp', tenantSlug: 'acme-corp', ipAddress: '127.0.0.1', userAgent: 'test-agent',
      });

      expect(result.message).toContain('verify your email');
      expect(result.emailJobPayload).toBeDefined();
      expect(result.emailJobPayload!.data.type).toBe('email_verification');
      expect(result.user.email).toBe('analyst@acme.com');
      expect(result.user.role).toBe('tenant_admin');
      expect(result.tenant.slug).toBe('acme-corp');
      expect(prisma.tenant.create).toHaveBeenCalledOnce();
      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ role: 'tenant_admin', active: false, emailVerified: false }),
      }));
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'USER_REGISTERED' }) }));
    });

    it('#84: rejects duplicate tenant slug', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant as never);
      await expect(service.register({ email: 'new@user.com', password: 'SecurePassword123!', displayName: 'New User', tenantName: 'ACME Corp', tenantSlug: 'acme-corp', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Tenant slug already taken');
    });

    it('#84: rejects duplicate email', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never);
      await expect(service.register({ email: 'analyst@acme.com', password: 'SecurePassword123!', displayName: 'Jane', tenantName: 'New Corp', tenantSlug: 'new-corp', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Email already registered');
    });

    it('#91: returns 409 status code for conflicts', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant as never);
      try { await service.register({ email: 'new@user.com', password: 'SecurePassword123!', displayName: 'New', tenantName: 'A', tenantSlug: 'acme-corp', ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('Should have thrown'); }
      catch (err: unknown) { const e = err as { statusCode: number; code: string }; expect(e.statusCode).toBe(409); expect(e.code).toBe('CONFLICT'); }
    });
  });

  // ── Matrix #85-86: User Authentication ─────────────────────────────

  describe('login (#85-86)', () => {
    it('#85: authenticates valid credentials and returns tokens', async () => {
      const { hashPassword } = await import('@etip/shared-auth');
      const hash = await hashPassword('SecurePassword123!');
      const userWithHash = { ...mockUser, passwordHash: hash };
      vi.mocked(prisma.user.findFirst).mockResolvedValue(userWithHash as never);
      vi.mocked(prisma.user.update).mockResolvedValue(userWithHash as never);
      vi.mocked(prisma.session.create).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.session.update).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(userWithHash as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.login({ email: 'analyst@acme.com', password: 'SecurePassword123!', ipAddress: '127.0.0.1', userAgent: 'test-agent' });
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('analyst@acme.com');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'USER_LOGIN' }) }));
    });

    it('#86: rejects nonexistent email', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      await expect(service.login({ email: 'nobody@nothing.com', password: 'whatever', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Invalid email or password');
    });

    it('#86: rejects wrong password', async () => {
      const { hashPassword } = await import('@etip/shared-auth');
      const hash = await hashPassword('CorrectPassword123!');
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, passwordHash: hash } as never);
      await expect(service.login({ email: 'analyst@acme.com', password: 'WrongPassword456!', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Invalid email or password');
    });

    it('#92: returns 401 with INVALID_CREDENTIALS code', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      try { await service.login({ email: 'nobody@nothing.com', password: 'whatever', ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('Should have thrown'); }
      catch (err: unknown) { const e = err as { statusCode: number; code: string }; expect(e.statusCode).toBe(401); expect(e.code).toBe('INVALID_CREDENTIALS'); }
    });

    it('rejects inactive user (email verified but account deactivated)', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, active: false, emailVerified: true } as never);
      await expect(service.login({ email: 'analyst@acme.com', password: 'whatever', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Account is deactivated');
    });

    it('rejects suspended tenant', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, emailVerified: true, tenant: { ...mockTenant, active: false } } as never);
      await expect(service.login({ email: 'analyst@acme.com', password: 'whatever', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Organization is suspended');
    });

    it('rejects user without password hash (SSO-only)', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, emailVerified: true, passwordHash: null } as never);
      await expect(service.login({ email: 'analyst@acme.com', password: 'whatever', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Password login not available');
    });
  });

  // ── Matrix #87: Token Refresh (Security-Critical) ──────────────────

  describe('refreshTokens (#87)', () => {
    it('happy path: valid refresh → new tokens returned, old session revoked', async () => {
      const { refreshToken, session } = createRefreshTokenAndSession();

      // findSessionById returns valid session with matching hash
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(session as never);
      // revokeSession (old session)
      vi.mocked(prisma.session.update).mockResolvedValueOnce({ ...session, revokedAt: new Date() } as never);
      // _createSession: findUserById
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
      // _createSession: createSession (new session)
      const newSession = { ...mockSession, id: '550e8400-e29b-41d4-a716-446655440040' };
      vi.mocked(prisma.session.create).mockResolvedValue(newSession as never);
      // _createSession: updateSessionHash (new session hash)
      vi.mocked(prisma.session.update).mockResolvedValue(newSession as never);

      const result = await service.refreshTokens({
        refreshToken, ipAddress: '127.0.0.1', userAgent: 'test-agent',
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(900);
      // Old session was revoked (first update call)
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockSession.id }, data: { revokedAt: expect.any(Date) } }),
      );
      // New session was created
      expect(prisma.session.create).toHaveBeenCalledOnce();
    });

    it('revoked session → revokeAllUserSessions called (theft detection)', async () => {
      const { refreshToken, session } = createRefreshTokenAndSession();
      const revokedSession = { ...session, revokedAt: new Date() };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(revokedSession as never);
      vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 3 } as never);

      try {
        await service.refreshTokens({ refreshToken, ipAddress: '127.0.0.1', userAgent: 'test' });
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { statusCode: number; code: string };
        expect(e.statusCode).toBe(401);
        expect(e.code).toBe('SESSION_REVOKED');
      }

      // Token theft detection: ALL user sessions revoked
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUser.id, revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it('expired session → 401 SESSION_EXPIRED', async () => {
      const { refreshToken, session } = createRefreshTokenAndSession();
      const expiredSession = { ...session, expiresAt: new Date(Date.now() - 1000) };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(expiredSession as never);

      try {
        await service.refreshTokens({ refreshToken, ipAddress: '127.0.0.1', userAgent: 'test' });
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { statusCode: number; code: string };
        expect(e.statusCode).toBe(401);
        expect(e.code).toBe('SESSION_EXPIRED');
      }

      // Should NOT have revoked all sessions — just a normal expiry
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('hash mismatch → revokeAllUserSessions called (replay detection)', async () => {
      const { refreshToken, session } = createRefreshTokenAndSession();
      // Tamper the stored hash so it won't match
      const mismatchSession = { ...session, refreshTokenHash: 'completely-wrong-hash-value' };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(mismatchSession as never);
      vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 2 } as never);

      try {
        await service.refreshTokens({ refreshToken, ipAddress: '127.0.0.1', userAgent: 'test' });
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { statusCode: number; code: string };
        expect(e.statusCode).toBe(401);
        expect(e.code).toBe('INVALID_REFRESH');
      }

      // Replay attack detection: ALL user sessions revoked
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUser.id, revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it('inactive user/tenant during refresh → 401 + session revoked', async () => {
      const inactiveUser = { ...mockUser, active: false };
      const { refreshToken } = createRefreshTokenAndSession();
      const sessionWithInactiveUser = {
        ...mockSession,
        refreshTokenHash: sha256(refreshToken),
        user: { ...inactiveUser, tenant: mockTenant },
      };

      vi.mocked(prisma.session.findUnique).mockResolvedValue(sessionWithInactiveUser as never);
      // revokeSession for the single session
      vi.mocked(prisma.session.update).mockResolvedValue({ ...sessionWithInactiveUser, revokedAt: new Date() } as never);

      try {
        await service.refreshTokens({ refreshToken, ipAddress: '127.0.0.1', userAgent: 'test' });
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { statusCode: number; code: string };
        expect(e.statusCode).toBe(401);
        expect(e.code).toBe('ACCOUNT_INACTIVE');
      }

      // Only THIS session revoked (not all — user is inactive, not compromised)
      expect(prisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockSession.id }, data: { revokedAt: expect.any(Date) } }),
      );
      // Should NOT have called updateMany (revokeAll)
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── Matrix #72 via service: Logout ─────────────────────────────────

  describe('logout', () => {
    it('revokes session', async () => {
      vi.mocked(prisma.session.update).mockResolvedValue({ ...mockSession, revokedAt: new Date() } as never);
      await service.logout(mockSession.id);
      expect(prisma.session.update).toHaveBeenCalledWith({ where: { id: mockSession.id }, data: { revokedAt: expect.any(Date) } });
    });
  });

  // ── Matrix #88, #90: User Profile ──────────────────────────────────

  describe('getProfile (#88, #90)', () => {
    it('#88: returns safe user data (no secrets)', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never);
      const profile = await service.getProfile(mockUser.id, mockTenant.id);
      expect(profile.id).toBe(mockUser.id);
      expect(profile.email).toBe(mockUser.email);
      expect(profile.displayName).toBe(mockUser.displayName);
      expect(profile.role).toBe('tenant_admin');
      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile).not.toHaveProperty('mfaSecret');
    });

    it('#90: throws 404 for nonexistent user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      await expect(service.getProfile('nonexistent-id', mockTenant.id)).rejects.toThrow('User not found');
    });

    it('#93: returns NOT_FOUND code for missing user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      try { await service.getProfile('nonexistent-id', mockTenant.id); expect.fail('Should have thrown'); }
      catch (err: unknown) { const e = err as { statusCode: number; code: string }; expect(e.statusCode).toBe(404); expect(e.code).toBe('NOT_FOUND'); }
    });
  });

  // ── Matrix #94: Internal Error Handling ────────────────────────────

  describe('error handling (#94)', () => {
    it('#94: _createSession throws 500 if user not found during login session creation', async () => {
      const { hashPassword } = await import('@etip/shared-auth');
      const hash = await hashPassword('SecurePassword123!');
      const userWithHash = { ...mockUser, passwordHash: hash, emailVerified: true };
      vi.mocked(prisma.user.findFirst).mockResolvedValue(userWithHash as never);
      vi.mocked(prisma.user.update).mockResolvedValue(userWithHash as never);
      // MFA check: findUserForMfa returns the user (MFA not enabled → no MFA required)
      // Then _createSession: findUserById returns null → 500
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ id: mockUser.id, email: mockUser.email, tenantId: mockUser.tenantId, mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaVerifiedAt: null } as never)
        .mockResolvedValueOnce(null as never); // _createSession lookup
      vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue(null as never);

      try {
        await service.login({ email: 'analyst@acme.com', password: 'SecurePassword123!', ipAddress: '127.0.0.1', userAgent: 'test' });
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { statusCode: number; code: string };
        expect(e.statusCode).toBe(500);
        expect(e.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
