import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import {
  IOC_TYPES,
  WEIGHT_FACTORS,
  WEIGHT_PRESETS,
  type IocType,
  type WeightFactor,
  type WeightPreset,
  type SetWeightInput,
} from '../schemas/customization.js';
import type { AuditTrail } from './audit-trail.js';
import type { ConfigVersioning } from './config-versioning.js';
import type { ValidationEngine } from './validation-engine.js';

export interface WeightProfile {
  id: string;
  tenantId: string;
  iocType: IocType;
  weights: Record<WeightFactor, number>;
  decayRate: number;
  updatedAt: string;
  updatedBy: string;
}

const PRESET_WEIGHTS: Record<WeightPreset, Record<WeightFactor, number>> = {
  conservative: {
    source_reliability: 0.35,
    freshness: 0.15,
    corroboration: 0.30,
    specificity: 0.10,
    context: 0.10,
  },
  balanced: {
    source_reliability: 0.25,
    freshness: 0.20,
    corroboration: 0.20,
    specificity: 0.20,
    context: 0.15,
  },
  aggressive: {
    source_reliability: 0.15,
    freshness: 0.30,
    corroboration: 0.15,
    specificity: 0.25,
    context: 0.15,
  },
};

const DEFAULT_DECAY_RATE = 0.05;

export class RiskWeightStore {
  private profiles = new Map<string, WeightProfile>();

  constructor(
    private validationEngine: ValidationEngine,
    private auditTrail: AuditTrail,
    private versioning: ConfigVersioning,
  ) {}

  private key(tenantId: string, iocType: string): string {
    return `${tenantId}:${iocType}`;
  }

  private ensureDefaults(tenantId: string): void {
    for (const iocType of IOC_TYPES) {
      const k = this.key(tenantId, iocType);
      if (!this.profiles.has(k)) {
        this.profiles.set(k, {
          id: randomUUID(),
          tenantId,
          iocType,
          weights: { ...PRESET_WEIGHTS.balanced },
          decayRate: DEFAULT_DECAY_RATE,
          updatedAt: new Date().toISOString(),
          updatedBy: 'system',
        });
      }
    }
  }

  listProfiles(tenantId: string): WeightProfile[] {
    this.ensureDefaults(tenantId);
    return Array.from(this.profiles.values())
      .filter((p) => p.tenantId === tenantId)
      .map((p) => ({ ...p, weights: { ...p.weights } }));
  }

  getProfile(tenantId: string, iocType: string): WeightProfile {
    this.ensureDefaults(tenantId);
    const p = this.profiles.get(this.key(tenantId, iocType));
    if (!p) throw new AppError(404, `IOC type '${iocType}' not found`, 'IOC_TYPE_NOT_FOUND');
    return { ...p, weights: { ...p.weights } };
  }

  setProfile(
    tenantId: string,
    iocType: string,
    input: SetWeightInput,
    userId: string,
  ): WeightProfile {
    this.ensureDefaults(tenantId);
    const k = this.key(tenantId, iocType);
    const existing = this.profiles.get(k);
    if (!existing) throw new AppError(404, `IOC type '${iocType}' not found`, 'IOC_TYPE_NOT_FOUND');

    // Validate weights
    const weightValidation = this.validationEngine.validateWeightSum(input.weights);
    if (!weightValidation.valid) {
      throw new AppError(400, weightValidation.errors.join('; '), 'INVALID_WEIGHTS');
    }

    if (input.decayRate !== undefined) {
      const decayValidation = this.validationEngine.validateDecayRate(input.decayRate);
      if (!decayValidation.valid) {
        throw new AppError(400, decayValidation.errors.join('; '), 'INVALID_DECAY_RATE');
      }
    }

    const before = { ...existing, weights: { ...existing.weights } };

    existing.weights = input.weights as Record<WeightFactor, number>;
    if (input.decayRate !== undefined) existing.decayRate = input.decayRate;
    existing.updatedAt = new Date().toISOString();
    existing.updatedBy = userId;

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'risk',
      action: 'weight_profile.updated',
      before: before as unknown as Record<string, unknown>,
      after: existing as unknown as Record<string, unknown>,
    });

    this.versioning.snapshot(
      tenantId, 'risk', this.getExportData(tenantId), userId,
      `Updated weights for ${iocType}`,
    );

    return { ...existing, weights: { ...existing.weights } };
  }

  listPresets(): Array<{ name: WeightPreset; weights: Record<WeightFactor, number> }> {
    return WEIGHT_PRESETS.map((name) => ({
      name,
      weights: { ...PRESET_WEIGHTS[name] },
    }));
  }

  applyPreset(
    tenantId: string,
    preset: string,
    userId: string,
  ): WeightProfile[] {
    if (!WEIGHT_PRESETS.includes(preset as WeightPreset)) {
      throw new AppError(404, `Preset '${preset}' not found`, 'INVALID_PRESET');
    }

    this.ensureDefaults(tenantId);
    const presetWeights = PRESET_WEIGHTS[preset as WeightPreset];
    const now = new Date().toISOString();
    const updated: WeightProfile[] = [];

    for (const iocType of IOC_TYPES) {
      const k = this.key(tenantId, iocType);
      const profile = this.profiles.get(k)!;
      profile.weights = { ...presetWeights };
      profile.updatedAt = now;
      profile.updatedBy = userId;
      updated.push({ ...profile, weights: { ...profile.weights } });
    }

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'risk',
      action: 'preset.applied',
      before: null,
      after: { preset },
    });

    this.versioning.snapshot(tenantId, 'risk', this.getExportData(tenantId), userId, `Applied preset: ${preset}`);

    return updated;
  }

  validateWeights(weights: Record<string, number>): { valid: boolean; errors: string[] } {
    return this.validationEngine.validateWeightSum(weights);
  }

  getExportData(tenantId: string): Record<string, unknown> {
    const profiles = this.listProfiles(tenantId);
    const data: Record<string, unknown> = {};
    for (const p of profiles) {
      data[p.iocType] = { weights: p.weights, decayRate: p.decayRate };
    }
    return data;
  }

  importData(tenantId: string, data: Record<string, unknown>, userId: string): void {
    this.ensureDefaults(tenantId);
    const now = new Date().toISOString();
    for (const [iocType, config] of Object.entries(data)) {
      const k = this.key(tenantId, iocType);
      const profile = this.profiles.get(k);
      if (profile && typeof config === 'object' && config !== null) {
        const c = config as Record<string, unknown>;
        if (c.weights && typeof c.weights === 'object') {
          profile.weights = c.weights as Record<WeightFactor, number>;
        }
        if (typeof c.decayRate === 'number') profile.decayRate = c.decayRate;
        profile.updatedAt = now;
        profile.updatedBy = userId;
      }
    }
  }
}
