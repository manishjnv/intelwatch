/**
 * @module user-management-service/tests/scim-users
 * @description Tests for SCIM /Users CRUD, filter, pagination, field mapping.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../src/services/session-manager.js';

// ─── Hoisted mocks ─────────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    user: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
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
    designation: 'Analyst',
    externalId: 'ext-123',
    active: true,
    role: 'analyst',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  };
}

describe('ScimUserService', () => {
  let svc: ScimUserService;
  let sessionManager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = new SessionManager();
    svc = new ScimUserService(sessionManager);
  });

  describe('listUsers', () => {
    it('returns SCIM list response with resources', async () => {
      const users = [makeUser()];
      mockPrisma.user.findMany.mockResolvedValue(users);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await svc.listUsers(TENANT, BASE_URL);
      expect(result.totalResults).toBe(1);
      expect(result.Resources).toHaveLength(1);
      expect(result.Resources[0]!.userName).toBe('alice@acme.com');
      expect(result.Resources[0]!.meta.location).toBe(`${BASE_URL}/scim/v2/Users/user-1`);
    });

    it('filters by userName eq', async () => {
      mockPrisma.user.findMany.mockResolvedValue([makeUser()]);
      mockPrisma.user.count.mockResolvedValue(1);

      await svc.listUsers(TENANT, BASE_URL, 'userName eq "alice@acme.com"');
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, email: 'alice@acme.com' },
        }),
      );
    });

    it('filters by externalId eq', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await svc.listUsers(TENANT, BASE_URL, 'externalId eq "ext-123"');
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT, externalId: 'ext-123' },
        }),
      );
    });

    it('rejects unsupported filter', async () => {
      await expect(
        svc.listUsers(TENANT, BASE_URL, 'badField eq "value"'),
      ).rejects.toThrow('Unsupported filter');
    });

    it('paginates with startIndex and count', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(50);

      const result = await svc.listUsers(TENANT, BASE_URL, undefined, 11, 10);
      expect(result.startIndex).toBe(11);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  describe('getUser', () => {
    it('returns SCIM user resource', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      const user = await svc.getUser('user-1', TENANT, BASE_URL);
      expect(user.id).toBe('user-1');
      expect(user.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
      expect(user.displayName).toBe('Alice Smith');
      expect(user.title).toBe('Analyst');
    });

    it('throws 404 for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(svc.getUser('missing', TENANT, BASE_URL)).rejects.toThrow('User not found');
    });
  });

  describe('createUser', () => {
    it('provisions user with SCIM field mapping', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT, maxUsers: 50 });
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.user.findFirst.mockResolvedValue(null); // no duplicate
      mockPrisma.user.create.mockResolvedValue(makeUser({ id: 'new-user' }));

      const result = await svc.createUser(TENANT, {
        userName: 'Bob@Acme.com',
        displayName: 'Bob Jones',
        externalId: 'ext-456',
        title: 'Senior Analyst',
      }, BASE_URL);

      expect(result.id).toBe('new-user');
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: TENANT,
          email: 'bob@acme.com', // lowercase
          displayName: 'Bob Jones',
          designation: 'Senior Analyst',
          externalId: 'ext-456',
          emailVerified: true,
          authProvider: 'saml',
          role: 'analyst',
        }),
      });
    });

    it('builds displayName from name.givenName + familyName', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT, maxUsers: 50 });
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(makeUser({ displayName: 'John Doe' }));

      await svc.createUser(TENANT, {
        userName: 'john@acme.com',
        name: { givenName: 'John', familyName: 'Doe' },
      }, BASE_URL);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ displayName: 'John Doe' }),
      });
    });

    it('rejects when tenant user limit reached', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT, maxUsers: 5 });
      mockPrisma.user.count.mockResolvedValue(5);

      await expect(
        svc.createUser(TENANT, { userName: 'new@acme.com' }, BASE_URL),
      ).rejects.toThrow('Tenant user limit reached');
    });

    it('rejects duplicate email', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT, maxUsers: 50 });
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.findFirst.mockResolvedValue(makeUser()); // duplicate found

      await expect(
        svc.createUser(TENANT, { userName: 'alice@acme.com' }, BASE_URL),
      ).rejects.toThrow('already exists');
    });

    it('rejects duplicate externalId', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT, maxUsers: 50 });
      mockPrisma.user.count.mockResolvedValue(1);
      // First findFirst (email check) → null, second (externalId check) → existing
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeUser());

      await expect(
        svc.createUser(TENANT, { userName: 'new@acme.com', externalId: 'ext-123' }, BASE_URL),
      ).rejects.toThrow('externalId already exists');
    });
  });

  describe('replaceUser', () => {
    it('replaces user fields', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue(makeUser({ displayName: 'Alice Updated' }));

      const result = await svc.replaceUser('user-1', TENANT, {
        userName: 'alice@acme.com',
        displayName: 'Alice Updated',
        active: true,
      }, BASE_URL);

      expect(result.displayName).toBe('Alice Updated');
    });

    it('throws 404 for non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        svc.replaceUser('missing', TENANT, { userName: 'x@y.com' }, BASE_URL),
      ).rejects.toThrow('User not found');
    });
  });

  describe('patchUser', () => {
    it('applies replace operations', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue(makeUser({ displayName: 'Patched' }));

      const result = await svc.patchUser('user-1', TENANT, [
        { op: 'replace', path: 'displayName', value: 'Patched' },
      ], BASE_URL);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ displayName: 'Patched' }),
      });
      expect(result.id).toBe('user-1');
    });

    it('maps SCIM paths to ETIP fields', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue(makeUser());

      await svc.patchUser('user-1', TENANT, [
        { op: 'replace', path: 'userName', value: 'NEW@ACME.COM' },
        { op: 'replace', path: 'title', value: 'Lead Analyst' },
        { op: 'replace', path: 'externalId', value: 'ext-new' },
      ], BASE_URL);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          email: 'new@acme.com',
          designation: 'Lead Analyst',
          externalId: 'ext-new',
        }),
      });
    });

    it('handles remove operations', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue(makeUser({ designation: null }));

      await svc.patchUser('user-1', TENANT, [
        { op: 'remove', path: 'title' },
      ], BASE_URL);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ designation: null }),
      });
    });

    it('ignores unknown SCIM paths', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(makeUser());
      mockPrisma.user.update.mockResolvedValue(makeUser());

      await svc.patchUser('user-1', TENANT, [
        { op: 'replace', path: 'unknownField', value: 'ignored' },
      ], BASE_URL);

      // Only called with empty updates (no unknownField)
      const updateData = mockPrisma.user.update.mock.calls[0]![0].data;
      expect(updateData).not.toHaveProperty('unknownField');
    });
  });
});
