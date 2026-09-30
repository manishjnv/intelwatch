/**
 * @module offboarding-service.test
 * @description Tests for I-19 — Organization offboarding lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OffboardingService, type OffboardingDeps } from '../src/services/offboarding-service.js';

function mockPrisma() {
  return {
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    apiKey: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
    ssoConfig: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    scimToken: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
}

function mockAuditLogger() {
  return { log: vi.fn() };
}

function mockSessionManager() {
  return { revokeAll: vi.fn().mockReturnValue(2) };
}

function createService(overrides: Partial<OffboardingDeps> = {}) {
  const prisma = mockPrisma();
  const auditLogger = mockAuditLogger();
  const sessionManager = mockSessionManager();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deps: OffboardingDeps = {
    prisma: prisma as any,
    auditLogger: auditLogger as any,
    sessionManager: sessionManager as any,
    ...overrides,
  };
  return { service: new OffboardingService(deps), prisma, auditLogger, sessionManager };
}

describe('OffboardingService (I-19)', () => {
  describe('initiateOffboarding', () => {
    it('rejects system tenant', async () => {
      const { service } = createService();
      await expect(
        service.initiateOffboarding('00000000-0000-0000-0000-000000000000', 'admin@test.com', 'other-tenant'),
      ).rejects.toThrow('Cannot offboard the system tenant');
    });

    it('rejects self-org offboarding', async () => {
      const { service } = createService();
      await expect(
        service.initiateOffboarding('tenant-1', 'admin@test.com', 'tenant-1'),
      ).rejects.toThrow('Cannot offboard your own organization');
    });

    it('rejects when tenant not found', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(
        service.initiateOffboarding('tenant-1', 'admin@test.com', 'other-tenant'),
      ).rejects.toThrow('Tenant not found');
    });

    it('rejects already purged tenant', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', offboardingStatus: 'purged' });
      await expect(
        service.initiateOffboarding('tenant-1', 'admin@test.com', 'other-tenant'),
      ).rejects.toThrow('already been purged');
    });

    it('rejects already offboarding tenant', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', offboardingStatus: 'offboarding' });
      await expect(
        service.initiateOffboarding('tenant-1', 'admin@test.com', 'other-tenant'),
      ).rejects.toThrow('already being offboarded');
    });

    it('successfully initiates offboarding', async () => {
      const { service, prisma, auditLogger, sessionManager } = createService();
      prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', offboardingStatus: 'active' });
      prisma.tenant.update.mockResolvedValue({});
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

      const result = await service.initiateOffboarding('tenant-1', 'admin@super.com', 'super-tenant');

      expect(result.tenantId).toBe('tenant-1');
      expect(result.offboardingStatus).toBe('offboarding');
      expect(result.offboardedBy).toBe('admin@super.com');
      expect(result.message).toBe('Tenant deactivated. All data is retained; cancel offboarding to reactivate.');
      expect(result.message).not.toMatch(/purge/i);

      // Verify steps executed
      expect(prisma.tenant.update).toHaveBeenCalledOnce();
      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ purgeScheduledAt: null }) }),
      );
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1' }, data: { active: false } }),
      );
      expect(sessionManager.revokeAll).toHaveBeenCalledTimes(2);
      expect(prisma.session.deleteMany).toHaveBeenCalledOnce();
      expect(prisma.apiKey.updateMany).toHaveBeenCalledOnce();
      expect(prisma.ssoConfig.updateMany).toHaveBeenCalledOnce();
      expect(prisma.scimToken.updateMany).toHaveBeenCalledOnce();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'offboarding.initiated',
          riskLevel: 'critical',
          details: expect.objectContaining({ dataRetained: true }),
        }),
      );
    });

    it('does not schedule a purge or queue an archive job', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', offboardingStatus: 'active' });
      prisma.tenant.update.mockResolvedValue({});

      const result = await service.initiateOffboarding('tenant-1', 'admin@super.com', 'super-tenant');

      expect(result.purgeScheduledAt).toBeNull();
    });
  });

  describe('cancelOffboarding', () => {
    it('rejects tenant not found', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.cancelOffboarding('t1', 'admin@test.com')).rejects.toThrow('Tenant not found');
    });

    it('rejects already purged', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1', offboardingStatus: 'purged' });
      await expect(service.cancelOffboarding('t1', 'admin@test.com')).rejects.toThrow('already been purged');
    });

    it('rejects when not offboarding', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1', offboardingStatus: 'active' });
      await expect(service.cancelOffboarding('t1', 'admin@test.com')).rejects.toThrow('not being offboarded');
    });

    it('successfully cancels offboarding', async () => {
      const { service, prisma, auditLogger } = createService();
      prisma.tenant.findUnique.mockResolvedValue({ id: 't1', offboardingStatus: 'offboarding' });
      prisma.tenant.update.mockResolvedValue({});

      const result = await service.cancelOffboarding('t1', 'admin@test.com');

      expect(result.offboardingStatus).toBe('active');
      expect(result.message).toContain('cancelled');
      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ active: true, offboardingStatus: 'active' }) }),
      );
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: true } }),
      );
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'offboarding.cancelled' }),
      );
    });
  });

  describe('getStatus', () => {
    it('returns tenant status', async () => {
      const { service, prisma } = createService();
      const now = new Date();
      prisma.tenant.findUnique.mockResolvedValue({
        id: 't1', name: 'Test Org', offboardingStatus: 'offboarding',
        offboardedAt: now, offboardedBy: 'admin@test.com',
        purgeScheduledAt: new Date(now.getTime() + 60 * 86400000),
        archivePath: null, archiveHash: null,
      });

      const result = await service.getStatus('t1');
      expect(result.tenantId).toBe('t1');
      expect(result.offboardingStatus).toBe('offboarding');
      expect(result.offboardedBy).toBe('admin@test.com');
    });

    it('throws for unknown tenant', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.getStatus('t1')).rejects.toThrow('Tenant not found');
    });
  });

  describe('listPipeline', () => {
    it('returns deactivated tenants with no purge date', async () => {
      const { service, prisma } = createService();
      const now = new Date();
      prisma.tenant.findMany.mockResolvedValue([
        { id: 't1', name: 'A', offboardingStatus: 'offboarding', offboardedAt: now },
      ]);

      const result = await service.listPipeline();
      expect(result).toHaveLength(1);
      expect(result[0]!.tenantId).toBe('t1');
      expect(result[0]!.daysUntilPurge).toBeNull();
      expect(result[0]!.purgeScheduledAt).toBeNull();
      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { offboardingStatus: 'offboarding' } }),
      );
    });
  });
});
