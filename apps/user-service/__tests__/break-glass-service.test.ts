import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig } from '@etip/shared-auth';
import { BREAK_GLASS_AUDIT_EVENTS } from '@etip/shared-types';

vi.mock('../src/geoip.js', () => ({ enrichSessionGeo: vi.fn().mockResolvedValue(undefined) }));

// Mock otplib
vi.mock('otplib', () => ({
  verifySync: vi.fn(({ token }: { token: string }) =>
    token === '123456' ? { valid: true } : { valid: false }
  ),
}));

const { _auditCreate } = vi.hoisted(() => ({
  _auditCreate: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'audit-1', ...args.data, createdAt: new Date(), timestamp: new Date() })),
}));

vi.mock('../src/prisma.js', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    auditLog: {
      create: _auditCreate,
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: _auditCreate },
    })),
  },
  disconnectPrisma: vi.fn(),
}));

import { prisma } from '../src/prisma.js';
import { BreakGlassService } from '../src/break-glass-service.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

const mockBreakGlassUser = {
  id: '550e8400-e29b-41d4-a716-446655440099',
  tenantId: SYSTEM_TENANT_ID,
  email: 'breakglass@intelwatch.in',
  displayName: 'Break-Glass Emergency',
  avatarUrl: null,
  role: 'super_admin' as const,
  authProvider: 'email' as const,
  authProviderId: null,
  // bcrypt hash of 'SuperLongBreakGlassPassword123!'
  passwordHash: '$2a$12$LJ3mFN3T2Z5X5Y5X5Y5X5OOOOOOOOOOOOOOOOOOOOOOOmocked',
  designation: null,
  emailVerified: true,
  emailVerifyToken: null,
  emailVerifyExpires: null,
  mfaEnabled: false,
  mfaSecret: null,
  mfaBackupCodes: [],
  mfaVerifiedAt: null,
  isBreakGlass: true,
  breakGlassLastUsed: null,
  breakGlassUseCount: 2,
  lastLoginAt: null,
  loginCount: 0,
  externalId: null,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  tenant: {
    id: SYSTEM_TENANT_ID, name: 'IntelWatch Platform', slug: 'intelwatch-system',
    plan: 'enterprise', maxUsers: 100, maxFeedsPerDay: 10000, maxIOCs: 1000000,
    aiCreditsMonthly: 100000, aiCreditsUsed: 0, settings: {}, active: true,
    createdAt: new Date(), updatedAt: new Date(),
  },
};

const mockSession = {
  id: '550e8400-e29b-41d4-a716-446655440080',
  userId: mockBreakGlassUser.id,
  tenantId: SYSTEM_TENANT_ID,
  refreshTokenHash: 'break-glass-no-refresh',
  ipAddress: '10.0.0.1',
  userAgent: 'test-agent',
  expiresAt: new Date(Date.now() + 1800 * 1000),
  revokedAt: null,
  breakGlassSession: true,
  geoCountry: null,
  geoCity: null,
  geoIsp: null,
  createdAt: new Date(),
};

let bgService: BreakGlassService;

beforeAll(() => {
  loadJwtConfig(TEST_JWT_ENV);
  process.env['TI_BREAK_GLASS_OTP_SECRET'] = 'JBSWY3DPEHPK3PXP';
});

beforeEach(() => {
  vi.clearAllMocks();
  // Reset return values (clearAllMocks does not reset them)
  vi.mocked(prisma.user.findFirst).mockReset();
  vi.mocked(prisma.user.update).mockReset();
  vi.mocked(prisma.session.create).mockReset();
  vi.mocked(prisma.session.findFirst).mockReset();
  vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 0 });
  vi.mocked(prisma.auditLog.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
  vi.mocked(prisma.$transaction).mockImplementation(
    (fn: (tx: unknown) => Promise<unknown>) => fn({
      auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: _auditCreate },
    }),
  );
  bgService = new BreakGlassService();
});

// ── Mock password verification ──────────────────────────────────────
vi.mock('@etip/shared-auth', async () => {
  const actual = await vi.importActual<typeof import('@etip/shared-auth')>('@etip/shared-auth');
  return {
    ...actual,
    verifyPassword: vi.fn(async (password: string, _hash: string) =>
      password === 'SuperLongBreakGlassPassword123!'),
    hashPassword: vi.fn(async () => '$2a$12$newhashmocked'),
  };
});

