import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { loadJwtConfig } from '@etip/shared-auth';
import { generateSecret as otplibGenerateSecret, generateSync, verifySync } from 'otplib';

// Mock Prisma
const { _mfaAuditCreate } = vi.hoisted(() => ({
  _mfaAuditCreate: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'audit-1', ...args.data, createdAt: new Date() })),
}));

vi.mock('../src/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: _mfaAuditCreate, findFirst: vi.fn() },
    mfaEnforcementPolicy: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      auditLog: { findFirst: vi.fn().mockResolvedValue(null), create: _mfaAuditCreate },
    })),
  },
  disconnectPrisma: vi.fn(),
}));

import { prisma } from '../src/prisma.js';
import { MfaService, encryptSecret, decryptSecret, resetChallengeAttempts } from '../src/mfa-service.js';

const TEST_JWT_ENV = {
  TI_JWT_SECRET: 'test-secret-key-at-least-32-characters-long!!',
  TI_JWT_ISSUER: 'test-issuer',
  TI_JWT_ACCESS_EXPIRY: '900',
  TI_JWT_REFRESH_EXPIRY: '604800',
};

const MOCK_USER_ID = '550e8400-e29b-41d4-a716-446655440020';
const MOCK_TENANT_ID = '550e8400-e29b-41d4-a716-446655440010';

const baseMfaUser = {
  id: MOCK_USER_ID,
  email: 'analyst@acme.com',
  tenantId: MOCK_TENANT_ID,
  mfaEnabled: false,
  mfaSecret: null as string | null,
  mfaBackupCodes: [] as string[],
  mfaVerifiedAt: null as Date | null,
};

// Set required env var for encryption
process.env['TI_MFA_ENCRYPTION_KEY'] = 'test-mfa-encryption-key-at-least-32-chars!!';

