import { describe, it, expect, beforeEach } from 'vitest';
import { AuditStore } from '../src/services/audit-store.js';

describe('AuditStore', () => {
  let store: AuditStore;

  beforeEach(() => {
    store = new AuditStore();
  });

  describe('addEvent', () => {
    it('creates an audit event with id and timestamp', () => {
      const event = store.addEvent({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'ioc.created',
        resource: 'ioc',
        resourceId: 'ioc-abc',
        details: { value: '1.2.3.4' },
        ipAddress: '192.168.1.1',
      });
      expect(event.id).toBeTruthy();
      expect(event.timestamp).toBeTruthy();
      expect(event.action).toBe('ioc.created');
    });
  });

  describe('list', () => {
    it('returns empty list initially', () => {
      expect(store.list({}).items.length).toBe(0);
    });

    it('returns events in reverse chronological order', () => {
      store.addEvent({ tenantId: 't1', userId: 'u1', action: 'ioc.created', resource: 'ioc', resourceId: 'r1', details: {}, ipAddress: '1.1.1.1' });
      store.addEvent({ tenantId: 't1', userId: 'u1', action: 'ioc.deleted', resource: 'ioc', resourceId: 'r2', details: {}, ipAddress: '1.1.1.1' });
      const result = store.list({});
      expect(result.items[0].action).toBe('ioc.deleted');
    });

    it('filters by tenantId', () => {
      store.addEvent({ tenantId: 'tenant-1', userId: 'u1', action: 'login', resource: 'session', resourceId: 's1', details: {}, ipAddress: '1.1.1.1' });
      store.addEvent({ tenantId: 'tenant-2', userId: 'u2', action: 'login', resource: 'session', resourceId: 's2', details: {}, ipAddress: '1.1.1.1' });
      const result = store.list({ tenantId: 'tenant-1' });
      expect(result.items.every((e) => e.tenantId === 'tenant-1')).toBe(true);
    });

    it('filters by userId', () => {
      store.addEvent({ tenantId: 't1', userId: 'user-A', action: 'create', resource: 'feed', resourceId: 'f1', details: {}, ipAddress: '1.1.1.1' });
      store.addEvent({ tenantId: 't1', userId: 'user-B', action: 'delete', resource: 'feed', resourceId: 'f2', details: {}, ipAddress: '1.1.1.1' });
      const result = store.list({ userId: 'user-A' });
      expect(result.items.every((e) => e.userId === 'user-A')).toBe(true);
    });

    it('filters by action', () => {
      store.addEvent({ tenantId: 't1', userId: 'u1', action: 'login', resource: 'session', resourceId: 's1', details: {}, ipAddress: '1.1.1.1' });
      store.addEvent({ tenantId: 't1', userId: 'u1', action: 'logout', resource: 'session', resourceId: 's2', details: {}, ipAddress: '1.1.1.1' });
      const result = store.list({ action: 'login' });
      expect(result.items.every((e) => e.action === 'login')).toBe(true);
    });

    it('paginates with page and limit', () => {
      for (let i = 0; i < 10; i++) {
        store.addEvent({ tenantId: 't1', userId: 'u1', action: 'create', resource: 'ioc', resourceId: `r${i}`, details: {}, ipAddress: '1.1.1.1' });
      }
      const page1 = store.list({ limit: 3, page: 1 });
      const page2 = store.list({ limit: 3, page: 2 });
      expect(page1.items.length).toBe(3);
      expect(page2.items.length).toBe(3);
      expect(page1.items[0].resourceId).not.toBe(page2.items[0].resourceId);
    });

    it('returns total count', () => {
      for (let i = 0; i < 5; i++) {
        store.addEvent({ tenantId: 't1', userId: 'u1', action: 'create', resource: 'ioc', resourceId: `r${i}`, details: {}, ipAddress: '1.1.1.1' });
      }
      const result = store.list({ limit: 2 });
      expect(result.total).toBe(5);
    });
  });

  describe('getStats', () => {
    it('returns stats object with event counts', () => {
      store.addEvent({ tenantId: 't1', userId: 'u1', action: 'login', resource: 'session', resourceId: 's1', details: {}, ipAddress: '1.1.1.1' });
      store.addEvent({ tenantId: 't1', userId: 'u1', action: 'create', resource: 'ioc', resourceId: 'r1', details: {}, ipAddress: '1.1.1.1' });
      const stats = store.getStats();
      expect(typeof stats.totalEvents).toBe('number');
      expect(stats.totalEvents).toBe(2);
      expect(typeof stats.byAction).toBe('object');
    });
  });

  describe('exportCsv', () => {
    it('returns a CSV string with headers', () => {
      store.addEvent({ tenantId: 't1', userId: 'u1', action: 'create', resource: 'ioc', resourceId: 'r1', details: {}, ipAddress: '1.1.1.1' });
      const csv = store.exportCsv({});
      expect(csv).toContain('id,tenantId,userId,action');
      expect(csv).toContain('t1');
    });

    it('returns only headers for empty store', () => {
      const csv = store.exportCsv({});
      expect(csv).toContain('id,tenantId,userId,action');
    });
  });
});
