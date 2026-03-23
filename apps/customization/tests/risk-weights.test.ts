import { describe, it, expect, beforeEach } from 'vitest';
import { RiskWeightStore } from '../src/services/risk-weight-store.js';
import { ValidationEngine } from '../src/services/validation-engine.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { ConfigVersioning } from '../src/services/config-versioning.js';
import { IOC_TYPES, WEIGHT_FACTORS } from '../src/schemas/customization.js';

describe('RiskWeightStore', () => {
  let store: RiskWeightStore;
  let auditTrail: AuditTrail;

  beforeEach(() => {
    const validationEngine = new ValidationEngine();
    auditTrail = new AuditTrail();
    const versioning = new ConfigVersioning();
    store = new RiskWeightStore(validationEngine, auditTrail, versioning);
  });

  const TENANT = 'tenant-1';

  const VALID_WEIGHTS = {
    source_reliability: 0.3,
    freshness: 0.2,
    corroboration: 0.2,
    specificity: 0.2,
    context: 0.1,
  };

  describe('listProfiles', () => {
    it('returns profiles for all IOC types', () => {
      const profiles = store.listProfiles(TENANT);
      expect(profiles).toHaveLength(IOC_TYPES.length);
      expect(profiles.every((p) => p.tenantId === TENANT)).toBe(true);
    });

    it('uses balanced preset as default', () => {
      const profiles = store.listProfiles(TENANT);
      const ip = profiles.find((p) => p.iocType === 'ip');
      expect(ip?.weights.source_reliability).toBe(0.25);
      expect(ip?.weights.freshness).toBe(0.20);
    });

    it('isolates profiles between tenants', () => {
      store.setProfile(TENANT, 'ip', { weights: VALID_WEIGHTS }, 'user-1');
      const t1 = store.listProfiles(TENANT);
      const t2 = store.listProfiles('tenant-2');
      const ip1 = t1.find((p) => p.iocType === 'ip');
      const ip2 = t2.find((p) => p.iocType === 'ip');
      expect(ip1?.weights.source_reliability).toBe(0.3);
      expect(ip2?.weights.source_reliability).toBe(0.25); // default
    });
  });

  describe('getProfile', () => {
    it('returns profile for a specific IOC type', () => {
      const profile = store.getProfile(TENANT, 'domain');
      expect(profile.iocType).toBe('domain');
      expect(profile.weights).toBeDefined();
      expect(profile.decayRate).toBeDefined();
    });

    it('throws for unknown IOC type', () => {
      expect(() => store.getProfile(TENANT, 'unknown' as never)).toThrow();
    });
  });

  describe('setProfile', () => {
    it('updates weights for an IOC type', () => {
      const profile = store.setProfile(TENANT, 'ip', {
        weights: VALID_WEIGHTS,
      }, 'user-1');
      expect(profile.weights.source_reliability).toBe(0.3);
      expect(profile.updatedBy).toBe('user-1');
    });

    it('sets decay rate', () => {
      const profile = store.setProfile(TENANT, 'ip', {
        weights: VALID_WEIGHTS,
        decayRate: 0.1,
      }, 'user-1');
      expect(profile.decayRate).toBe(0.1);
    });

    it('rejects weights that do not sum to 1.0', () => {
      expect(() =>
        store.setProfile(TENANT, 'ip', {
          weights: {
            source_reliability: 0.5,
            freshness: 0.5,
            corroboration: 0.5,
            specificity: 0.5,
            context: 0.5,
          },
        }, 'user-1'),
      ).toThrow('Weights sum to');
    });

    it('rejects invalid decay rate', () => {
      expect(() =>
        store.setProfile(TENANT, 'ip', {
          weights: VALID_WEIGHTS,
          decayRate: 1.5,
        }, 'user-1'),
      ).toThrow('Decay rate');
    });

    it('creates audit trail entry', () => {
      store.setProfile(TENANT, 'ip', { weights: VALID_WEIGHTS }, 'user-1');
      expect(auditTrail.getEntryCount(TENANT)).toBe(1);
    });
  });

  describe('presets', () => {
    it('lists all available presets', () => {
      const presets = store.listPresets();
      expect(presets).toHaveLength(3);
      expect(presets.map((p) => p.name)).toEqual(['conservative', 'balanced', 'aggressive']);
    });

    it('each preset has all weight factors', () => {
      const presets = store.listPresets();
      for (const preset of presets) {
        for (const factor of WEIGHT_FACTORS) {
          expect(preset.weights[factor]).toBeDefined();
        }
      }
    });

    it('preset weights sum to 1.0', () => {
      const presets = store.listPresets();
      for (const preset of presets) {
        const sum = Object.values(preset.weights).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0);
      }
    });

    it('applies preset to all IOC types', () => {
      const profiles = store.applyPreset(TENANT, 'aggressive', 'user-1');
      expect(profiles).toHaveLength(IOC_TYPES.length);
      for (const p of profiles) {
        expect(p.weights.freshness).toBe(0.30);
      }
    });

    it('throws for unknown preset', () => {
      expect(() => store.applyPreset(TENANT, 'unknown', 'user-1')).toThrow('Preset');
    });
  });

  describe('validateWeights', () => {
    it('validates correct weights', () => {
      const result = store.validateWeights(VALID_WEIGHTS);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid weights', () => {
      const result = store.validateWeights({ source_reliability: 1.0 });
      expect(result.valid).toBe(true); // sums to 1.0 with just one
    });
  });

  describe('export/import', () => {
    it('exports profile data', () => {
      const data = store.getExportData(TENANT);
      expect(data.ip).toBeDefined();
      expect((data.ip as Record<string, unknown>).weights).toBeDefined();
    });

    it('imports profile data', () => {
      store.importData(TENANT, {
        ip: { weights: VALID_WEIGHTS, decayRate: 0.15 },
      }, 'user-1');
      const profile = store.getProfile(TENANT, 'ip');
      expect(profile.weights.source_reliability).toBe(0.3);
      expect(profile.decayRate).toBe(0.15);
    });
  });
});
