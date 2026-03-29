/**
 * @module user-management-service/tests/scim-groups
 * @description Tests for SCIM virtual groups (read-only, derived from roles).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    user: {
      findMany: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

import { ScimGroupService } from '../src/services/scim-group-service.js';

const BASE_URL = 'https://app.etip.dev';
const TENANT = 'tenant-1';

describe('ScimGroupService', () => {
  let svc: ScimGroupService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ScimGroupService();
  });

  describe('listGroups', () => {
    it('returns virtual groups for tenant_admin and analyst roles', async () => {
      // First call: tenant_admin members
      mockPrisma.user.findMany
        .mockResolvedValueOnce([{ id: 'admin-1', displayName: 'Admin User' }])
        // Second call: analyst members
        .mockResolvedValueOnce([
          { id: 'analyst-1', displayName: 'Analyst One' },
          { id: 'analyst-2', displayName: 'Analyst Two' },
        ]);

      const result = await svc.listGroups(TENANT, BASE_URL);

      expect(result.totalResults).toBe(2);
      expect(result.Resources).toHaveLength(2);

      // tenant_admin group
      const adminGroup = result.Resources.find((g) => g.id === 'tenant_admin');
      expect(adminGroup).toBeDefined();
      expect(adminGroup!.displayName).toBe('tenant_admin');
      expect(adminGroup!.members).toHaveLength(1);
      expect(adminGroup!.members![0]!.value).toBe('admin-1');
      expect(adminGroup!.meta.location).toBe(`${BASE_URL}/scim/v2/Groups/tenant_admin`);

      // analyst group
      const analystGroup = result.Resources.find((g) => g.id === 'analyst');
      expect(analystGroup).toBeDefined();
      expect(analystGroup!.members).toHaveLength(2);
    });

    it('returns SCIM list response schema', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await svc.listGroups(TENANT, BASE_URL);
      expect(result.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
      expect(result.startIndex).toBe(1);
    });

    it('returns empty members for roles with no users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await svc.listGroups(TENANT, BASE_URL);
      for (const group of result.Resources) {
        expect(group.members).toEqual([]);
      }
    });
  });

  describe('getGroup', () => {
    it('returns single virtual group with members', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'analyst-1', displayName: 'Analyst One' },
      ]);

      const group = await svc.getGroup('analyst', TENANT, BASE_URL);
      expect(group.id).toBe('analyst');
      expect(group.displayName).toBe('analyst');
      expect(group.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:Group');
      expect(group.members).toHaveLength(1);
      expect(group.members![0]!.$ref).toBe(`${BASE_URL}/scim/v2/Users/analyst-1`);
      expect(group.meta.resourceType).toBe('Group');
    });

    it('returns tenant_admin group', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const group = await svc.getGroup('tenant_admin', TENANT, BASE_URL);
      expect(group.id).toBe('tenant_admin');
      expect(group.members).toEqual([]);
    });

    it('throws 404 for non-existent group', async () => {
      await expect(svc.getGroup('super_admin', TENANT, BASE_URL))
        .rejects.toThrow("Group 'super_admin' not found");
    });

    it('throws 404 for arbitrary group names', async () => {
      await expect(svc.getGroup('nonexistent', TENANT, BASE_URL))
        .rejects.toThrow('not found');
    });
  });
});
