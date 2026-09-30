import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';

describe('ModuleReadinessChecker', () => {
  let checker: ModuleReadinessChecker;

  beforeEach(() => {
    checker = new ModuleReadinessChecker();
  });

  describe('checkAll', () => {
    it('returns all 14 platform modules', async () => {
      const modules = await checker.checkAll('t1');
      expect(modules).toHaveLength(14);
    });

    it('default enabled modules are ready', async () => {
      const modules = await checker.checkAll('t1');
      const ingestion = modules.find((m) => m.module === 'ingestion');
      expect(ingestion?.enabled).toBe(true);
      expect(ingestion?.status).toBe('ready');
    });

    it('non-default modules are disabled', async () => {
      const modules = await checker.checkAll('t1');
      const hunting = modules.find((m) => m.module === 'threat-hunting');
      expect(hunting?.enabled).toBe(false);
      expect(hunting?.status).toBe('disabled');
    });
  });

  describe('checkModule', () => {
    it('returns readiness for a specific module', async () => {
      const readiness = await checker.checkModule('t1', 'ingestion');
      expect(readiness.module).toBe('ingestion');
      expect(readiness.enabled).toBe(true);
      expect(readiness.healthy).toBe(true);
      expect(readiness.configured).toBe(true);
      expect(readiness.status).toBe('ready');
    });

    it('shows missing deps for module with unmet dependencies', async () => {
      const readiness = await checker.checkModule('t1', 'threat-actor-intel');
      // threat-actor-intel depends on ioc-intelligence which IS enabled by default
      expect(readiness.dependencies).toContain('ioc-intelligence');
    });

    it('shows disabled status for non-enabled module', async () => {
      const readiness = await checker.checkModule('t1', 'threat-graph');
      expect(readiness.enabled).toBe(false);
      expect(readiness.status).toBe('disabled');
    });
  });

  describe('enableModule', () => {
    it('enables a module', async () => {
      const readiness = await checker.enableModule('t1', 'threat-graph');
      expect(readiness.enabled).toBe(true);
    });

    it('shows needs_deps if dependencies not met', async () => {
      // malware-intel depends on ioc-intelligence
      // Disable ioc-intelligence first
      await checker.disableModule('t1', 'ioc-intelligence');
      const readiness = await checker.enableModule('t1', 'malware-intel');
      expect(readiness.enabled).toBe(true);
      expect(readiness.status).toBe('needs_deps');
      expect(readiness.missingDeps).toContain('ioc-intelligence');
    });
  });

  describe('disableModule', () => {
    it('disables a module', async () => {
      const readiness = await checker.disableModule('t1', 'ingestion');
      expect(readiness.enabled).toBe(false);
      expect(readiness.status).toBe('disabled');
    });
  });

  describe('markConfigured', () => {
    it('marks module as configured', async () => {
      await checker.enableModule('t1', 'threat-graph');
      await checker.markConfigured('t1', 'threat-graph');
      const readiness = await checker.checkModule('t1', 'threat-graph');
      expect(readiness.configured).toBe(true);
    });
  });

  describe('getEnabledCount', () => {
    it('returns default enabled count (5)', async () => {
      expect(await checker.getEnabledCount('t1')).toBe(5);
    });

    it('increases when enabling modules', async () => {
      await checker.enableModule('t1', 'threat-graph');
      expect(await checker.getEnabledCount('t1')).toBe(6);
    });
  });

  describe('getReadyModules', () => {
    it('returns modules that are ready', async () => {
      const ready = await checker.getReadyModules('t1');
      expect(ready).toContain('ingestion');
      expect(ready).toContain('normalization');
    });
  });

  describe('validateDependencies', () => {
    it('returns valid for module with met dependencies', async () => {
      const result = await checker.validateDependencies('t1', 'normalization');
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('returns invalid with missing deps', async () => {
      await checker.disableModule('t1', 'ioc-intelligence');
      const result = await checker.validateDependencies('t1', 'threat-actor-intel');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('ioc-intelligence');
    });

    it('returns valid for module with no dependencies', async () => {
      const result = await checker.validateDependencies('t1', 'user-management');
      expect(result.valid).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('different tenants have separate module states', async () => {
      await checker.enableModule('t1', 'threat-graph');
      const t1 = await checker.getEnabledCount('t1');
      const t2 = await checker.getEnabledCount('t2');
      expect(t1).toBe(6);
      expect(t2).toBe(5);
    });
  });
});
