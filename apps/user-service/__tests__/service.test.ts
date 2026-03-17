import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig, signRefreshToken } from '@etip/shared-auth';
import { sha256 } from '@etip/shared-utils';

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

const TEST_JWT_ENV = { TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!', TI_JWT_ISSUER: 'test-issuer', TI_JWT_ACCESS_EXPIRY: '900', TI_JWT_REFRESH_EXPIRY: '604800' };
const mockTenant = { id: '550e8400-e29b-41d4-a716-446655440010', name: 'ACME Corp', slug: 'acme-corp', plan: 'free', maxUsers: 5, maxFeedsPerDay: 10, maxIOCs: 10000, aiCreditsMonthly: 100, aiCreditsUsed: 0, settings: {}, active: true, createdAt: new Date(), updatedAt: new Date() };
const mockUser = { id: '550e8400-e29b-41d4-a716-446655440020', tenantId: mockTenant.id, email: 'analyst@acme.com', displayName: 'Jane Analyst', avatarUrl: null, role: 'tenant_admin' as const, authProvider: 'email' as const, authProviderId: null, passwordHash: '', mfaEnabled: false, mfaSecret: null, lastLoginAt: null, loginCount: 0, active: true, createdAt: new Date(), updatedAt: new Date(), tenant: mockTenant };
const mockSession = { id: '550e8400-e29b-41d4-a716-446655440030', userId: mockUser.id, tenantId: mockTenant.id, refreshTokenHash: '', ipAddress: '127.0.0.1', userAgent: 'test-agent', expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), revokedAt: null, createdAt: new Date(), user: mockUser };

function createRefreshTokenAndSession() {
  const refreshToken = signRefreshToken({ userId: mockUser.id, tenantId: mockTenant.id, sessionId: mockSession.id });
  return { refreshToken, session: { ...mockSession, refreshTokenHash: sha256(refreshToken) } };
}