describe('BreakGlassService', () => {
  describe('login', () => {
    it('succeeds with valid credentials + OTP', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockBreakGlassUser);
      vi.mocked(prisma.session.create).mockResolvedValue(mockSession);
      vi.mocked(prisma.user.update).mockResolvedValue(mockBreakGlassUser);

      const result = await bgService.login({
        email: 'breakglass@intelwatch.in',
        password: 'SuperLongBreakGlassPassword123!',
        otp: '123456',
        ipAddress: '10.0.0.1',
        userAgent: 'test-agent',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.expiresIn).toBe(1800);
      expect(result.renewable).toBe(false);
      expect(result.warning).toContain('30 minutes');
    });

    it('rejects with wrong password', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockBreakGlassUser);

      await expect(bgService.login({
        email: 'breakglass@intelwatch.in',
        password: 'WrongPasswordThatIsLongEnough!!!',
        otp: '123456',
        ipAddress: '10.0.0.2',
        userAgent: 'test-agent',
      })).rejects.toThrow('Invalid credentials');
    });

    it('rejects with wrong OTP', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockBreakGlassUser);

      await expect(bgService.login({
        email: 'breakglass@intelwatch.in',
        password: 'SuperLongBreakGlassPassword123!',
        otp: '999999',
        ipAddress: '10.0.0.3',
        userAgent: 'test-agent',
      })).rejects.toThrow('Invalid credentials');
    });

    it('rejects non-break-glass email with 404 generic', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await expect(bgService.login({
        email: 'normal@acme.com',
        password: 'SomePassword12345678!',
        otp: '123456',
        ipAddress: '10.0.0.4',
        userAgent: 'test-agent',
      })).rejects.toThrow('Invalid credentials');
    });

    it('rate-limits after 3 failed attempts from same IP', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockBreakGlassUser);

      for (let i = 0; i < 3; i++) {
        await expect(bgService.login({
          email: 'breakglass@intelwatch.in',
          password: 'WrongPasswordThatIsLongEnough!!!',
          otp: '123456',
          ipAddress: '10.0.0.5',
          userAgent: 'test-agent',
        })).rejects.toThrow('Invalid credentials');
      }

      // 4th attempt from same IP should be rate-limited
      await expect(bgService.login({
        email: 'breakglass@intelwatch.in',
        password: 'SuperLongBreakGlassPassword123!',
        otp: '123456',
        ipAddress: '10.0.0.5',
        userAgent: 'test-agent',
      })).rejects.toThrow('Too many break-glass attempts');
    });

    it('terminates existing break-glass session on new login', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockBreakGlassUser);
      vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.session.create).mockResolvedValue(mockSession);
      vi.mocked(prisma.user.update).mockResolvedValue(mockBreakGlassUser);

      const result = await bgService.login({
        email: 'breakglass@intelwatch.in',
        password: 'SuperLongBreakGlassPassword123!',
        otp: '123456',
        ipAddress: '10.0.0.6',
        userAgent: 'test-agent',
      });

      expect(result.accessToken).toBeDefined();
      // Session replaced audit logged
      expect(_auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: BREAK_GLASS_AUDIT_EVENTS.SESSION_REPLACED,
          }),
        }),
      );
    });

    it('logs audit on success with critical risk level', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockBreakGlassUser);
      vi.mocked(prisma.session.create).mockResolvedValue(mockSession);
      vi.mocked(prisma.user.update).mockResolvedValue(mockBreakGlassUser);

      await bgService.login({
        email: 'breakglass@intelwatch.in',
        password: 'SuperLongBreakGlassPassword123!',
        otp: '123456',
        ipAddress: '10.0.0.7',
        userAgent: 'test-agent',
      });

      expect(_auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: BREAK_GLASS_AUDIT_EVENTS.LOGIN_SUCCESS,
            changes: expect.objectContaining({ riskLevel: 'critical' }),
          }),
        }),
      );
    });

    it('queues alert payload on success', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockBreakGlassUser);
      vi.mocked(prisma.session.create).mockResolvedValue(mockSession);
      vi.mocked(prisma.user.update).mockResolvedValue(mockBreakGlassUser);

      await bgService.login({
        email: 'breakglass@intelwatch.in',
        password: 'SuperLongBreakGlassPassword123!',
        otp: '123456',
        ipAddress: '10.0.0.8',
        userAgent: 'test-agent',
      });

      const alert = bgService.getAndClearAlertPayload();
      expect(alert).toBeDefined();
      expect(alert!.type).toBe('break_glass_login');
      expect(alert!.severity).toBe('critical');
      expect(alert!.breakGlassUserId).toBe(mockBreakGlassUser.id);
    });
  });

  describe('getStatus', () => {
    it('returns configured=false when no break-glass user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const status = await bgService.getStatus();
      expect(status.configured).toBe(false);
      expect(status.useCount).toBe(0);
    });

    it('returns status with active session', async () => {
      vi.mocked(prisma.user.findFirst)
        .mockResolvedValueOnce(mockBreakGlassUser)
        .mockResolvedValueOnce(null); // findActiveBreakGlassSession uses session.findFirst
      vi.mocked(prisma.session.findFirst).mockResolvedValue(mockSession);

      const status = await bgService.getStatus();
      expect(status.configured).toBe(true);
      expect(status.useCount).toBe(2);
      expect(status.activeSession).toBeDefined();
      expect(status.activeSession!.sessionId).toBe(mockSession.id);
    });
  });

  describe('rotatePassword', () => {
    it('rotates password and terminates sessions', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockBreakGlassUser);
      vi.mocked(prisma.user.update).mockResolvedValue(mockBreakGlassUser);
      vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 1 });

      await bgService.rotatePassword(
        'NewSuperLongPassword123456!',
        'admin-user-id',
        '10.0.0.10',
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: '$2a$12$newhashmocked' }),
        }),
      );

      expect(_auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: BREAK_GLASS_AUDIT_EVENTS.PASSWORD_ROTATED,
          }),
        }),
      );
    });

    it('rejects password shorter than 20 chars', async () => {
      await expect(
        bgService.rotatePassword('short', 'admin-id', '10.0.0.11'),
      ).rejects.toThrow('at least 20 characters');
    });

    it('rejects when break-glass not configured', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await expect(
        bgService.rotatePassword('NewSuperLongPassword123456!', 'admin-id', '10.0.0.12'),
      ).rejects.toThrow('not configured');
    });
  });

  describe('forceTerminateSessions', () => {
    it('terminates sessions and audits', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(mockBreakGlassUser);
      vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 1 });

      const count = await bgService.forceTerminateSessions('admin-user-id', '10.0.0.13');
      expect(count).toBe(1);

      expect(_auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: BREAK_GLASS_AUDIT_EVENTS.SESSION_FORCE_TERMINATED,
          }),
        }),
      );
    });
  });

  describe('getAuditLog', () => {
    it('returns audit entries', async () => {
      const mockEntries = [{ id: '1', action: 'break_glass.login.success', timestamp: new Date() }];
      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(mockEntries as never);

      const entries = await bgService.getAuditLog(50, 0);
      expect(entries).toHaveLength(1);
    });
  });
});
