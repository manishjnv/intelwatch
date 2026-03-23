import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleToggleStore } from '../src/services/module-toggle-store.js';
import { ValidationEngine } from '../src/services/validation-engine.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { ConfigVersioning } from '../src/services/config-versioning.js';

describe('ModuleToggleStore', () => {
  let store: ModuleToggleStore;
  let auditTrail: AuditTrail;
  let versioning: ConfigVersioning;

  beforeEach(() => {
    const validationEngine = new ValidationEngine();
    auditTrail = new AuditTrail();
    versioning = new ConfigVersioning();
    store = new ModuleToggleStore(validationEngine, auditTrail, versioning);
  });

  const TENANT = 'tenant-1';

  describe('listToggles', () => {
    it('returns all 13 platform modules with defaults', () => {
      const toggles = store.listToggles(TENANT);
      expect(toggles).toHaveLength(13);
      expect(toggles.every((t) => t.enabled)).toBe(true);
      expect(toggles.every((t) => t.tenantId === TENANT)).toBe(true);
    });

    it('isolates toggles between tenants', () => {
      store.setToggle(TENANT, 'hunting', { enabled: false }, 'user-1');
      // Need to disable correlation first since hunting depends on it
      // Actually hunting depends on correlation, so we disable hunting (which has no dependents)
      const t1 = store.listToggles(TENANT);
      const t2 = store.listToggles('tenant-2');
      const huntingT1 = t1.find((t) => t.module === 'hunting');
      const huntingT2 = t2.find((t) => t.module === 'hunting');
      expect(huntingT1?.enabled).toBe(false);
      expect(huntingT2?.enabled).toBe(true);
    });
  });

  describe('getToggle', () => {
    it('returns a specific module toggle', () => {
      const toggle = store.getToggle(TENANT, 'ingestion');
      expect(toggle.module).toBe('ingestion');
      expect(toggle.enabled).toBe(true);
    });

    it('throws for unknown module', () => {
      expect(() => store.getToggle(TENANT, 'nonexistent' as never)).toThrow();
    });
  });

  describe('setToggle', () => {
    it('enables/disables a module without dependents', () => {
      const toggle = store.setToggle(TENANT, 'hunting', { enabled: false }, 'user-1');
      expect(toggle.enabled).toBe(false);
      expect(toggle.updatedBy).toBe('user-1');
    });

    it('rejects disabling a module with enabled dependents', () => {
      expect(() =>
        store.setToggle(TENANT, 'ingestion', { enabled: false }, 'user-1'),
      ).toThrow(/Cannot (enable|disable)/);
    });

    it('updates feature flags', () => {
      const toggle = store.setToggle(TENANT, 'enrichment', {
        enabled: true,
        featureFlags: { beta_ai: true, preview_mode: false },
      }, 'user-1');
      expect(toggle.featureFlags.beta_ai).toBe(true);
      expect(toggle.featureFlags.preview_mode).toBe(false);
    });

    it('merges feature flags on update', () => {
      store.setToggle(TENANT, 'enrichment', {
        enabled: true,
        featureFlags: { flag_a: true },
      }, 'user-1');
      const toggle = store.setToggle(TENANT, 'enrichment', {
        enabled: true,
        featureFlags: { flag_b: true },
      }, 'user-1');
      expect(toggle.featureFlags.flag_a).toBe(true);
      expect(toggle.featureFlags.flag_b).toBe(true);
    });

    it('creates audit trail entry', () => {
      store.setToggle(TENANT, 'hunting', { enabled: false }, 'user-1');
      expect(auditTrail.getEntryCount(TENANT)).toBeGreaterThan(0);
    });

    it('creates version snapshot', () => {
      store.setToggle(TENANT, 'hunting', { enabled: false }, 'user-1');
      const versions = versioning.listVersions(TENANT, 'modules', 1, 10);
      expect(versions.total).toBeGreaterThan(0);
    });
  });

  describe('bulkUpdate', () => {
    it('updates multiple modules at once', () => {
      const result = store.bulkUpdate(TENANT, [
        { name: 'hunting', enabled: false },
        { name: 'user_management', enabled: false },
      ], 'user-1');
      expect(result).toHaveLength(2);
      expect(result.find((t) => t.module === 'hunting')?.enabled).toBe(false);
    });

    it('rejects invalid bulk configuration', () => {
      expect(() =>
        store.bulkUpdate(TENANT, [
          { name: 'ingestion', enabled: false },
        ], 'user-1'),
      ).toThrow(/Cannot disable/);
    });
  });

  describe('getDependencyGraph', () => {
    it('returns the full dependency graph', () => {
      const graph = store.getDependencyGraph();
      expect(graph.normalization).toContain('ingestion');
      expect(graph.enrichment).toContain('normalization');
      expect(graph.correlation).toContain('graph');
      expect(graph.hunting).toContain('correlation');
    });
  });

  describe('validateConfiguration', () => {
    it('validates a valid configuration', () => {
      const result = store.validateConfiguration([
        { name: 'hunting', enabled: false },
      ]);
      expect(result.valid).toBe(true);
    });

    it('returns errors for invalid configuration', () => {
      const result = store.validateConfiguration([
        { name: 'normalization', enabled: false },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('setFeatureFlag', () => {
    it('sets a feature flag on a module', () => {
      const toggle = store.setFeatureFlag(TENANT, 'enrichment', 'beta_ai', true, 'user-1');
      expect(toggle.featureFlags.beta_ai).toBe(true);
    });

    it('throws for unknown module', () => {
      expect(() =>
        store.setFeatureFlag(TENANT, 'nonexistent' as never, 'flag', true, 'user-1'),
      ).toThrow();
    });
  });

  describe('export/import', () => {
    it('exports toggle data', () => {
      store.setToggle(TENANT, 'hunting', { enabled: false }, 'user-1');
      const data = store.getExportData(TENANT);
      expect(data.hunting).toBeDefined();
      expect((data.hunting as Record<string, unknown>).enabled).toBe(false);
    });

    it('imports toggle data', () => {
      store.importData(TENANT, {
        hunting: { enabled: false, featureFlags: { imported: true } },
      }, 'user-1');
      const toggle = store.getToggle(TENANT, 'hunting');
      expect(toggle.enabled).toBe(false);
      expect(toggle.featureFlags.imported).toBe(true);
    });
  });
});
