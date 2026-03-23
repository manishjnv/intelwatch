import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigVersioning } from '../src/services/config-versioning.js';

describe('ConfigVersioning', () => {
  let versioning: ConfigVersioning;
  const TENANT = 'tenant-1';

  beforeEach(() => {
    versioning = new ConfigVersioning();
  });

  describe('snapshot', () => {
    it('creates a version snapshot', () => {
      const v = versioning.snapshot(TENANT, 'modules', { hunting: false }, 'user-1');
      expect(v.id).toBeDefined();
      expect(v.version).toBe(1);
      expect(v.section).toBe('modules');
      expect(v.tenantId).toBe(TENANT);
    });

    it('increments version numbers', () => {
      versioning.snapshot(TENANT, 'modules', { v: 1 }, 'user-1');
      const v2 = versioning.snapshot(TENANT, 'modules', { v: 2 }, 'user-1');
      expect(v2.version).toBe(2);
    });

    it('tracks versions per section independently', () => {
      versioning.snapshot(TENANT, 'modules', { v: 1 }, 'user-1');
      const v = versioning.snapshot(TENANT, 'risk', { w: 1 }, 'user-1');
      expect(v.version).toBe(1);
    });

    it('deep clones config to prevent mutation', () => {
      const config = { nested: { key: 'value' } };
      const v = versioning.snapshot(TENANT, 'modules', config, 'user-1');
      config.nested.key = 'changed';
      expect(v.config.nested).toEqual({ key: 'value' });
    });
  });

  describe('listVersions', () => {
    it('lists versions in descending order', () => {
      versioning.snapshot(TENANT, 'modules', { v: 1 }, 'user-1');
      versioning.snapshot(TENANT, 'modules', { v: 2 }, 'user-1');
      versioning.snapshot(TENANT, 'modules', { v: 3 }, 'user-1');
      const { data, total } = versioning.listVersions(TENANT, 'modules', 1, 10);
      expect(total).toBe(3);
      expect(data[0].version).toBe(3);
      expect(data[2].version).toBe(1);
    });

    it('filters by section', () => {
      versioning.snapshot(TENANT, 'modules', {}, 'user-1');
      versioning.snapshot(TENANT, 'risk', {}, 'user-1');
      const { total } = versioning.listVersions(TENANT, 'modules', 1, 10);
      expect(total).toBe(1);
    });

    it('paginates correctly', () => {
      for (let i = 0; i < 5; i++) {
        versioning.snapshot(TENANT, 'modules', { v: i }, 'user-1');
      }
      const { data } = versioning.listVersions(TENANT, 'modules', 2, 2);
      expect(data).toHaveLength(2);
      expect(data[0].version).toBe(3);
    });

    it('returns all sections when no filter', () => {
      versioning.snapshot(TENANT, 'modules', {}, 'user-1');
      versioning.snapshot(TENANT, 'risk', {}, 'user-1');
      const { total } = versioning.listVersions(TENANT, undefined, 1, 10);
      expect(total).toBe(2);
    });
  });

  describe('getVersion', () => {
    it('retrieves a specific version', () => {
      const v = versioning.snapshot(TENANT, 'modules', { data: true }, 'user-1');
      const retrieved = versioning.getVersion(TENANT, v.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.config).toEqual({ data: true });
    });

    it('returns null for wrong tenant', () => {
      const v = versioning.snapshot(TENANT, 'modules', {}, 'user-1');
      const retrieved = versioning.getVersion('other-tenant', v.id);
      expect(retrieved).toBeNull();
    });

    it('returns null for nonexistent id', () => {
      expect(versioning.getVersion(TENANT, 'fake-id')).toBeNull();
    });
  });

  describe('rollback', () => {
    it('returns config from a previous version', () => {
      const v1 = versioning.snapshot(TENANT, 'modules', { hunting: true }, 'user-1');
      versioning.snapshot(TENANT, 'modules', { hunting: false }, 'user-1');
      const config = versioning.rollback(TENANT, v1.id);
      expect(config).toEqual({ hunting: true });
    });

    it('throws for nonexistent version', () => {
      expect(() => versioning.rollback(TENANT, 'nonexistent')).toThrow('Version not found');
    });
  });

  describe('getLatest', () => {
    it('returns the most recent version', () => {
      versioning.snapshot(TENANT, 'modules', { v: 1 }, 'user-1');
      versioning.snapshot(TENANT, 'modules', { v: 2 }, 'user-1');
      const latest = versioning.getLatest(TENANT, 'modules');
      expect(latest?.version).toBe(2);
    });

    it('returns null when no versions exist', () => {
      expect(versioning.getLatest(TENANT, 'modules')).toBeNull();
    });
  });
});
