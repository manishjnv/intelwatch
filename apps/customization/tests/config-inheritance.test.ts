import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigInheritance } from '../src/services/config-inheritance.js';

describe('ConfigInheritance', () => {
  let inheritance: ConfigInheritance;
  const TENANT = 'tenant-1';
  const USER = 'user-1';
  const SECTION = 'dashboard';

  beforeEach(() => {
    inheritance = new ConfigInheritance();
  });

  describe('tenant defaults', () => {
    it('sets and retrieves tenant defaults', () => {
      inheritance.setTenantDefaults(TENANT, SECTION, { density: 'compact', theme: 'dark' });
      const defaults = inheritance.getTenantDefaults(TENANT, SECTION);
      expect(defaults.density).toBe('compact');
      expect(defaults.theme).toBe('dark');
    });

    it('returns empty object when no defaults set', () => {
      const defaults = inheritance.getTenantDefaults(TENANT, SECTION);
      expect(defaults).toEqual({});
    });

    it('deep clones to prevent mutation', () => {
      inheritance.setTenantDefaults(TENANT, SECTION, { nested: { key: 'value' } });
      const defaults = inheritance.getTenantDefaults(TENANT, SECTION);
      (defaults.nested as Record<string, unknown>).key = 'changed';
      const defaults2 = inheritance.getTenantDefaults(TENANT, SECTION);
      expect((defaults2.nested as Record<string, unknown>).key).toBe('value');
    });
  });

  describe('user overrides', () => {
    it('sets and retrieves user overrides', () => {
      inheritance.setUserOverride(TENANT, USER, SECTION, { density: 'comfortable' });
      const overrides = inheritance.getUserOverrides(TENANT, USER, SECTION);
      expect(overrides.density).toBe('comfortable');
    });

    it('returns empty object when no overrides set', () => {
      const overrides = inheritance.getUserOverrides(TENANT, USER, SECTION);
      expect(overrides).toEqual({});
    });
  });

  describe('resolveConfig', () => {
    it('merges tenant defaults with user overrides', () => {
      inheritance.setTenantDefaults(TENANT, SECTION, {
        density: 'compact',
        theme: 'dark',
        autoRefresh: 30,
      });
      inheritance.setUserOverride(TENANT, USER, SECTION, {
        density: 'comfortable',
      });

      const resolved = inheritance.resolveConfig(TENANT, USER, SECTION);
      expect(resolved.density).toBe('comfortable'); // user override
      expect(resolved.theme).toBe('dark'); // tenant default
      expect(resolved.autoRefresh).toBe(30); // tenant default
    });

    it('returns only defaults when no overrides', () => {
      inheritance.setTenantDefaults(TENANT, SECTION, { density: 'compact' });
      const resolved = inheritance.resolveConfig(TENANT, USER, SECTION);
      expect(resolved.density).toBe('compact');
    });

    it('returns only overrides when no defaults', () => {
      inheritance.setUserOverride(TENANT, USER, SECTION, { density: 'comfortable' });
      const resolved = inheritance.resolveConfig(TENANT, USER, SECTION);
      expect(resolved.density).toBe('comfortable');
    });

    it('returns empty when neither exists', () => {
      const resolved = inheritance.resolveConfig(TENANT, USER, SECTION);
      expect(resolved).toEqual({});
    });

    it('isolates between tenants', () => {
      inheritance.setTenantDefaults(TENANT, SECTION, { density: 'compact' });
      inheritance.setTenantDefaults('tenant-2', SECTION, { density: 'comfortable' });
      const r1 = inheritance.resolveConfig(TENANT, USER, SECTION);
      const r2 = inheritance.resolveConfig('tenant-2', USER, SECTION);
      expect(r1.density).toBe('compact');
      expect(r2.density).toBe('comfortable');
    });
  });

  describe('clearUserOverrides', () => {
    it('clears user overrides for a section', () => {
      inheritance.setUserOverride(TENANT, USER, SECTION, { density: 'comfortable' });
      inheritance.clearUserOverrides(TENANT, USER, SECTION);
      const overrides = inheritance.getUserOverrides(TENANT, USER, SECTION);
      expect(overrides).toEqual({});
    });
  });

  describe('clearAll', () => {
    it('clears tenant defaults and all user overrides for a section', () => {
      inheritance.setTenantDefaults(TENANT, SECTION, { density: 'compact' });
      inheritance.setUserOverride(TENANT, USER, SECTION, { theme: 'light' });
      inheritance.setUserOverride(TENANT, 'user-2', SECTION, { theme: 'dark' });

      inheritance.clearAll(TENANT, SECTION);

      expect(inheritance.getTenantDefaults(TENANT, SECTION)).toEqual({});
      expect(inheritance.getUserOverrides(TENANT, USER, SECTION)).toEqual({});
      expect(inheritance.getUserOverrides(TENANT, 'user-2', SECTION)).toEqual({});
    });
  });
});
