/**
 * @module user-management-service/tests/scim-token-service
 * @description Tests for SCIM token lifecycle: create, list, revoke, authenticate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hashScimToken } from '../src/services/scim-token-service.js';

// ─── Hoisted mocks ─────────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    scimToken: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  return { mockPrisma };
});

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

import { ScimTokenService } from '../src/services/scim-token-service.js';

describe('ScimTokenService', () => {
  let svc: ScimTokenService;
  const TENANT = 'tenant-1';
  const USER = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new ScimTokenService();
  });

  describe('createToken', () => {
    it('creates a token when under limit', async () => {
      mockPrisma.scimToken.count.mockResolvedValue(0);
      mockPrisma.scimToken.create.mockResolvedValue({ id: 'tok-1' });

      const result = await svc.createToken(TENANT, 'Test token', USER);
      expect(result.token).toHaveLength(64); // 32 bytes hex
      expect(result.id).toBe('tok-1');
      expect(mockPrisma.scimToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT,
            description: 'Test token',
            createdBy: USER,
          }),
        }),
      );
    });

    it('creates token with expiry when expiresInDays provided', async () => {
      mockPrisma.scimToken.count.mockResolvedValue(0);
      mockPrisma.scimToken.create.mockResolvedValue({ id: 'tok-2' });

      await svc.createToken(TENANT, 'Expiring token', USER, 30);
      const call = mockPrisma.scimToken.create.mock.calls[0]![0];
      expect(call.data.expiresAt).toBeInstanceOf(Date);
    });

    it('rejects when 3 active tokens exist (max limit)', async () => {
      mockPrisma.scimToken.count.mockResolvedValue(3);

      await expect(svc.createToken(TENANT, 'Too many', USER))
        .rejects.toThrow('Maximum 3 active SCIM tokens');
    });

    it('allows creation when existing tokens are revoked', async () => {
      mockPrisma.scimToken.count.mockResolvedValue(2);
      mockPrisma.scimToken.create.mockResolvedValue({ id: 'tok-3' });

      const result = await svc.createToken(TENANT, 'New token', USER);
      expect(result.id).toBe('tok-3');
    });
  });

  describe('listTokens', () => {
    it('returns tokens without hash', async () => {
      const now = new Date();
      mockPrisma.scimToken.findMany.mockResolvedValue([
        {
          id: 'tok-1',
          description: 'My token',
          createdBy: USER,
          createdAt: now,
          lastUsedAt: null,
          expiresAt: null,
          revoked: false,
        },
      ]);

      const tokens = await svc.listTokens(TENANT);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.id).toBe('tok-1');
      expect(tokens[0]!.description).toBe('My token');
      expect(tokens[0]!.createdAt).toBe(now.toISOString());
      // Ensure no tokenHash in output
      expect((tokens[0] as Record<string, unknown>).tokenHash).toBeUndefined();
    });

    it('returns empty array for tenant with no tokens', async () => {
      mockPrisma.scimToken.findMany.mockResolvedValue([]);
      const tokens = await svc.listTokens(TENANT);
      expect(tokens).toEqual([]);
    });
  });

  describe('revokeToken', () => {
    it('revokes an active token', async () => {
      mockPrisma.scimToken.findFirst.mockResolvedValue({ id: 'tok-1', tenantId: TENANT, revoked: false });
      mockPrisma.scimToken.update.mockResolvedValue({});

      await svc.revokeToken('tok-1', TENANT);
      expect(mockPrisma.scimToken.update).toHaveBeenCalledWith({
        where: { id: 'tok-1' },
        data: { revoked: true },
      });
    });

    it('throws 404 for non-existent token', async () => {
      mockPrisma.scimToken.findFirst.mockResolvedValue(null);
      await expect(svc.revokeToken('missing', TENANT)).rejects.toThrow('SCIM token not found');
    });

    it('throws 400 for already revoked token', async () => {
      mockPrisma.scimToken.findFirst.mockResolvedValue({ id: 'tok-1', tenantId: TENANT, revoked: true });
      await expect(svc.revokeToken('tok-1', TENANT)).rejects.toThrow('already revoked');
    });
  });

  describe('authenticateToken', () => {
    const RAW_TOKEN = 'a'.repeat(64);
    const TOKEN_HASH = hashScimToken(RAW_TOKEN);

    it('returns tenantId for valid token', async () => {
      mockPrisma.scimToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        tenantId: TENANT,
        revoked: false,
        expiresAt: null,
        tenant: { active: true },
      });
      mockPrisma.scimToken.update.mockResolvedValue({});

      const result = await svc.authenticateToken(RAW_TOKEN);
      expect(result).toEqual({ tenantId: TENANT, tokenId: 'tok-1' });
      expect(mockPrisma.scimToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: TOKEN_HASH },
        include: { tenant: { select: { active: true } } },
      });
    });

    it('returns null for unknown token', async () => {
      mockPrisma.scimToken.findUnique.mockResolvedValue(null);
      const result = await svc.authenticateToken(RAW_TOKEN);
      expect(result).toBeNull();
    });

    it('returns null for revoked token', async () => {
      mockPrisma.scimToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        tenantId: TENANT,
        revoked: true,
        expiresAt: null,
        tenant: { active: true },
      });
      const result = await svc.authenticateToken(RAW_TOKEN);
      expect(result).toBeNull();
    });

    it('returns null for expired token', async () => {
      mockPrisma.scimToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        tenantId: TENANT,
        revoked: false,
        expiresAt: new Date('2020-01-01'),
        tenant: { active: true },
      });
      const result = await svc.authenticateToken(RAW_TOKEN);
      expect(result).toBeNull();
    });

    it('returns null for inactive tenant', async () => {
      mockPrisma.scimToken.findUnique.mockResolvedValue({
        id: 'tok-1',
        tenantId: TENANT,
        revoked: false,
        expiresAt: null,
        tenant: { active: false },
      });
      const result = await svc.authenticateToken(RAW_TOKEN);
      expect(result).toBeNull();
    });
  });

  describe('hashScimToken', () => {
    it('produces deterministic 64-char hex hash', () => {
      const hash1 = hashScimToken('test-token');
      const hash2 = hashScimToken('test-token');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different hashes for different tokens', () => {
      const hash1 = hashScimToken('token-a');
      const hash2 = hashScimToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });
});
