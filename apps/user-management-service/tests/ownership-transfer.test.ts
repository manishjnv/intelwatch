/**
 * @module ownership-transfer.test
 * @description Tests for I-21 — Data ownership transfer on user disable.
 */
import { describe, it, expect, vi } from 'vitest';
import { OwnershipTransferService, type OwnershipTransferDeps } from '../src/services/ownership-transfer-service.js';

function mockPrisma() {
  return {
    user: {
      findFirst: vi.fn(),
    },
  };
}

function mockAuditLogger() {
  return { log: vi.fn() };
}

function createService() {
  const prisma = mockPrisma();
  const auditLogger = mockAuditLogger();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new OwnershipTransferService({ prisma: prisma as any, auditLogger: auditLogger as any });
  return { service, prisma, auditLogger };
}

describe('OwnershipTransferService (I-21)', () => {
  describe('transferOnDisable', () => {
    it('returns null when no active admin found', async () => {
      const { service, prisma, auditLogger } = createService();
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.transferOnDisable('user-1', 'tenant-1', null);
      expect(result).toBeNull();
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'data_ownership.transfer_skipped',
          details: expect.objectContaining({ reason: 'no_active_tenant_admin' }),
        }),
      );
    });

    it('transfers to preferred admin when available', async () => {
      const { service, prisma, auditLogger } = createService();
      // First call: find preferred user (triggeredBy)
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'admin-1', email: 'admin@test.com' });

      const result = await service.transferOnDisable('user-1', 'tenant-1', 'admin-1');
      expect(result).not.toBeNull();
      expect(result!.to.userId).toBe('admin-1');
      expect(result!.to.email).toBe('admin@test.com');
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'data_ownership.transferred', riskLevel: 'high' }),
      );
    });

    it('falls back to any admin when preferred not found', async () => {
      const { service, prisma } = createService();
      // First call: preferred user not found
      prisma.user.findFirst.mockResolvedValueOnce(null);
      // Second call: any admin
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'admin-2', email: 'other@test.com' });

      const result = await service.transferOnDisable('user-1', 'tenant-1', 'missing-admin');
      expect(result).not.toBeNull();
      expect(result!.to.userId).toBe('admin-2');
    });

    it('uses custom reason string', async () => {
      const { service, prisma, auditLogger } = createService();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'admin-1', email: 'a@t.com' });

      await service.transferOnDisable('u1', 't1', null, 'scim_deprovision');
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'data_ownership.transferred',
          details: expect.objectContaining({ reason: 'scim_deprovision' }),
        }),
      );
    });

    it('excludes the disabled user from transfer target', async () => {
      const { service, prisma } = createService();
      // Preferred returns the same user being disabled — should skip
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'user-1', email: 'self@test.com' });
      // Fallback returns null
      prisma.user.findFirst.mockResolvedValueOnce(null);

      const result = await service.transferOnDisable('user-1', 'tenant-1', 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('manualTransfer', () => {
    it('rejects when target user not found', async () => {
      const { service, prisma } = createService();
      prisma.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.manualTransfer('u1', 'u2', 't1', 'admin-1'),
      ).rejects.toThrow('Target user must be active');
    });

    it('rejects when source user not found', async () => {
      const { service, prisma } = createService();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u2', email: 't@t.com' }); // target found
      prisma.user.findFirst.mockResolvedValueOnce(null); // source not found

      await expect(
        service.manualTransfer('u1', 'u2', 't1', 'admin-1'),
      ).rejects.toThrow('Source user not found');
    });

    it('rejects self-transfer', async () => {
      const { service, prisma } = createService();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', email: 't@t.com' }); // target
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', email: 't@t.com' }); // source

      await expect(
        service.manualTransfer('u1', 'u1', 't1', 'admin-1'),
      ).rejects.toThrow('Cannot transfer to the same user');
    });

    it('succeeds with valid source and target', async () => {
      const { service, prisma, auditLogger } = createService();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u2', email: 'target@t.com' });
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', email: 'source@t.com' });

      const result = await service.manualTransfer('u1', 'u2', 't1', 'admin-1');
      expect(result.to.userId).toBe('u2');
      expect(result.to.email).toBe('target@t.com');
      expect(result.transferred).toBeDefined();
      expect(auditLogger.log).toHaveBeenCalled();
    });

    it('transfers only specified resource types', async () => {
      const { service, prisma, auditLogger } = createService();
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u2', email: 'target@t.com' });
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1', email: 'source@t.com' });

      const result = await service.manualTransfer('u1', 'u2', 't1', 'admin-1', ['investigations', 'reports']);
      expect(result.transferred).toBeDefined();
      // Should only have 2 resource-level audit logs + 1 aggregate = 3 total
      // (investigations + reports resource-level, then 1 aggregate)
      const resourceLogs = auditLogger.log.mock.calls.filter(
        (c: [{ details: { resourceType?: string } }]) => c[0].details.resourceType,
      );
      expect(resourceLogs).toHaveLength(2);
    });
  });
});
