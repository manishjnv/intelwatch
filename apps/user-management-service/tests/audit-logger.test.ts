import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogger } from '../src/services/audit-logger.js';

describe('AuditLogger', () => {
  let logger: AuditLogger;
  const TENANT = 'tenant-1';

  beforeEach(() => {
    logger = new AuditLogger();
  });

  describe('Logging', () => {
    it('creates an audit entry', () => {
      const id = logger.log({
        tenantId: TENANT, userId: 'user-1', action: 'login.success',
        riskLevel: 'low', details: { method: 'password' },
      });
      expect(id).toBeDefined();
    });

    it('auto-generates timestamp', () => {
      logger.log({
        tenantId: TENANT, userId: 'user-1', action: 'test',
        riskLevel: 'low', details: {},
      });
      const { data } = logger.query(TENANT, { page: 1, limit: 10 });
      expect(data[0]!.timestamp).toBeDefined();
    });

    it('stores IP and user agent', () => {
      logger.log({
        tenantId: TENANT, userId: 'user-1', action: 'login',
        riskLevel: 'low', details: {}, ip: '1.2.3.4', userAgent: 'Mozilla/5.0',
      });
      const { data } = logger.query(TENANT, { page: 1, limit: 10 });
      expect(data[0]!.ip).toBe('1.2.3.4');
      expect(data[0]!.userAgent).toBe('Mozilla/5.0');
    });
  });

  describe('Querying', () => {
    beforeEach(() => {
      logger.log({ tenantId: TENANT, userId: 'user-1', action: 'login.success', riskLevel: 'low', details: {} });
      logger.log({ tenantId: TENANT, userId: 'user-2', action: 'login.failed', riskLevel: 'high', details: {} });
      logger.log({ tenantId: TENANT, userId: 'user-1', action: 'role.changed', riskLevel: 'medium', details: {} });
      logger.log({ tenantId: 'other-tenant', userId: 'user-3', action: 'login.success', riskLevel: 'low', details: {} });
    });

    it('filters by tenant (isolation)', () => {
      const { total } = logger.query(TENANT, { page: 1, limit: 50 });
      expect(total).toBe(3);
    });

    it('filters by action', () => {
      const { data } = logger.query(TENANT, { page: 1, limit: 50, action: 'login.failed' });
      expect(data).toHaveLength(1);
    });

    it('filters by userId', () => {
      const { data } = logger.query(TENANT, { page: 1, limit: 50, userId: 'user-1' });
      expect(data).toHaveLength(2);
    });

    it('filters by riskLevel', () => {
      const { data } = logger.query(TENANT, { page: 1, limit: 50, riskLevel: 'high' });
      expect(data).toHaveLength(1);
    });

    it('paginates correctly', () => {
      const { data } = logger.query(TENANT, { page: 1, limit: 2 });
      expect(data).toHaveLength(2);
    });

    it('returns entries sorted by timestamp descending', () => {
      const { data } = logger.query(TENANT, { page: 1, limit: 10 });
      // Entries logged in same ms may have same timestamp; verify descending order
      for (let i = 1; i < data.length; i++) {
        expect(data[i - 1]!.timestamp >= data[i]!.timestamp).toBe(true);
      }
    });
  });

  describe('Analytics', () => {
    it('counts by action', () => {
      logger.log({ tenantId: TENANT, userId: 'u1', action: 'login', riskLevel: 'low', details: {} });
      logger.log({ tenantId: TENANT, userId: 'u2', action: 'login', riskLevel: 'low', details: {} });
      logger.log({ tenantId: TENANT, userId: 'u1', action: 'mfa.setup', riskLevel: 'medium', details: {} });
      const counts = logger.countByAction(TENANT);
      expect(counts['login']).toBe(2);
      expect(counts['mfa.setup']).toBe(1);
    });

    it('counts by risk level', () => {
      logger.log({ tenantId: TENANT, userId: 'u1', action: 'a', riskLevel: 'low', details: {} });
      logger.log({ tenantId: TENANT, userId: 'u1', action: 'b', riskLevel: 'critical', details: {} });
      const counts = logger.countByRiskLevel(TENANT);
      expect(counts.low).toBe(1);
      expect(counts.critical).toBe(1);
    });

    it('total count per tenant', () => {
      logger.log({ tenantId: TENANT, userId: 'u1', action: 'a', riskLevel: 'low', details: {} });
      logger.log({ tenantId: TENANT, userId: 'u1', action: 'b', riskLevel: 'low', details: {} });
      expect(logger.count(TENANT)).toBe(2);
    });
  });
});
