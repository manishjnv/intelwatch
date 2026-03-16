/**
 * @module @etip/user-service/__tests__/service.test
 * @description Tests for UserService business logic.
 * Mocks Prisma and shared-auth to test pure business logic.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig } from '@etip/shared-auth';

// ── Mock Prisma ──────────────────────────────────────────────────────
vi.mock('../src/prisma.js', () => ({
  prisma: {
    tenant: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  disconnectPrisma: vi.fn(),
}));

// Import after mock setup
import { prisma } from '../src/prisma.js';
import { UserService } from '../src/service.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

const mockTenant = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  name: 'ACME Corp',
  slug: 'acme-corp',
  plan: 'free',
  maxUsers: 5,
  maxFeedsPerDay: 10,
  maxIOCs: 10000,
  aiCreditsMonthly: 100,
  aiCreditsUsed: 0,
  settings: {},
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  tenantId: mockTenant.id,
  email: 'analyst@acme.com',
  displayName: 'Jane Analyst',
  avatarUrl: null,
  role: 'tenant_admin' as const,
  authProvider: 'email' as const,
  authProviderId: null,
  passwordHash: '', // Will be set in beforeEach
  mfaEnabled: false,
  mfaSecret: null,
  lastLoginAt: null,
  loginCount: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  tenant: mockTenant,
};

const mockSession = {
  id: '550e8400-e29b-41d4-a716-446655440030',
  userId: mockUser.id,
  tenantId: mockTenant.id,
  refreshTokenHash: '',
  ipAddress: '127.0.0.1',
  userAgent: 'test-agent',
  expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  revokedAt: null,
  createdAt: new Date(),
  user: mockUser,
};

describe('UserService', () => {
  let service: UserService;

  beforeAll(() => {
    loadJwtConfig(TEST_JWT_ENV);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserService();
  });

  describe('register', () => {
    it('creates tenant, user, session, and returns tokens', async () => {
      // Arrange: No existing tenant or user
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.tenant.create).mockResolvedValue(mockTenant as never);
      vi.mocked(prisma.user.create).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.session.create).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.session.update).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      // Act
      const result = await service.register({
        email: 'analyst@acme.com',
        password: 'SecurePassword123!',
        displayName: 'Jane Analyst',
        tenantName: 'ACME Corp',
        tenantSlug: 'acme-corp',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      // Assert
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(900);
      expect(result.user.email).toBe('analyst@acme.com');
      expect(result.user.displayName).toBe('Jane Analyst');
      expect(result.user.role).toBe('tenant_admin');
      expect(result.tenant.slug).toBe('acme-corp');
      expect(result.tenant.plan).toBe('free');

      // Verify tenant created
      expect(prisma.tenant.create).toHaveBeenCalledOnce();
      // Verify user created with tenant_admin role
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'tenant_admin',
            authProvider: 'email',
          }),
        })
      );
      // Verify session created
      expect(prisma.session.create).toHaveBeenCalledOnce();
      // Verify audit log
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'USER_REGISTERED',
          }),
        })
      );
    });

    it('rejects duplicate tenant slug', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant as never);

      await expect(
        service.register({
          email: 'new@user.com',
          password: 'SecurePassword123!',
          displayName: 'New User',
          tenantName: 'ACME Corp',
          tenantSlug: 'acme-corp',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('Tenant slug already taken');
    });

    it('rejects duplicate email', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never);

      await expect(
        service.register({
          email: 'analyst@acme.com',
          password: 'SecurePassword123!',
          displayName: 'Jane Analyst',
          tenantName: 'New Corp',
          tenantSlug: 'new-corp',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('Email already registered');
    });

    it('returns 409 status code for conflicts', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant as never);

      try {
        await service.register({
          email: 'new@user.com',
          password: 'SecurePassword123!',
          displayName: 'New User',
          tenantName: 'ACME Corp',
          tenantSlug: 'acme-corp',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        });
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { statusCode: number; code: string };
        expect(e.statusCode).toBe(409);
        expect(e.code).toBe('CONFLICT');
      }
    });
  });

  describe('login', () => {
    it('authenticates valid credentials and returns tokens', async () => {
      // Import hashPassword to create a real hash
      const { hashPassword } = await import('@etip/shared-auth');
      const hash = await hashPassword('SecurePassword123!');

      const userWithHash = { ...mockUser, passwordHash: hash };
      vi.mocked(prisma.user.findFirst).mockResolvedValue(userWithHash as never);
      vi.mocked(prisma.user.update).mockResolvedValue(userWithHash as never);
      vi.mocked(prisma.session.create).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.session.update).mockResolvedValue(mockSession as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(userWithHash as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.login({
        email: 'analyst@acme.com',
        password: 'SecurePassword123!',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user.email).toBe('analyst@acme.com');
      expect(result.user.role).toBe('tenant_admin');

      // Verify login stats updated
      expect(prisma.user.update).toHaveBeenCalled();
      // Verify audit log
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'USER_LOGIN',
          }),
        })
      );
    });

    it('rejects nonexistent email', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await expect(
        service.login({
          email: 'nobody@nothing.com',
          password: 'whatever',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('rejects wrong password', async () => {
      const { hashPassword } = await import('@etip/shared-auth');
      const hash = await hashPassword('CorrectPassword123!');
      const userWithHash = { ...mockUser, passwordHash: hash };
      vi.mocked(prisma.user.findFirst).mockResolvedValue(userWithHash as never);

      await expect(
        service.login({
          email: 'analyst@acme.com',
          password: 'WrongPassword456!',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('Invalid email or password');
    });

    it('rejects inactive user', async () => {
      const inactiveUser = { ...mockUser, active: false };
      vi.mocked(prisma.user.findFirst).mockResolvedValue(inactiveUser as never);

      await expect(
        service.login({
          email: 'analyst@acme.com',
          password: 'whatever',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('Account is deactivated');
    });

    it('rejects suspended tenant', async () => {
      const suspendedTenant = { ...mockTenant, active: false };
      const userWithSuspendedTenant = { ...mockUser, tenant: suspendedTenant };
      vi.mocked(prisma.user.findFirst).mockResolvedValue(userWithSuspendedTenant as never);

      await expect(
        service.login({
          email: 'analyst@acme.com',
          password: 'whatever',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('Organization is suspended');
    });

    it('rejects user without password hash (SSO-only)', async () => {
      const ssoUser = { ...mockUser, passwordHash: null };
      vi.mocked(prisma.user.findFirst).mockResolvedValue(ssoUser as never);

      await expect(
        service.login({
          email: 'analyst@acme.com',
          password: 'whatever',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        })
      ).rejects.toThrow('Password login not available');
    });

    it('returns 401 for invalid credentials', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      try {
        await service.login({
          email: 'nobody@nothing.com',
          password: 'whatever',
          ipAddress: '127.0.0.1',
          userAgent: 'test',
        });
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { statusCode: number; code: string };
        expect(e.statusCode).toBe(401);
        expect(e.code).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  describe('logout', () => {
    it('revokes session', async () => {
      vi.mocked(prisma.session.update).mockResolvedValue({
        ...mockSession,
        revokedAt: new Date(),
      } as never);

      await service.logout(mockSession.id);

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: mockSession.id },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('getProfile', () => {
    it('returns safe user data', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never);

      const profile = await service.getProfile(mockUser.id, mockTenant.id);

      expect(profile.id).toBe(mockUser.id);
      expect(profile.email).toBe(mockUser.email);
      expect(profile.displayName).toBe(mockUser.displayName);
      expect(profile.role).toBe('tenant_admin');
      // Verify no sensitive fields
      expect(profile).not.toHaveProperty('passwordHash');
      expect(profile).not.toHaveProperty('mfaSecret');
    });

    it('throws 404 for nonexistent user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await expect(
        service.getProfile('nonexistent-id', mockTenant.id)
      ).rejects.toThrow('User not found');
    });
  });
});
