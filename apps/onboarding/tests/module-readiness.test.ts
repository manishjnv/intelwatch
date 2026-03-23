import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';

describe('ModuleReadinessChecker', () => {
  let checker: ModuleReadinessChecker;

  beforeEach(() => {
    checker = new ModuleReadinessChecker();
  });

  describe('checkAll', () => {
    it('returns all 14 platform modules', () => {
      const modules = checker.checkAll('t1');
      expect(modules).toHaveLength(14);
    });

    it('default enabled modules are ready', () => {
      const modules = checker.checkAll('t1');
      const ingestion = modules.find((m) => m.module === 'ingestion');
      expect(ingestion?.enabled).toBe(true);
      expect(ingestion?.status).toBe('ready');
    });

    it('non-default modules are disabled', () => {
      const modules = checker.checkAll('t1');
      const hunting = modules.find((m) => m.module === 'threat-hunting');
      expect(hunting?.enabled).toBe(false);
      expect(hunting?.status).toBe('disabled');
    });
  });

  describe('checkModule', () => {
    it('returns readiness for a specific module', () => {
      const readiness = checker.checkModule('t1', 'ingestion');
      expect(readiness.module).toBe('ingestion');
      expect(readiness.enabled).toBe(true);
      expect(readiness.healthy).toBe(true);
      expect(readiness.configured).toBe(true);
      expect(readiness.status).toBe('ready');
    });

    it('shows missing deps for module with unmet dependencies', () => {
      const readiness = checker.checkModule('t1', 'threat-actor-intel');
      // threat-actor-intel depends on ioc-intelligence which IS enabled by default
      expect(readiness.dependencies).toContain('ioc-intelligence');
    });

    it('shows disabled status for non-enabled module', () => {
      const readiness = checker.checkModule('t1', 'threat-graph');
      expect(readiness.enabled).toBe(false);
      expect(readiness.status).toBe('disabled');
    });
  });

  describe('enableModule', () => {
    it('enables a module', () => {
      const readiness = checker.enableModule('t1', 'threat-graph');
      expect(readiness.enabled).toBe(true);
    });

    it('shows needs_deps if dependencies not met', () => {
      // malware-intel depends on ioc-intelligence
      // Disable ioc-intelligence first
      checker.disableModule('t1', 'ioc-intelligence');
      const readiness = checker.enableModule('t1', 'malware-intel');
      expect(readiness.enabled).toBe(true);
      expect(readiness.status).toBe('needs_deps');
      expect(readiness.missingDeps).toContain('ioc-intelligence');
    });
  });

  describe('disableModule', () => {
    it('disables a module', () => {
      const readiness = checker.disableModule('t1', 'ingestion');
      expect(readiness.enabled).toBe(false);
      expect(readiness.status).toBe('disabled');
    });
  });

  describe('markConfigured', () => {
    it('marks module as configured', () => {
      checker.enableModule('t1', 'threat-graph');
      checker.markConfigured('t1', 'threat-graph');
      const readiness = checker.checkModule('t1', 'threat-graph');
      expect(readiness.configured).toBe(true);
    });
  });

  describe('getEnabledCount', () => {
    it('returns default enabled count (5)', () => {
      expect(checker.getEnabledCount('t1')).toBe(5);
    });

    it('increases when enabling modules', () => {
      checker.enableModule('t1', 'threat-graph');
      expect(checker.getEnabledCount('t1')).toBe(6);
    });
  });

  describe('getReadyModules', () => {
    it('returns modules that are ready', () => {
      const ready = checker.getReadyModules('t1');
      expect(ready).toContain('ingestion');
      expect(ready).toContain('normalization');
    });
  });

  describe('validateDependencies', () => {
    it('returns valid for module with met dependencies', () => {
      const result = checker.validateDependencies('t1', 'normalization');
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('returns invalid with missing deps', () => {
      checker.disableModule('t1', 'ioc-intelligence');
      const result = checker.validateDependencies('t1', 'threat-actor-intel');
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('ioc-intelligence');
    });

    it('returns valid for module with no dependencies', () => {
      const result = checker.validateDependencies('t1', 'user-management');
      expect(result.valid).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('different tenants have separate module states', () => {
      checker.enableModule('t1', 'threat-graph');
      const t1 = checker.getEnabledCount('t1');
      const t2 = checker.getEnabledCount('t2');
      expect(t1).toBe(6);
      expect(t2).toBe(5);
    });
  });
});
