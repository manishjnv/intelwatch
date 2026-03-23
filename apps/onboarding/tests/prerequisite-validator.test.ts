import { describe, it, expect, beforeEach } from 'vitest';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';
import { PrerequisiteValidator } from '../src/services/prerequisite-validator.js';

describe('PrerequisiteValidator', () => {
  let moduleReadiness: ModuleReadinessChecker;
  let validator: PrerequisiteValidator;

  beforeEach(() => {
    moduleReadiness = new ModuleReadinessChecker();
    validator = new PrerequisiteValidator(moduleReadiness);
  });

  describe('validate', () => {
    it('allows enabling module with met dependencies', () => {
      const result = validator.validate('t1', 'normalization');
      expect(result.canEnable).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('blocks enabling module with unmet dependencies', () => {
      moduleReadiness.disableModule('t1', 'ioc-intelligence');
      const result = validator.validate('t1', 'threat-actor-intel');
      expect(result.canEnable).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.blockers[0]).toContain('ioc-intelligence');
    });

    it('allows enabling module with no dependencies', () => {
      const result = validator.validate('t1', 'user-management');
      expect(result.canEnable).toBe(true);
    });

    it('returns warnings for config prerequisites', () => {
      const result = validator.validate('t1', 'ai-enrichment');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('api_keys_configured');
    });

    it('returns warnings for transitive dependencies', () => {
      // threat-actor-intel → ioc-intelligence → normalization → ingestion
      // Disable ingestion (transitive dep of threat-actor-intel)
      moduleReadiness.disableModule('t1', 'ingestion');
      const result = validator.validate('t1', 'threat-actor-intel');
      // ioc-intelligence is still enabled so direct dep is met
      // but transitive dep ingestion is disabled → warning
      expect(result.warnings.some((w) => w.includes('ingestion'))).toBe(true);
    });
  });

  describe('getRules', () => {
    it('returns rules for all 14 modules', () => {
      const rules = validator.getRules();
      expect(rules).toHaveLength(14);
    });

    it('each rule has module, requiredModules, and description', () => {
      const rules = validator.getRules();
      for (const rule of rules) {
        expect(rule.module).toBeDefined();
        expect(Array.isArray(rule.requiredModules)).toBe(true);
        expect(rule.description).toBeDefined();
      }
    });

    it('normalization requires ingestion', () => {
      const rules = validator.getRules();
      const norm = rules.find((r) => r.module === 'normalization');
      expect(norm?.requiredModules).toContain('ingestion');
    });
  });

  describe('enableWithValidation', () => {
    it('enables module when deps are met', () => {
      const result = validator.enableWithValidation('t1', 'threat-graph');
      expect(result.enabled).toBe(true);
    });

    it('refuses to enable when deps not met', () => {
      moduleReadiness.disableModule('t1', 'ioc-intelligence');
      const result = validator.enableWithValidation('t1', 'threat-actor-intel');
      expect(result.enabled).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
    });

    it('returns warnings even on success', () => {
      const result = validator.enableWithValidation('t1', 'ai-enrichment');
      expect(result.enabled).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('getDependencyChain', () => {
    it('returns empty chain for module with no deps', () => {
      const chain = validator.getDependencyChain('ingestion');
      expect(chain).toEqual(['ingestion']);
    });

    it('returns dependency chain in correct order', () => {
      const chain = validator.getDependencyChain('ai-enrichment');
      // ai-enrichment → normalization → ingestion
      expect(chain.indexOf('ingestion')).toBeLessThan(chain.indexOf('normalization'));
      expect(chain.indexOf('normalization')).toBeLessThan(chain.indexOf('ai-enrichment'));
    });

    it('returns full chain for deeply nested module', () => {
      const chain = validator.getDependencyChain('threat-actor-intel');
      // threat-actor-intel → ioc-intelligence → normalization → ingestion
      expect(chain).toContain('ingestion');
      expect(chain).toContain('normalization');
      expect(chain).toContain('ioc-intelligence');
      expect(chain).toContain('threat-actor-intel');
    });
  });
});
