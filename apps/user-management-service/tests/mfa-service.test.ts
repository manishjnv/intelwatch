import { describe, it, expect, beforeEach } from 'vitest';
import { MfaService } from '../src/services/mfa-service.js';

describe('MfaService', () => {
  let service: MfaService;
  const TENANT = 'tenant-1';
  const USER = 'user-1';
  const EMAIL = 'alice@acme.com';

  beforeEach(() => {
    service = new MfaService('ETIP Test', 10);
  });

  describe('Setup', () => {
    it('generates secret and OTP auth URL', () => {
      const result = service.setup(USER, TENANT, EMAIL);
      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBe(32);
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(result.otpauthUrl).toContain(encodeURIComponent(EMAIL));
      expect(result.qrDataUrl).toContain('qrserver.com');
    });

    it('is not enabled after setup', () => {
      service.setup(USER, TENANT, EMAIL);
      expect(service.isEnabled(USER, TENANT)).toBe(false);
    });
  });

  describe('Verify and enable', () => {
    it('enables MFA with valid TOTP code', () => {
      const { secret } = service.setup(USER, TENANT, EMAIL);
      // Generate a valid code from the secret
      const code = generateTotpCode(secret);
      const result = service.verifyAndEnable(USER, TENANT, code);
      expect(result.enabled).toBe(true);
      expect(result.backupCodes).toHaveLength(10);
    });

    it('rejects invalid TOTP code', () => {
      service.setup(USER, TENANT, EMAIL);
      expect(() => service.verifyAndEnable(USER, TENANT, '000000')).toThrow('Invalid TOTP code');
    });

    it('rejects if already enabled', () => {
      const { secret } = service.setup(USER, TENANT, EMAIL);
      const code = generateTotpCode(secret);
      service.verifyAndEnable(USER, TENANT, code);
      expect(() => service.verifyAndEnable(USER, TENANT, code)).toThrow('already enabled');
    });

    it('throws if not set up', () => {
      expect(() => service.verifyAndEnable(USER, TENANT, '123456')).toThrow('not found');
    });
  });

  describe('Validate on login', () => {
    it('validates correct code', () => {
      const { secret } = service.setup(USER, TENANT, EMAIL);
      const code = generateTotpCode(secret);
      service.verifyAndEnable(USER, TENANT, code);
      const code2 = generateTotpCode(secret);
      expect(service.validate(USER, TENANT, code2)).toBe(true);
    });

    it('rejects incorrect code', () => {
      const { secret } = service.setup(USER, TENANT, EMAIL);
      const code = generateTotpCode(secret);
      service.verifyAndEnable(USER, TENANT, code);
      expect(service.validate(USER, TENANT, '999999')).toBe(false);
    });

    it('throws if MFA not enabled', () => {
      service.setup(USER, TENANT, EMAIL);
      expect(() => service.validate(USER, TENANT, '123456')).toThrow('not enabled');
    });
  });

  describe('Backup codes', () => {
    it('backup codes are single-use', () => {
      const { secret } = service.setup(USER, TENANT, EMAIL);
      const code = generateTotpCode(secret);
      const { backupCodes } = service.verifyAndEnable(USER, TENANT, code);
      const firstCode = backupCodes[0]!;
      expect(service.verifyBackupCode(USER, TENANT, firstCode)).toBe(true);
      expect(service.verifyBackupCode(USER, TENANT, firstCode)).toBe(false);
    });

    it('remaining count decreases after use', () => {
      const { secret } = service.setup(USER, TENANT, EMAIL);
      const code = generateTotpCode(secret);
      const { backupCodes } = service.verifyAndEnable(USER, TENANT, code);
      expect(service.getRemainingBackupCodes(USER, TENANT)).toBe(10);
      service.verifyBackupCode(USER, TENANT, backupCodes[0]!);
      expect(service.getRemainingBackupCodes(USER, TENANT)).toBe(9);
    });

    it('regenerates backup codes', () => {
      const { secret } = service.setup(USER, TENANT, EMAIL);
      const code = generateTotpCode(secret);
      service.verifyAndEnable(USER, TENANT, code);
      const newCodes = service.regenerateBackupCodes(USER, TENANT);
      expect(newCodes).toHaveLength(10);
      expect(service.getRemainingBackupCodes(USER, TENANT)).toBe(10);
    });

    it('rejects invalid backup code', () => {
      const { secret } = service.setup(USER, TENANT, EMAIL);
      const code = generateTotpCode(secret);
      service.verifyAndEnable(USER, TENANT, code);
      expect(service.verifyBackupCode(USER, TENANT, 'INVALID1')).toBe(false);
    });
  });

  describe('Disable', () => {
    it('disables MFA', () => {
      const { secret } = service.setup(USER, TENANT, EMAIL);
      const code = generateTotpCode(secret);
      service.verifyAndEnable(USER, TENANT, code);
      service.disable(USER, TENANT);
      expect(service.isEnabled(USER, TENANT)).toBe(false);
    });

    it('throws when disabling non-enrolled user', () => {
      expect(() => service.disable(USER, TENANT)).toThrow('not found');
    });
  });

  describe('Policy', () => {
    it('returns default policy', () => {
      const policy = service.getPolicy(TENANT);
      expect(policy.enforcement).toBe('optional');
      expect(policy.gracePeriodDays).toBe(7);
    });

    it('sets tenant policy', () => {
      service.setPolicy(TENANT, { enforcement: 'required', gracePeriodDays: 0 });
      expect(service.isRequired(TENANT)).toBe(true);
    });

    it('not required by default', () => {
      expect(service.isRequired(TENANT)).toBe(false);
    });
  });
});

/** Helper: generate a TOTP code from a hex secret using the same algorithm. */
function generateTotpCode(secret: string): string {
  const { createHmac } = require('crypto');
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', Buffer.from(secret, 'hex'));
  hmac.update(buffer);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const code = ((hash[offset] & 0x7f) << 24 | hash[offset + 1] << 16 | hash[offset + 2] << 8 | hash[offset + 3]) % 1000000;
  return code.toString().padStart(6, '0');
}
