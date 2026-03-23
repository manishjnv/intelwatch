import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/services/session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;
  const TENANT = 'tenant-1';
  const USER = 'user-1';

  beforeEach(() => {
    manager = new SessionManager(15);
  });

  describe('Create session', () => {
    it('creates a session with correct fields', () => {
      const session = manager.create({
        userId: USER, tenantId: TENANT, ip: '1.2.3.4', userAgent: 'Mozilla/5.0',
      });
      expect(session.id).toBeDefined();
      expect(session.userId).toBe(USER);
      expect(session.ip).toBe('1.2.3.4');
      expect(session.isBreakGlass).toBe(false);
    });

    it('sets expiry based on TTL', () => {
      const session = manager.create({
        userId: USER, tenantId: TENANT, ip: '1.2.3.4', userAgent: 'test', ttlMinutes: 30,
      });
      const expiresAt = new Date(session.expiresAt).getTime();
      const createdAt = new Date(session.createdAt).getTime();
      expect(expiresAt - createdAt).toBeCloseTo(30 * 60 * 1000, -3);
    });

    it('creates break-glass session', () => {
      const session = manager.create({
        userId: USER, tenantId: TENANT, ip: '1.2.3.4', userAgent: 'test', isBreakGlass: true,
      });
      expect(session.isBreakGlass).toBe(true);
    });
  });

  describe('Get session', () => {
    it('retrieves active session', () => {
      const created = manager.create({ userId: USER, tenantId: TENANT, ip: '1.2.3.4', userAgent: 'test' });
      const retrieved = manager.get(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it('returns null for nonexistent session', () => {
      expect(manager.get('fake-id')).toBeNull();
    });
  });

  describe('List sessions', () => {
    it('lists sessions for a user', () => {
      manager.create({ userId: USER, tenantId: TENANT, ip: '1.1.1.1', userAgent: 'Chrome' });
      manager.create({ userId: USER, tenantId: TENANT, ip: '2.2.2.2', userAgent: 'Firefox' });
      manager.create({ userId: 'other-user', tenantId: TENANT, ip: '3.3.3.3', userAgent: 'Safari' });
      const result = manager.listByUser(USER, TENANT);
      expect(result.total).toBe(2);
    });

    it('tenant isolation', () => {
      manager.create({ userId: USER, tenantId: 'other-tenant', ip: '1.1.1.1', userAgent: 'test' });
      const result = manager.listByUser(USER, TENANT);
      expect(result.total).toBe(0);
    });
  });

  describe('Revoke', () => {
    it('revokes a specific session', () => {
      const session = manager.create({ userId: USER, tenantId: TENANT, ip: '1.2.3.4', userAgent: 'test' });
      manager.revoke(session.id, USER, TENANT);
      expect(manager.get(session.id)).toBeNull();
    });

    it('throws for nonexistent session', () => {
      expect(() => manager.revoke('fake', USER, TENANT)).toThrow('not found');
    });

    it('revokes all sessions for user', () => {
      manager.create({ userId: USER, tenantId: TENANT, ip: '1.1.1.1', userAgent: 'a' });
      manager.create({ userId: USER, tenantId: TENANT, ip: '2.2.2.2', userAgent: 'b' });
      const count = manager.revokeAll(USER, TENANT);
      expect(count).toBe(2);
      expect(manager.countActive(USER, TENANT)).toBe(0);
    });

    it('revokeOthers keeps the specified session', () => {
      const keep = manager.create({ userId: USER, tenantId: TENANT, ip: '1.1.1.1', userAgent: 'a' });
      manager.create({ userId: USER, tenantId: TENANT, ip: '2.2.2.2', userAgent: 'b' });
      const count = manager.revokeOthers(USER, TENANT, keep.id);
      expect(count).toBe(1);
      expect(manager.get(keep.id)).toBeDefined();
    });
  });

  describe('Touch', () => {
    it('updates lastSeenAt', () => {
      const session = manager.create({ userId: USER, tenantId: TENANT, ip: '1.2.3.4', userAgent: 'test' });
      const original = session.lastSeenAt;
      // Small delay
      manager.touch(session.id);
      const updated = manager.get(session.id);
      expect(updated!.lastSeenAt).toBeDefined();
      // lastSeenAt should be >= original
      expect(new Date(updated!.lastSeenAt).getTime()).toBeGreaterThanOrEqual(new Date(original).getTime());
    });
  });

  describe('Count', () => {
    it('counts active sessions', () => {
      manager.create({ userId: USER, tenantId: TENANT, ip: '1.1.1.1', userAgent: 'a' });
      manager.create({ userId: USER, tenantId: TENANT, ip: '2.2.2.2', userAgent: 'b' });
      expect(manager.countActive(USER, TENANT)).toBe(2);
    });
  });

  describe('Cleanup', () => {
    it('removes expired sessions', () => {
      // Create session with 0-minute TTL (immediately expired)
      manager.create({ userId: USER, tenantId: TENANT, ip: '1.1.1.1', userAgent: 'test', ttlMinutes: 0 });
      const removed = manager.cleanup();
      expect(removed).toBe(1);
    });
  });
});
