import { MODULE_DEPENDENCIES, PLATFORM_MODULES } from '../schemas/customization.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ValidationEngine {
  validateModuleDependencies(
    toggles: Array<{ name: string; enabled: boolean }>,
  ): ValidationResult {
    const errors: string[] = [];
    const stateMap = new Map<string, boolean>();

    // Build full state: start with all enabled, then apply proposed changes
    for (const m of PLATFORM_MODULES) {
      stateMap.set(m, true);
    }
    for (const t of toggles) {
      stateMap.set(t.name, t.enabled);
    }

    // Check that all deps of enabled modules are also enabled
    for (const t of toggles) {
      if (t.enabled) {
        const deps = MODULE_DEPENDENCIES[t.name] ?? [];
        for (const dep of deps) {
          if (!stateMap.get(dep)) {
            errors.push(
              `Cannot enable '${t.name}': depends on '${dep}' which is disabled`,
            );
          }
        }
      }
    }

    // Check that disabling a module doesn't break dependents
    for (const t of toggles) {
      if (!t.enabled) {
        for (const [modName, deps] of Object.entries(MODULE_DEPENDENCIES)) {
          if (deps.includes(t.name) && stateMap.get(modName)) {
            errors.push(
              `Cannot disable '${t.name}': required by '${modName}' which is enabled`,
            );
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  validateWeightSum(weights: Record<string, number>, expectedSum: number = 1.0): ValidationResult {
    const errors: string[] = [];
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);

    if (Math.abs(sum - expectedSum) >= 0.001) {
      errors.push(`Weights sum to ${sum.toFixed(4)}, expected ${expectedSum}`);
    }

    for (const [key, val] of Object.entries(weights)) {
      if (val < 0 || val > 1) {
        errors.push(`Weight '${key}' is ${val}, must be between 0 and 1`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  validateDecayRate(rate: number): ValidationResult {
    const errors: string[] = [];
    if (rate < 0 || rate > 1) {
      errors.push(`Decay rate ${rate} is out of range [0, 1]`);
    }
    return { valid: errors.length === 0, errors };
  }

  validateBudget(daily: number, monthly: number): ValidationResult {
    const errors: string[] = [];
    if (daily > monthly) {
      errors.push('Daily token limit cannot exceed monthly limit');
    }
    if (daily < 0) errors.push('Daily token limit cannot be negative');
    if (monthly < 0) errors.push('Monthly token limit cannot be negative');
    return { valid: errors.length === 0, errors };
  }

  validateQuietHours(start: string, end: string): ValidationResult {
    const errors: string[] = [];
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(start)) errors.push(`Invalid start time: ${start}`);
    if (!timeRegex.test(end)) errors.push(`Invalid end time: ${end}`);
    return { valid: errors.length === 0, errors };
  }
}