describe('MfaService', () => {
  let service: MfaService;

  beforeAll(() => { loadJwtConfig(TEST_JWT_ENV); });
  beforeEach(() => {
    vi.clearAllMocks();
    resetChallengeAttempts();
    service = new MfaService();
  });

  // ── Encryption ─────────────────────────────────────────────────

  describe('encryptSecret / decryptSecret', () => {
    it('round-trips a TOTP secret', () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);
      expect(encrypted).not.toBe(secret);
      expect(encrypted).toContain(':'); // iv:authTag:encrypted format
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const a = encryptSecret(secret);
      const b = encryptSecret(secret);
      expect(a).not.toBe(b);
    });
  });

  // ── Setup Flow ─────────────────────────────────────────────────

  describe('setupMfa', () => {
    it('generates secret and QR URI', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.setupMfa(MOCK_USER_ID, MOCK_TENANT_ID, '127.0.0.1', 'test-agent');

      expect(result.secret).toBeTruthy();
      expect(result.qrUri).toContain('otpauth://totp/');
      expect(result.qrUri).toContain('IntelWatch%20ETIP');
      expect(result.qrUri).toContain(encodeURIComponent('analyst@acme.com'));
      // Secret should be stored encrypted
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MOCK_USER_ID },
          data: { mfaSecret: expect.stringContaining(':') },
        })
      );
      // Audit log created
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'mfa.setup.initiated' }),
        })
      );
    });

    it('throws 404 for nonexistent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(service.setupMfa('bad-id', MOCK_TENANT_ID, '127.0.0.1', 'test'))
        .rejects.toThrow('User not found');
    });
  });

  describe('verifySetup', () => {
    it('enables MFA with valid TOTP code and returns 10 backup codes', { timeout: 15_000 }, async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);
      const validCode = generateSync({ secret });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaSecret: encrypted,
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...baseMfaUser, mfaEnabled: true } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.verifySetup(
        MOCK_USER_ID, MOCK_TENANT_ID, validCode, '127.0.0.1', 'test-agent'
      );

      expect(result.backupCodes).toHaveLength(10);
      expect(result.backupCodes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      // enableMfa called with hashed backup codes
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mfaEnabled: true,
            mfaVerifiedAt: expect.any(Date),
            mfaBackupCodes: expect.any(Array),
          }),
        })
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'mfa.setup.completed' }),
        })
      );
    });

    it('rejects invalid TOTP code', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaSecret: encrypted,
      } as never);

      await expect(
        service.verifySetup(MOCK_USER_ID, MOCK_TENANT_ID, '000000', '127.0.0.1', 'test')
      ).rejects.toThrow('Invalid TOTP code');
    });

    it('throws if setup not initiated (no secret)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaSecret: null,
      } as never);

      await expect(
        service.verifySetup(MOCK_USER_ID, MOCK_TENANT_ID, '123456', '127.0.0.1', 'test')
      ).rejects.toThrow('MFA setup not initiated');
    });
  });

  // ── Login Challenge ────────────────────────────────────────────

  describe('checkMfaRequired', () => {
    it('returns mfaRequired=true with mfaToken when MFA enabled', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: 'encrypted-secret',
      } as never);

      const result = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaSetupRequired).toBe(false);
      expect(result.mfaToken).toBeTruthy();
    });

    it('returns mfaRequired=false when MFA disabled and no enforcement', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.mfaEnforcementPolicy.findUnique).mockResolvedValue(null);

      const result = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);

      expect(result.mfaRequired).toBe(false);
      expect(result.mfaSetupRequired).toBe(false);
    });

    it('returns mfaSetupRequired=true when platform enforcement is on', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue({
        id: 'policy-1', tenantId: null, scope: 'platform', enforced: true,
        enforcedBy: 'admin', enforcedAt: new Date(),
      } as never);

      const result = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);

      expect(result.mfaRequired).toBe(false);
      expect(result.mfaSetupRequired).toBe(true);
      expect(result.setupToken).toBeTruthy();
    });

    it('returns mfaSetupRequired=true when org enforcement is on', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.mfaEnforcementPolicy.findUnique).mockResolvedValue({
        id: 'policy-2', tenantId: MOCK_TENANT_ID, scope: 'org', enforced: true,
        enforcedBy: 'admin', enforcedAt: new Date(),
      } as never);

      const result = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);

      expect(result.mfaSetupRequired).toBe(true);
    });
  });

  describe('verifyChallenge', () => {
    it('succeeds with valid TOTP code', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);
      const validCode = generateSync({ secret });

      // Get a real mfaToken
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
      } as never);

      const check = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.verifyChallenge(
        check.mfaToken!, validCode, '127.0.0.1', 'test-agent'
      );

      expect(result.userId).toBe(MOCK_USER_ID);
      expect(result.tenantId).toBe(MOCK_TENANT_ID);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'mfa.challenge.success' }),
        })
      );
    });

    it('rejects invalid TOTP code with MFA_CODE_INVALID', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
      } as never);

      const check = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      try {
        await service.verifyChallenge(check.mfaToken!, '000000', '127.0.0.1', 'test');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { statusCode: number; code: string };
        expect(e.statusCode).toBe(401);
        expect(e.code).toBe('MFA_CODE_INVALID');
      }
    });

    it('locks after 5 failed attempts', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
      } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const check = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);
      const mfaToken = check.mfaToken!;

      // Fail 5 times
      for (let i = 0; i < 5; i++) {
        try {
          await service.verifyChallenge(mfaToken, '000000', '127.0.0.1', 'test');
        } catch { /* expected */ }
      }

      // 6th attempt should be locked
      try {
        await service.verifyChallenge(mfaToken, '000000', '127.0.0.1', 'test');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { code: string };
        expect(e.code).toBe('MFA_CHALLENGE_LOCKED');
      }
    });

    it('succeeds with valid backup code and removes it', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);
      // Create a known backup code and hash it
      const bcrypt = await import('bcryptjs');
      const plainCode = 'ABCD1234';
      const hashedCode = await bcrypt.hash(plainCode, 12);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser,
        mfaEnabled: true,
        mfaSecret: encrypted,
        mfaBackupCodes: [hashedCode, 'other-hash'],
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const check = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);

      const result = await service.verifyChallenge(
        check.mfaToken!, `ABCD-1234`, '127.0.0.1', 'test-agent'
      );

      expect(result.userId).toBe(MOCK_USER_ID);
      expect(result.backupCodesRemaining).toBe(1);
      // Backup code removed from array
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mfaBackupCodes: ['other-hash'] },
        })
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'mfa.backup_code.used' }),
        })
      );
    });

    it('warns when 2 or fewer backup codes remain', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);
      const bcrypt = await import('bcryptjs');
      const plainCode = 'WXYZ5678';
      const hashedCode = await bcrypt.hash(plainCode, 12);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser,
        mfaEnabled: true,
        mfaSecret: encrypted,
        mfaBackupCodes: [hashedCode, 'hash2'],
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const check = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);

      const result = await service.verifyChallenge(
        check.mfaToken!, 'WXYZ-5678', '127.0.0.1', 'test'
      );

      expect(result.backupCodesRemaining).toBe(1);
      expect(result.warning).toBe('Regenerate backup codes soon');
    });

    it('rejects same backup code used twice', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);
      const bcrypt = await import('bcryptjs');
      const plainCode = 'ONCE1234';
      const hashedCode = await bcrypt.hash(plainCode, 12);

      // First call: code exists
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
      } as never);
      const check = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
        mfaBackupCodes: [hashedCode],
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      await service.verifyChallenge(check.mfaToken!, 'ONCE-1234', '127.0.0.1', 'test');

      // Second attempt: code removed, should fail
      // Need new mfaToken since we may have hit attempt limit
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
      } as never);
      const check2 = await service.checkMfaRequired(MOCK_USER_ID, MOCK_TENANT_ID);

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
        mfaBackupCodes: [], // code was removed
      } as never);

      try {
        await service.verifyChallenge(check2.mfaToken!, 'ONCE-1234', '127.0.0.1', 'test');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const e = err as { code: string };
        expect(e.code).toBe('MFA_CODE_INVALID');
      }
    });
  });

  // ── Disable ────────────────────────────────────────────────────

  describe('disableMfa', () => {
    it('disables with valid TOTP code (self)', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);
      const validCode = generateSync({ secret });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      await service.disableMfa(
        MOCK_USER_ID, MOCK_TENANT_ID, validCode,
        MOCK_USER_ID, 'analyst', '127.0.0.1', 'test'
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mfaEnabled: false,
            mfaSecret: null,
            mfaBackupCodes: [],
            mfaVerifiedAt: null,
          }),
        })
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'mfa.disabled' }),
        })
      );
    });

    it('rejects disable without valid TOTP code', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
      } as never);

      await expect(
        service.disableMfa(MOCK_USER_ID, MOCK_TENANT_ID, '000000', MOCK_USER_ID, 'analyst', '127.0.0.1', 'test')
      ).rejects.toThrow('Invalid TOTP code');
    });

    it('super_admin can disable another users MFA without TOTP', async () => {
      const otherUserId = '550e8400-e29b-41d4-a716-446655440099';
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, id: otherUserId, mfaEnabled: true, mfaSecret: 'encrypted',
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      await service.disableMfa(
        otherUserId, MOCK_TENANT_ID, '',
        MOCK_USER_ID, 'super_admin', '127.0.0.1', 'test'
      );

      expect(prisma.user.update).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'mfa.disabled',
            changes: expect.objectContaining({ disabledBy: 'admin' }),
          }),
        })
      );
    });

    it('throws if MFA not enabled', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseMfaUser } as never);
      await expect(
        service.disableMfa(MOCK_USER_ID, MOCK_TENANT_ID, '123456', MOCK_USER_ID, 'analyst', '127.0.0.1', 'test')
      ).rejects.toThrow('MFA is not enabled');
    });
  });

  // ── Backup Code Regeneration ───────────────────────────────────

  describe('regenerateBackupCodes', () => {
    it('generates 10 new codes with valid TOTP', { timeout: 15_000 }, async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);
      const validCode = generateSync({ secret });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
      } as never);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...baseMfaUser } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.regenerateBackupCodes(
        MOCK_USER_ID, MOCK_TENANT_ID, validCode, '127.0.0.1', 'test'
      );

      expect(result.backupCodes).toHaveLength(10);
      expect(result.backupCodes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'mfa.backup_codes.regenerated' }),
        })
      );
    });

    it('rejects with invalid TOTP code', async () => {
      const secret = otplibGenerateSecret();
      const encrypted = encryptSecret(secret);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...baseMfaUser, mfaEnabled: true, mfaSecret: encrypted,
      } as never);

      await expect(
        service.regenerateBackupCodes(MOCK_USER_ID, MOCK_TENANT_ID, '000000', '127.0.0.1', 'test')
      ).rejects.toThrow('Invalid TOTP code');
    });

    it('throws if MFA not enabled', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...baseMfaUser } as never);
      await expect(
        service.regenerateBackupCodes(MOCK_USER_ID, MOCK_TENANT_ID, '123456', '127.0.0.1', 'test')
      ).rejects.toThrow('MFA is not enabled');
    });
  });

  // ── Enforcement Policies ───────────────────────────────────────

  describe('enforcement policies', () => {
    it('sets and gets platform enforcement', async () => {
      vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.mfaEnforcementPolicy.create).mockResolvedValue({
        id: 'p1', tenantId: null, scope: 'platform', enforced: true,
        enforcedBy: MOCK_USER_ID, enforcedAt: new Date(),
      } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.setPlatformEnforcement(
        true, MOCK_USER_ID, MOCK_TENANT_ID, '127.0.0.1', 'test'
      );
      expect(result.enforced).toBe(true);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'mfa.enforcement.changed' }),
        })
      );
    });

    it('returns enforced=false when no platform policy exists', async () => {
      vi.mocked(prisma.mfaEnforcementPolicy.findFirst).mockResolvedValue(null);
      const result = await service.getPlatformEnforcement();
      expect(result.enforced).toBe(false);
    });

    it('sets and gets org enforcement', async () => {
      vi.mocked(prisma.mfaEnforcementPolicy.upsert).mockResolvedValue({
        id: 'p2', tenantId: MOCK_TENANT_ID, scope: 'org', enforced: true,
        enforcedBy: MOCK_USER_ID, enforcedAt: new Date(),
      } as never);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

      const result = await service.setOrgEnforcement(
        MOCK_TENANT_ID, true, MOCK_USER_ID, '127.0.0.1', 'test'
      );
      expect(result.enforced).toBe(true);
    });

    it('returns enforced=false when no org policy exists', async () => {
      vi.mocked(prisma.mfaEnforcementPolicy.findUnique).mockResolvedValue(null);
      const result = await service.getOrgEnforcement(MOCK_TENANT_ID);
      expect(result.enforced).toBe(false);
    });
  });
});
