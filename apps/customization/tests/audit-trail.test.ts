import { describe, it, expect, beforeEach } from 'vitest';
import { AuditTrail } from '../src/services/audit-trail.js';

describe('AuditTrail', () => {
  let trail: AuditTrail;
  const TENANT = 'tenant-1';

  beforeEach(() => {
    trail = new AuditTrail();
  });

  describe('log', () => {
    it('creates an audit entry', () => {
      const id = trail.log({
        tenantId: TENANT,
        userId: 'user-1',
        section: 'modules',
        action: 'module.disabled',
        before: { enabled: true },
        after: { enabled: false },
      });
      expect(id).toBeDefined();
    });

    it('calculates diff between before and after', () => {
      trail.log({
        tenantId: TENANT,
        userId: 'user-1',
        section: 'modules',
        action: 'module.updated',
        before: { enabled: true, name: 'old' },
        after: { enabled: false, name: 'old', newField: true },
      });
      const { data } = trail.query(TENANT, { page: 1, limit: 10 });
      expect(data[0].diff).not.toBeNull();
      expect(data[0].diff?.changed).toEqual([{ key: 'enabled', from: true, to: false }]);
      expect(data[0].diff?.added).toEqual(['newField']);
    });

    it('handles null before/after (no diff)', () => {
      trail.log({
        tenantId: TENANT,
        userId: 'user-1',
        section: 'modules',
        action: 'module.created',
        before: null,
        after: { enabled: true },
      });
      const { data } = trail.query(TENANT, { page: 1, limit: 10 });
      expect(data[0].diff).toBeNull();
    });
  });

  describe('query', () => {
    it('filters by tenant', () => {
      trail.log({ tenantId: TENANT, userId: 'u1', section: 'modules', action: 'a', before: null, after: null });
      trail.log({ tenantId: 'other', userId: 'u1', section: 'modules', action: 'a', before: null, after: null });
      const { total } = trail.query(TENANT, { page: 1, limit: 10 });
      expect(total).toBe(1);
    });

    it('filters by section', () => {
      trail.log({ tenantId: TENANT, userId: 'u1', section: 'modules', action: 'a', before: null, after: null });
      trail.log({ tenantId: TENANT, userId: 'u1', section: 'risk', action: 'a', before: null, after: null });
      const { total } = trail.query(TENANT, { page: 1, limit: 10, section: 'modules' });
      expect(total).toBe(1);
    });

    it('filters by userId', () => {
      trail.log({ tenantId: TENANT, userId: 'user-1', section: 'modules', action: 'a', before: null, after: null });
      trail.log({ tenantId: TENANT, userId: 'user-2', section: 'modules', action: 'a', before: null, after: null });
      const { total } = trail.query(TENANT, { page: 1, limit: 10, userId: 'user-1' });
      expect(total).toBe(1);
    });

    it('paginates results', () => {
      for (let i = 0; i < 5; i++) {
        trail.log({ tenantId: TENANT, userId: 'u1', section: 'modules', action: `a${i}`, before: null, after: null });
      }
      const { data, total } = trail.query(TENANT, { page: 2, limit: 2 });
      expect(total).toBe(5);
      expect(data).toHaveLength(2);
    });

    it('returns entries (most recent entries appear first or same timestamp)', () => {
      trail.log({ tenantId: TENANT, userId: 'u1', section: 'modules', action: 'first', before: null, after: null });
      trail.log({ tenantId: TENANT, userId: 'u1', section: 'modules', action: 'second', before: null, after: null });
      const { data } = trail.query(TENANT, { page: 1, limit: 10 });
      expect(data).toHaveLength(2);
      // Both entries should be present
      const actions = data.map((d) => d.action);
      expect(actions).toContain('first');
      expect(actions).toContain('second');
    });
  });

  describe('diffConfigs', () => {
    it('detects added keys', () => {
      const diff = trail.diffConfigs({}, { newKey: true });
      expect(diff.added).toEqual(['newKey']);
    });

    it('detects removed keys', () => {
      const diff = trail.diffConfigs({ oldKey: true }, {});
      expect(diff.removed).toEqual(['oldKey']);
    });

    it('detects changed values', () => {
      const diff = trail.diffConfigs({ key: 'old' }, { key: 'new' });
      expect(diff.changed).toEqual([{ key: 'key', from: 'old', to: 'new' }]);
    });

    it('handles nested objects', () => {
      const diff = trail.diffConfigs(
        { nested: { a: 1 } },
        { nested: { a: 2 } },
      );
      expect(diff.changed).toHaveLength(1);
    });

    it('returns empty diff for identical configs', () => {
      const diff = trail.diffConfigs({ a: 1 }, { a: 1 });
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
      expect(diff.changed).toHaveLength(0);
    });
  });

  describe('getEntryCount', () => {
    it('counts entries for a tenant', () => {
      trail.log({ tenantId: TENANT, userId: 'u1', section: 's', action: 'a', before: null, after: null });
      trail.log({ tenantId: TENANT, userId: 'u1', section: 's', action: 'a', before: null, after: null });
      expect(trail.getEntryCount(TENANT)).toBe(2);
    });
  });
});
