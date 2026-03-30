/**
 * @module retention-service.test
 * @description Tests for I-20 — Data retention enforcement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetentionService, type RetentionDeps } from '../src/services/retention-service.js';

function mockPrisma() {
  return {
    tenant: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    tenantFeatureOverride: { findFirst: vi.fn().mockResolvedValue(null) },
    subscriptionPlanDefinition: { findFirst: vi.fn().mockResolvedValue(null) },
    planFeatureLimit: { findFirst: vi.fn().mockResolvedValue(null) },
    ioc: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0) },
    threatActorProfile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0) },
    malwareProfile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0) },
    vulnerabilityProfile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0) },
    article: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0) },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

function mockAuditLogger() {
  return { log: vi.fn() };
}

function createService() {
  const prisma = mockPrisma();
  const auditLogger = mockAuditLogger();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new RetentionService({ prisma: prisma as any, auditLogger: auditLogger as any });
  return { service, prisma, auditLogger };
}

describe('RetentionService (I-20)', () => {
  describe('enforceRetention', () => {
    it('skips enterprise tenants (unlimited retention)', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findMany.mockResolvedValue([
        { id: 't1', name: 'Enterprise Corp', plan: 'enterprise' },
      ]);

      const results = await service.enforceRetention();
      // Enterprise has -1 retention, should be skipped
      expect(results).toHaveLength(0);
      expect(prisma.ioc.updateMany).not.toHaveBeenCalled();
    });

    it('archives records for free plan (30-day retention)', async () => {
      const { service, prisma, auditLogger } = createService();
      prisma.tenant.findMany.mockResolvedValue([
        { id: 't1', name: 'Free Org', plan: 'free' },
      ]);
      prisma.ioc.updateMany.mockResolvedValue({ count: 5 });

      const results = await service.enforceRetention();
      expect(results).toHaveLength(1);
      expect(results[0]!.retentionDays).toBe(30);
      expect(results[0]!.recordsArchived.iocs).toBe(5);

      // Should audit when records archived
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'data_retention.enforced', riskLevel: 'medium' }),
      );
    });

    it('does not audit when zero records archived', async () => {
      const { service, prisma, auditLogger } = createService();
      prisma.tenant.findMany.mockResolvedValue([
        { id: 't1', name: 'Clean Org', plan: 'free' },
      ]);

      const results = await service.enforceRetention();
      expect(results).toHaveLength(1);
      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    it('uses tenant feature override when present', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findMany.mockResolvedValue([
        { id: 't1', name: 'Custom Org', plan: 'free' },
      ]);
      prisma.tenantFeatureOverride.findFirst.mockResolvedValue({ limitTotal: 60 });

      const results = await service.enforceRetention();
      expect(results[0]!.retentionDays).toBe(60);
    });

    it('uses plan feature limit when defined', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findMany.mockResolvedValue([
        { id: 't1', name: 'Starter Org', plan: 'starter' },
      ]);
      prisma.subscriptionPlanDefinition.findFirst.mockResolvedValue({ id: 'plan-1' });
      prisma.planFeatureLimit.findFirst.mockResolvedValue({ limitTotal: 120 });

      const results = await service.enforceRetention();
      expect(results[0]!.retentionDays).toBe(120);
    });

    it('cleans up expired sessions', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findMany.mockResolvedValue([]);

      await service.enforceRetention();
      expect(prisma.session.deleteMany).toHaveBeenCalledOnce();
    });

    it('skips offboarding tenants', async () => {
      const { service, prisma } = createService();
      // findMany already filters these out — just verify the query
      prisma.tenant.findMany.mockResolvedValue([]);

      await service.enforceRetention();
      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            active: true,
            offboardingStatus: { not: 'offboarding' },
          }),
        }),
      );
    });

    it('archives all 5 data types', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findMany.mockResolvedValue([{ id: 't1', name: 'Org', plan: 'free' }]);
      prisma.ioc.updateMany.mockResolvedValue({ count: 2 });
      prisma.threatActorProfile.updateMany.mockResolvedValue({ count: 3 });
      prisma.malwareProfile.updateMany.mockResolvedValue({ count: 1 });
      prisma.vulnerabilityProfile.updateMany.mockResolvedValue({ count: 4 });
      prisma.article.updateMany.mockResolvedValue({ count: 5 });

      const results = await service.enforceRetention();
      const archived = results[0]!.recordsArchived;
      expect(archived.iocs).toBe(2);
      expect(archived.threatActors).toBe(3);
      expect(archived.malwareProfiles).toBe(1);
      expect(archived.vulnerabilityProfiles).toBe(4);
      expect(archived.articles).toBe(5);
    });
  });

  describe('getTenantRetentionInfo', () => {
    it('returns retention info for a free tenant', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue({ plan: 'free' });

      const info = await service.getTenantRetentionInfo('t1');
      expect(info.retentionDays).toBe(30);
      expect(info.plan).toBe('free');
      expect(info.upgradeForMore).toBeDefined();
      expect(info.upgradeForMore!.plan).toBe('starter');
      expect(info.nextRunAt).toBeDefined();
    });

    it('returns null upgrade for enterprise', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue({ plan: 'enterprise' });

      const info = await service.getTenantRetentionInfo('t1');
      expect(info.retentionDays).toBe(-1);
      expect(info.upgradeForMore).toBeNull();
      expect(info.recordsAtRisk.iocs).toBe(0);
    });

    it('falls back to free plan for unknown tenant', async () => {
      const { service, prisma } = createService();
      prisma.tenant.findUnique.mockResolvedValue(null);

      const info = await service.getTenantRetentionInfo('t1');
      expect(info.plan).toBe('free');
      expect(info.retentionDays).toBe(30);
    });
  });

  describe('getAdminStatus', () => {
    it('returns admin status with nextRunAt', async () => {
      const { service } = createService();
      const status = await service.getAdminStatus();
      expect(status.nextRunAt).toBeDefined();
      expect(Array.isArray(status.tenants)).toBe(true);
    });
  });

  describe('getHistory', () => {
    it('returns copy of run history', () => {
      const { service } = createService();
      const history = service.getHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
