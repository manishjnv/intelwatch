import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig } from '@etip/shared-auth';

vi.mock('../src/prisma.js', () => ({
  prisma: {
    tenant: { create: vi.fn(), findUnique: vi.fn() },
    user: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    session: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
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
  passwordHash: '', mfaEnabled: false, mfaSecret: null, lastLoginAt: null, loginCount: 0,
  active: true, createdAt: new Date(), updatedAt: new Date(), tenant: mockTenant,
};

const mockSession = {
  id: '550e8400-e29b-41d4-a716-446655440030', userId: mockUser.id, tenantId: mockTenant.id,
  refreshTokenHash: '', ipAddress: '127.0.0.1', userAgent: 'test-agent',
  expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), revokedAt: null,
  createdAt: new Date(), user: mockUser,
};

describe('UserService', () => {
  let service: UserService;
  beforeAll(() => { loadJwtConfig(TEST_JWT_ENV); });
  beforeEach(() => { vi.clearAllMocks(); service = new UserService(); });

  // ── Matrix #83: User Creation ──────────────────────────────────────

  describe('register (#83)', () => {
    it('creates tenant, user, session, and returns tokens', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.tenant.create).mockResolvedValue(mockTenant as never);
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.session.create).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.session.update).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.register({
        email: 'analyst@acme.com', password: 'SecurePassword123!', displayName: 'Jane Analyst',
        tenantName: 'ACME Corp', tenantSlug: 'acme-corp', ipAddress: '127.0.0.1', userAgent: 'test-agent',
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(900);
      expect(result.user.email).toBe('analyst@acme.com');
      expect(result.user.role).toBe('tenant_admin');
      expect(result.tenant.slug).toBe('acme-corp');
      expect(prisma.tenant.create).toHaveBeenCalledOnce();
      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'tenant_admin' }) }));
      expect(prisma.session.create).toHaveBeenCalledOnce();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'USER_REGISTERED' }) }));
    });

    // Matrix #84: Validate — duplicate slug
    it('#84: rejects duplicate tenant slug', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant as never);
      await expect(service.register({ email: 'new@user.com', password: 'SecurePassword123!', displayName: 'New User', tenantName: 'ACME Corp', tenantSlug: 'acme-corp', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Tenant slug already taken');
    });

    // Matrix #84: Validate — duplicate email
    it('#84: rejects duplicate email', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never);
      await expect(service.register({ email: 'analyst@acme.com', password: 'SecurePassword123!', displayName: 'Jane', tenantName: 'New Corp', tenantSlug: 'new-corp', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Email already registered');
    });

    // Matrix #91: 409 Conflict format
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

    // Matrix #92: 401 format
    it('#92: returns 401 with INVALID_CREDENTIALS code', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      try { await service.login({ email: 'nobody@nothing.com', password: 'whatever', ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('Should have thrown'); }
      catch (err: unknown) { const e = err as { statusCode: number; code: string }; expect(e.statusCode).toBe(401); expect(e.code).toBe('INVALID_CREDENTIALS'); }
    });

    // Security: inactive user
    it('rejects inactive user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, active: false } as never);
      await expect(service.login({ email: 'analyst@acme.com', password: 'whatever', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Account is deactivated');
    });

    // Security: suspended tenant
    it('rejects suspended tenant', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, tenant: { ...mockTenant, active: false } } as never);
      await expect(service.login({ email: 'analyst@acme.com', password: 'whatever', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Organization is suspended');
    });

    // Security: SSO-only user
    it('rejects user without password hash (SSO-only)', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, passwordHash: null } as never);
      await expect(service.login({ email: 'analyst@acme.com', password: 'whatever', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Password login not available');
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

    // Matrix #93: 404 format
    it('#93: returns NOT_FOUND code for missing user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      try { await service.getProfile('nonexistent-id', mockTenant.id); expect.fail('Should have thrown'); }
      catch (err: unknown) { const e = err as { statusCode: number; code: string }; expect(e.statusCode).toBe(404); expect(e.code).toBe('NOT_FOUND'); }
    });
  });

  // ── Matrix #94: Internal Error Handling ────────────────────────────

  describe('error handling (#94)', () => {
    it('#94: _createSession throws 500 if user not found after creation', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.tenant.create).mockResolvedValue(mockTenant as never);
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser as never);
      // findUserById returns null — simulates internal error
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      try {
        await service.register({ email: 'test@test.com', password: 'SecurePassword123!', displayName: 'Test', tenantName: 'Test', tenantSlug: 'test-slug', ipAddress: '127.0.0.1', userAgent: 'test' });
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { statusCode: number; code: string };
        expect(e.statusCode).toBe(500);
        expect(e.code).toBe('INTERNAL_ERROR');
      }
    });
  });
});
