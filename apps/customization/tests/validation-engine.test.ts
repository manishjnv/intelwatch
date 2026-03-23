import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationEngine } from '../src/services/validation-engine.js';

describe('ValidationEngine', () => {
  let engine: ValidationEngine;

  beforeEach(() => {
    engine = new ValidationEngine();
  });

  describe('validateModuleDependencies', () => {
    it('allows disabling a leaf module', () => {
      const result = engine.validateModuleDependencies([
        { name: 'hunting', enabled: false },
      ]);
      expect(result.valid).toBe(true);
    });

    it('rejects disabling a module with dependents', () => {
      const result = engine.validateModuleDependencies([
        { name: 'normalization', enabled: false },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('normalization'))).toBe(true);
    });

    it('allows disabling a chain bottom-up', () => {
      const result = engine.validateModuleDependencies([
        { name: 'hunting', enabled: false },
        { name: 'correlation', enabled: false },
      ]);
      expect(result.valid).toBe(true);
    });

    it('rejects enabling a module without dependencies', () => {
      const result = engine.validateModuleDependencies([
        { name: 'enrichment', enabled: true },
        { name: 'normalization', enabled: false },
      ]);
      expect(result.valid).toBe(false);
    });

    it('handles standalone modules', () => {
      const result = engine.validateModuleDependencies([
        { name: 'user_management', enabled: false },
      ]);
      expect(result.valid).toBe(true);
    });

    it('validates complex dependency chains', () => {
      // Can't disable ioc_intel if threat_actor is enabled
      const result = engine.validateModuleDependencies([
        { name: 'ioc_intel', enabled: false },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('threat_actor'))).toBe(true);
    });
  });

  describe('validateWeightSum', () => {
    it('accepts weights summing to 1.0', () => {
      const result = engine.validateWeightSum({
        a: 0.3, b: 0.3, c: 0.2, d: 0.1, e: 0.1,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects weights not summing to 1.0', () => {
      const result = engine.validateWeightSum({ a: 0.5, b: 0.3 });
      expect(result.valid).toBe(false);
    });

    it('accepts within tolerance (0.001)', () => {
      const result = engine.validateWeightSum({
        a: 0.3333, b: 0.3333, c: 0.3334,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects weights outside 0-1 range', () => {
      const result = engine.validateWeightSum({ a: 1.5, b: -0.5 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('between 0 and 1'))).toBe(true);
    });

    it('supports custom expected sum', () => {
      const result = engine.validateWeightSum({ a: 0.5, b: 0.5 }, 1.0);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateDecayRate', () => {
    it('accepts rate between 0 and 1', () => {
      expect(engine.validateDecayRate(0.05).valid).toBe(true);
      expect(engine.validateDecayRate(0).valid).toBe(true);
      expect(engine.validateDecayRate(1).valid).toBe(true);
    });

    it('rejects rate outside range', () => {
      expect(engine.validateDecayRate(-0.1).valid).toBe(false);
      expect(engine.validateDecayRate(1.5).valid).toBe(false);
    });
  });

  describe('validateBudget', () => {
    it('accepts valid budget', () => {
      const result = engine.validateBudget(1_000_000, 20_000_000);
      expect(result.valid).toBe(true);
    });

    it('rejects daily > monthly', () => {
      const result = engine.validateBudget(5_000_000, 1_000_000);
      expect(result.valid).toBe(false);
    });

    it('rejects negative values', () => {
      const result = engine.validateBudget(-1, 1000);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateQuietHours', () => {
    it('accepts valid times', () => {
      const result = engine.validateQuietHours('22:00', '07:00');
      expect(result.valid).toBe(true);
    });

    it('rejects invalid time format', () => {
      const result = engine.validateQuietHours('25:00', '07:00');
      expect(result.valid).toBe(false);
    });
  });
});
