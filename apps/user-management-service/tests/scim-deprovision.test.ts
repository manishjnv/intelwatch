/**
 * @module user-management-service/tests/scim-deprovision
 * @description Tests for SCIM deprovisioning: session termination, API key revocation,
 * I-04/I-05 last-admin guards, PATCH active=false, DELETE flows.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../src/services/session-manager.js';

// ─── Hoisted mocks ─────────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    user: {
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    apiKey: {
      updateMany: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

import { ScimUserService } from '../src/services/scim-user-service.js';

const BASE_URL = 'https://app.etip.dev';
const TENANT = 'tenant-1';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    tenantId: TENANT,
    email: 'alice@acme.com',
    displayName: 'Alice Smith',
    designation: null,
    externalId: null,
    active: true,
    role: 'analyst',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  };
}

describe('SCIM Deprovisioning', () => {
  let svc: ScimUserService;
  let sessionManager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = new SessionManager();
    svc = new ScimUserService(sessionManager);
  });

  describe('DELETE /Users/:id (deleteUser)', () => {
    it('soft-deletes user and terminates sessions + revokes API keys', async () => {
      const user = makeUser();
      mockPrisma.user.findFirst.mockResolvedValue(user);
      mockPrisma.user.count.mockResolvedValue(2); // not last admin scenario (analyst)
      mockPrisma.user.update.mockResolvedValue({ ...user, active: false });
      mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 3 });

      // Create some sessions to verify they get revoked
      sessionManager.create({ userId: 'user-1', tenantId: TENANT, ip: '127.0.0.1', userAgent: 'Chrome' });
      sessionManager.create({ userId: 'user-1', tenantId: TENANT, ip: '127.0.0.2', userAgent: 'Firefox' });
      expect(sessionManager.listByUser('user-1', TENANT).data).toHaveLength(2);

      await svc.deleteUser('user-1', TENANT);

      // User deactivated
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { active: false },
      });

      // API keys revoked
      expect(mockPrisma.apiKey.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', tenantId: TENANT },
        data: { active: false },
      });

      // Sessions terminated
      expect(sessionManager.listByUser('user-1', TENANT).data).toHaveLength(0);
    });

    it('throws 404 for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(svc.deleteUser('missing', TENANT)).rejects.toThrow('User not found');
    });
  });

  describe('I-04/I-05 last-admin guard', () => {
    it('blocks deletion of last active tenant_admin', async () => {
      const adminUser = makeUser({ id: 'admin-1', role: 'tenant_admin' });
      mockPrisma.user.findFirst.mockResolvedValue(adminUser);
      mockPrisma.user.count.mockResolvedValue(0); // no other admins

      await expect(svc.deleteUser('admin-1', TENANT))
        .rejects.toThrow('Cannot de-provision the last active tenant admin');
    });

    it('allows deletion of tenant_admin when other admins exist', async () => {
      const adminUser = makeUser({ id: 'admin-1', role: 'tenant_admin' });
      mockPrisma.user.findFirst.mockResolvedValue(adminUser);
      mockPrisma.user.count.mockResolvedValue(1); // one other admin
      mockPrisma.user.update.mockResolvedValue({ ...adminUser, active: false });
      mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 0 });

      await svc.deleteUser('admin-1', TENANT);
      expect(mockPrisma.user.update).toHaveBeenCalled();
    });

    it('allows deletion of analyst regardless of admin count', async () => {
      const analyst = makeUser({ id: 'analyst-1', role: 'analyst' });
      mockPrisma.user.findFirst.mockResolvedValue(analyst);
      mockPrisma.user.update.mockResolvedValue({ ...analyst, active: false });
      mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 0 });

      await svc.deleteUser('analyst-1', TENANT);
      expect(mockPrisma.user.update).toHaveBeenCalled();
      // Should NOT check admin count for non-admin users
    });
  });

  describe('PATCH active=false (deprovisioning via patch)', () => {
    it('deactivates user and terminates sessions on PATCH active=false', async () => {
      const user = makeUser();
      mockPrisma.user.findFirst.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue({ ...user, active: false });
      mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 1 });

      sessionManager.create({ userId: 'user-1', tenantId: TENANT, ip: '127.0.0.1', userAgent: 'Chrome' });

      await svc.patchUser('user-1', TENANT, [
        { op: 'replace', path: 'active', value: false },
      ], BASE_URL);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ active: false }),
      });
      expect(mockPrisma.apiKey.updateMany).toHaveBeenCalled();
      expect(sessionManager.listByUser('user-1', TENANT).data).toHaveLength(0);
    });

    it('blocks PATCH active=false on last tenant_admin', async () => {
      const adminUser = makeUser({ id: 'admin-1', role: 'tenant_admin' });
      mockPrisma.user.findFirst.mockResolvedValue(adminUser);
      mockPrisma.user.count.mockResolvedValue(0);

      await expect(
        svc.patchUser('admin-1', TENANT, [
          { op: 'replace', path: 'active', value: false },
        ], BASE_URL),
      ).rejects.toThrow('Cannot de-provision the last active tenant admin');
    });

    it('does not deprovision when patching active=true', async () => {
      const inactiveUser = makeUser({ active: false });
      mockPrisma.user.findFirst.mockResolvedValue(inactiveUser);
      mockPrisma.user.update.mockResolvedValue({ ...inactiveUser, active: true });

      await svc.patchUser('user-1', TENANT, [
        { op: 'replace', path: 'active', value: true },
      ], BASE_URL);

      // Should NOT revoke API keys or sessions when reactivating
      expect(mockPrisma.apiKey.updateMany).not.toHaveBeenCalled();
    });

    it('does not deprovision when patching non-active fields', async () => {
      const user = makeUser();
      mockPrisma.user.findFirst.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue({ ...user, displayName: 'New Name' });

      await svc.patchUser('user-1', TENANT, [
        { op: 'replace', path: 'displayName', value: 'New Name' },
      ], BASE_URL);

      expect(mockPrisma.apiKey.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('PUT with active=false (replaceUser deprovisioning)', () => {
    it('deprovisions when replacing active user with active=false', async () => {
      const user = makeUser();
      mockPrisma.user.findFirst.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue({ ...user, active: false });
      mockPrisma.user.count.mockResolvedValue(1); // other admins exist (not relevant for analyst)
      mockPrisma.apiKey.updateMany.mockResolvedValue({ count: 0 });

      sessionManager.create({ userId: 'user-1', tenantId: TENANT, ip: '127.0.0.1', userAgent: 'Chrome' });

      await svc.replaceUser('user-1', TENANT, {
        userName: 'alice@acme.com',
        active: false,
      }, BASE_URL);

      expect(mockPrisma.apiKey.updateMany).toHaveBeenCalled();
      expect(sessionManager.listByUser('user-1', TENANT).data).toHaveLength(0);
    });

    it('does not deprovision when user was already inactive', async () => {
      const inactiveUser = makeUser({ active: false });
      mockPrisma.user.findFirst.mockResolvedValue(inactiveUser);
      mockPrisma.user.update.mockResolvedValue(inactiveUser);

      await svc.replaceUser('user-1', TENANT, {
        userName: 'alice@acme.com',
        active: false,
      }, BASE_URL);

      // Already inactive — no need to deprovision again
      expect(mockPrisma.apiKey.updateMany).not.toHaveBeenCalled();
    });
  });
});
