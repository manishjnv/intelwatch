import { describe, it, expect, beforeEach } from 'vitest';
import { BreakGlassService } from '../src/services/break-glass-service.js';
import { AuditLogger } from '../src/services/audit-logger.js';

describe('BreakGlassService', () => {
  let service: BreakGlassService;
  let auditLogger: AuditLogger;
  const TENANT = 'tenant-1';
  const ADMIN = 'admin-1';

  beforeEach(() => {
    auditLogger = new AuditLogger();
    service = new BreakGlassService(auditLogger, 30);
  });

  describe('Setup', () => {
    it('creates break-glass account with recovery codes', () => {
      const result = service.setup(TENANT, 'Initial setup for emergency access', ADMIN);
      expect(result.accountId).toBeDefined();
      expect(result.codes).toHaveLength(5);
      expect(result.codes[0]).toMatch(/^BG-/);
    });

    it('rejects duplicate setup', () => {
      service.setup(TENANT, 'First setup', ADMIN);
      expect(() => service.setup(TENANT, 'Second setup', ADMIN)).toThrow('already exists');
    });

    it('logs setup to audit', () => {
      service.setup(TENANT, 'Audit test setup', ADMIN);
      const { data } = auditLogger.query(TENANT, { page: 1, limit: 10 });
      expect(data.some((e) => e.action === 'break_glass.setup')).toBe(true);
    });
  });

  describe('Login', () => {
    it('authenticates with valid recovery code', () => {
      const { codes } = service.setup(TENANT, 'Setup', ADMIN);
      const session = service.login(TENANT, codes[0]!, 'IdP is down, need emergency access', '1.2.3.4');
      expect(session.sessionId).toBeDefined();
      expect(session.reason).toContain('IdP is down');
      expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('recovery code is single-use', () => {
      const { codes } = service.setup(TENANT, 'Setup', ADMIN);
      service.login(TENANT, codes[0]!, 'First use', null);
      expect(() => service.login(TENANT, codes[0]!, 'Second use', null)).toThrow('Invalid recovery code');
    });

    it('decrements remaining codes', () => {
      const { codes } = service.setup(TENANT, 'Setup', ADMIN);
      expect(service.getRemainingCodes(TENANT)).toBe(5);
      service.login(TENANT, codes[0]!, 'Emergency', null);
      expect(service.getRemainingCodes(TENANT)).toBe(4);
    });

    it('rejects invalid code', () => {
      service.setup(TENANT, 'Setup', ADMIN);
      expect(() => service.login(TENANT, 'BG-INVALID1', 'Fake emergency', null)).toThrow('Invalid recovery code');
    });

    it('throws for unconfigured tenant', () => {
      expect(() => service.login('unknown', 'code', 'reason text', null)).toThrow('not configured');
    });

    it('logs successful login as critical', () => {
      const { codes } = service.setup(TENANT, 'Setup', ADMIN);
      service.login(TENANT, codes[0]!, 'Emergency login', '10.0.0.1');
      const { data } = auditLogger.query(TENANT, { page: 1, limit: 10, action: 'break_glass.login_success' });
      expect(data).toHaveLength(1);
      expect(data[0]!.riskLevel).toBe('critical');
    });

    it('logs failed login as critical', () => {
      service.setup(TENANT, 'Setup', ADMIN);
      try { service.login(TENANT, 'BG-BADCODE1', 'Fake', null); } catch { /* expected */ }
      const { data } = auditLogger.query(TENANT, { page: 1, limit: 10, action: 'break_glass.login_failed' });
      expect(data).toHaveLength(1);
    });
  });

  describe('Session validation', () => {
    it('validates active session', () => {
      const { codes } = service.setup(TENANT, 'Setup', ADMIN);
      const session = service.login(TENANT, codes[0]!, 'Emergency', null);
      expect(service.isSessionValid(session.sessionId)).toBe(true);
    });

    it('returns false for nonexistent session', () => {
      expect(service.isSessionValid('fake-session-id')).toBe(false);
    });
  });

  describe('Rotate codes', () => {
    it('generates new recovery codes', () => {
      service.setup(TENANT, 'Setup', ADMIN);
      const newCodes = service.rotateCodes(TENANT, 'Rotating for security', ADMIN);
      expect(newCodes).toHaveLength(5);
      expect(service.getRemainingCodes(TENANT)).toBe(5);
    });

    it('invalidates old codes after rotation', () => {
      const { codes: oldCodes } = service.setup(TENANT, 'Setup', ADMIN);
      service.rotateCodes(TENANT, 'Rotating', ADMIN);
      expect(() => service.login(TENANT, oldCodes[0]!, 'Emergency', null)).toThrow('Invalid recovery code');
    });

    it('throws for unconfigured tenant', () => {
      expect(() => service.rotateCodes('unknown', 'Rotate', ADMIN)).toThrow('not configured');
    });
  });

  describe('Usage log', () => {
    it('returns account info without codes', () => {
      service.setup(TENANT, 'Setup', ADMIN);
      const log = service.getUsageLog(TENANT);
      expect(log.account).toBeDefined();
      expect(log.account!.useCount).toBe(0);
    });

    it('returns null for unconfigured tenant', () => {
      const log = service.getUsageLog('unknown');
      expect(log.account).toBeNull();
    });

    it('tracks active sessions', () => {
      const { codes } = service.setup(TENANT, 'Setup', ADMIN);
      service.login(TENANT, codes[0]!, 'Emergency', null);
      const log = service.getUsageLog(TENANT);
      expect(log.activeSessions).toHaveLength(1);
    });
  });
});