describe('UserService', () => {
  let service: UserService;
  beforeAll(() => { loadJwtConfig(TEST_JWT_ENV); });
  beforeEach(() => { vi.clearAllMocks(); service = new UserService(); });

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
      const result = await service.register({ email: 'analyst@acme.com', password: 'SecurePassword123!', displayName: 'Jane Analyst', tenantName: 'ACME Corp', tenantSlug: 'acme-corp', ipAddress: '127.0.0.1', userAgent: 'test-agent' });
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(900);
      expect(prisma.tenant.create).toHaveBeenCalledOnce();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'USER_REGISTERED' }) }));
    });
    it('rejects duplicate tenant slug', async () => { vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant as never); await expect(service.register({ email: 'x@x.com', password: 'SecurePassword123!', displayName: 'X', tenantName: 'A', tenantSlug: 'acme-corp', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Tenant slug already taken'); });
    it('rejects duplicate email', async () => { vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null); vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never); await expect(service.register({ email: 'analyst@acme.com', password: 'SecurePassword123!', displayName: 'Jane', tenantName: 'New', tenantSlug: 'new', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Email already registered'); });
    it('returns 409 for conflicts', async () => { vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant as never); try { await service.register({ email: 'x@x.com', password: 'SecurePassword123!', displayName: 'X', tenantName: 'A', tenantSlug: 'acme-corp', ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('err'); } catch (e: unknown) { expect((e as {statusCode:number}).statusCode).toBe(409); } });
  });

  describe('login (#85-86)', () => {
    it('authenticates valid credentials', async () => { const { hashPassword } = await import('@etip/shared-auth'); const hash = await hashPassword('SecurePassword123!'); const u = { ...mockUser, passwordHash: hash }; vi.mocked(prisma.user.findFirst).mockResolvedValue(u as never); vi.mocked(prisma.user.update).mockResolvedValue(u as never); vi.mocked(prisma.session.create).mockResolvedValue(mockSession as never); vi.mocked(prisma.session.update).mockResolvedValue(mockSession as never); vi.mocked(prisma.user.findUnique).mockResolvedValue(u as never); vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never); const r = await service.login({ email: 'analyst@acme.com', password: 'SecurePassword123!', ipAddress: '127.0.0.1', userAgent: 'test' }); expect(r.accessToken).toBeTruthy(); });
    it('rejects nonexistent email', async () => { vi.mocked(prisma.user.findFirst).mockResolvedValue(null); await expect(service.login({ email: 'nobody@x.com', password: 'x', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Invalid email or password'); });
    it('rejects wrong password', async () => { const { hashPassword } = await import('@etip/shared-auth'); vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, passwordHash: await hashPassword('Correct123!') } as never); await expect(service.login({ email: 'analyst@acme.com', password: 'Wrong456!', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Invalid email or password'); });
    it('returns 401 INVALID_CREDENTIALS', async () => { vi.mocked(prisma.user.findFirst).mockResolvedValue(null); try { await service.login({ email: 'x@x.com', password: 'x', ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('err'); } catch (e: unknown) { expect((e as {statusCode:number}).statusCode).toBe(401); expect((e as {code:string}).code).toBe('INVALID_CREDENTIALS'); } });
    it('rejects inactive user', async () => { vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, active: false } as never); await expect(service.login({ email: 'analyst@acme.com', password: 'x', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Account is deactivated'); });
    it('rejects suspended tenant', async () => { vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, tenant: { ...mockTenant, active: false } } as never); await expect(service.login({ email: 'analyst@acme.com', password: 'x', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Organization is suspended'); });
    it('rejects SSO-only user', async () => { vi.mocked(prisma.user.findFirst).mockResolvedValue({ ...mockUser, passwordHash: null } as never); await expect(service.login({ email: 'analyst@acme.com', password: 'x', ipAddress: '127.0.0.1', userAgent: 'test' })).rejects.toThrow('Password login not available'); });
  });

  describe('refreshTokens (#87)', () => {
    it('happy path: rotates tokens and revokes old session', async () => {
      const { refreshToken, session } = createRefreshTokenAndSession();
      vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(session as never);
      vi.mocked(prisma.session.update).mockResolvedValueOnce({ ...session, revokedAt: new Date() } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.session.create).mockResolvedValue({ ...mockSession, id: 'new-sess' } as never);
      vi.mocked(prisma.session.update).mockResolvedValue({ ...mockSession, id: 'new-sess' } as never);
      const r = await service.refreshTokens({ refreshToken, ipAddress: '127.0.0.1', userAgent: 'test' });
      expect(r.accessToken).toBeTruthy();
      expect(r.expiresIn).toBe(900);
      expect(prisma.session.create).toHaveBeenCalledOnce();
    });
    it('revoked session -> revokeAll (theft detection)', async () => {
      const { refreshToken, session } = createRefreshTokenAndSession();
      vi.mocked(prisma.session.findUnique).mockResolvedValue({ ...session, revokedAt: new Date() } as never);
      vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 3 } as never);
      try { await service.refreshTokens({ refreshToken, ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('err'); } catch (e: unknown) { expect((e as {code:string}).code).toBe('SESSION_REVOKED'); }
      expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: mockUser.id, revokedAt: null } }));
    });
    it('expired session -> 401', async () => {
      const { refreshToken, session } = createRefreshTokenAndSession();
      vi.mocked(prisma.session.findUnique).mockResolvedValue({ ...session, expiresAt: new Date(Date.now() - 1000) } as never);
      try { await service.refreshTokens({ refreshToken, ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('err'); } catch (e: unknown) { expect((e as {code:string}).code).toBe('SESSION_EXPIRED'); }
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
    it('hash mismatch -> revokeAll (replay detection)', async () => {
      const { refreshToken, session } = createRefreshTokenAndSession();
      vi.mocked(prisma.session.findUnique).mockResolvedValue({ ...session, refreshTokenHash: 'wrong-hash' } as never);
      vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 2 } as never);
      try { await service.refreshTokens({ refreshToken, ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('err'); } catch (e: unknown) { expect((e as {code:string}).code).toBe('INVALID_REFRESH'); }
      expect(prisma.session.updateMany).toHaveBeenCalled();
    });
    it('inactive user during refresh -> 401 + session revoked', async () => {
      const { refreshToken } = createRefreshTokenAndSession();
      const sess = { ...mockSession, refreshTokenHash: sha256(refreshToken), user: { ...mockUser, active: false, tenant: mockTenant } };
      vi.mocked(prisma.session.findUnique).mockResolvedValue(sess as never);
      vi.mocked(prisma.session.update).mockResolvedValue({ ...sess, revokedAt: new Date() } as never);
      try { await service.refreshTokens({ refreshToken, ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('err'); } catch (e: unknown) { expect((e as {code:string}).code).toBe('ACCOUNT_INACTIVE'); }
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => { it('revokes session', async () => { vi.mocked(prisma.session.update).mockResolvedValue({ ...mockSession, revokedAt: new Date() } as never); await service.logout(mockSession.id); expect(prisma.session.update).toHaveBeenCalledWith({ where: { id: mockSession.id }, data: { revokedAt: expect.any(Date) } }); }); });

  describe('getProfile', () => {
    it('returns safe user data', async () => { vi.mocked(prisma.user.findFirst).mockResolvedValue(mockUser as never); const p = await service.getProfile(mockUser.id, mockTenant.id); expect(p.id).toBe(mockUser.id); expect(p).not.toHaveProperty('passwordHash'); });
    it('throws 404 for nonexistent', async () => { vi.mocked(prisma.user.findFirst).mockResolvedValue(null); await expect(service.getProfile('x', mockTenant.id)).rejects.toThrow('User not found'); });
    it('returns NOT_FOUND code', async () => { vi.mocked(prisma.user.findFirst).mockResolvedValue(null); try { await service.getProfile('x', mockTenant.id); expect.fail('err'); } catch (e: unknown) { expect((e as {code:string}).code).toBe('NOT_FOUND'); } });
  });

  describe('error handling', () => {
    it('_createSession throws 500 if user not found', async () => { vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null); vi.mocked(prisma.user.findFirst).mockResolvedValue(null); vi.mocked(prisma.tenant.create).mockResolvedValue(mockTenant as never); vi.mocked(prisma.user.create).mockResolvedValue(mockUser as never); vi.mocked(prisma.user.findUnique).mockResolvedValue(null); try { await service.register({ email: 'test@test.com', password: 'SecurePassword123!', displayName: 'T', tenantName: 'T', tenantSlug: 'ts', ipAddress: '127.0.0.1', userAgent: 'test' }); expect.fail('err'); } catch (e: unknown) { expect((e as {statusCode:number}).statusCode).toBe(500); } });
  });
});
