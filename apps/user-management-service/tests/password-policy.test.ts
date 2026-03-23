import { describe, it, expect, beforeEach } from 'vitest';
import { PasswordPolicyService } from '../src/services/password-policy.js';

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;
  const TENANT = 'tenant-1';

  beforeEach(() => {
    service = new PasswordPolicyService();
  });

  describe('Default policy', () => {
    it('returns sensible defaults', () => {
      const policy = service.getPolicy(TENANT);
      expect(policy.minLength).toBe(12);
      expect(policy.requireUppercase).toBe(true);
      expect(policy.requireLowercase).toBe(true);
      expect(policy.requireNumbers).toBe(true);
      expect(policy.requireSpecialChars).toBe(true);
    });
  });

  describe('Custom policy', () => {
    it('sets and retrieves tenant policy', () => {
      service.setPolicy(TENANT, {
        minLength: 8, requireUppercase: false, requireLowercase: true,
        requireNumbers: true, requireSpecialChars: false, maxAgeDays: 180, preventReuse: 3,
      });
      const policy = service.getPolicy(TENANT);
      expect(policy.minLength).toBe(8);
      expect(policy.requireUppercase).toBe(false);
    });
  });

  describe('Password validation', () => {
    it('accepts a strong password', () => {
      const result = service.validate('MyStr0ng!Password2024', TENANT);
      expect(result.valid).toBe(true);
      expect(result.strength).toMatch(/good|strong/);
    });

    it('rejects too short password', () => {
      const result = service.validate('Sh0rt!', TENANT);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('at least'))).toBe(true);
    });

    it('rejects missing uppercase', () => {
      const result = service.validate('alllowercase1!longpassword', TENANT);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('uppercase'))).toBe(true);
    });

    it('rejects missing lowercase', () => {
      const result = service.validate('ALLUPPERCASE1!LONGPASSWORD', TENANT);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('lowercase'))).toBe(true);
    });

    it('rejects missing numbers', () => {
      const result = service.validate('NoNumbersHere!Long', TENANT);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('number'))).toBe(true);
    });

    it('rejects missing special chars', () => {
      const result = service.validate('NoSpecials123Long', TENANT);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('special'))).toBe(true);
    });

    it('flags common patterns', () => {
      const result = service.validate('password1234!A', TENANT);
      expect(result.errors.some((e) => e.includes('common'))).toBe(true);
    });

    it('flags repeated characters', () => {
      const result = service.validate('AAAbbbb123!test', TENANT);
      expect(result.errors.some((e) => e.includes('repeated'))).toBe(true);
    });

    it('gives bonus score for extra length', () => {
      const short = service.validate('MyP@ss1234Ab', TENANT);
      const long = service.validate('MyP@ss1234Ab5678901234', TENANT);
      expect(long.score).toBeGreaterThan(short.score);
    });
  });

  describe('Strength classification', () => {
    it('classifies weak password', () => {
      const result = service.validate('short', TENANT);
      expect(result.strength).toBe('weak');
    });

    it('classifies strong password', () => {
      const result = service.validate('SuperStr0ng!P@ssw0rd2024LongEnough', TENANT);
      expect(result.strength).toBe('strong');
    });
  });

  describe('Password history', () => {
    it('blocks reused password', () => {
      service.recordPassword('user-1', TENANT, 'OldPassword1!Ab');
      const result = service.validate('OldPassword1!Ab', TENANT, 'user-1');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('recently'))).toBe(true);
    });

    it('allows password not in history', () => {
      service.recordPassword('user-1', TENANT, 'OldPassword1!Ab');
      const result = service.validate('NewP@ssword2!CD', TENANT, 'user-1');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateOrThrow', () => {
    it('throws for invalid password', () => {
      expect(() => service.validateOrThrow('bad', TENANT)).toThrow('does not meet policy');
    });

    it('does not throw for valid password', () => {
      expect(() => service.validateOrThrow('ValidP@ssword123', TENANT)).not.toThrow();
    });
  });
});
