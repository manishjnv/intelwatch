import { AppError } from '@etip/shared-utils';
import type { ConfigSection } from '../schemas/customization.js';
import { CONFIG_SECTIONS } from '../schemas/customization.js';

export interface ExportPayload {
  version: string;
  exportedAt: string;
  tenantId: string;
  sections: Record<string, unknown>;
}

export interface ImportResult {
  imported: string[];
  skipped: string[];
  errors: string[];
}

export type StoreGetter = (tenantId: string) => Record<string, unknown>;
export type StoreSetter = (tenantId: string, config: Record<string, unknown>, userId: string) => void;

export interface StoreAccessors {
  get: StoreGetter;
  set: StoreSetter;
}

export class ConfigPortability {
  private storeMap = new Map<string, StoreAccessors>();

  registerStore(section: ConfigSection, accessors: StoreAccessors): void {
    this.storeMap.set(section, accessors);
  }

  exportConfig(
    tenantId: string,
    sections?: string[],
  ): ExportPayload {
    const targetSections = sections && sections.length > 0
      ? sections
      : [...CONFIG_SECTIONS];

    const exported: Record<string, unknown> = {};

    for (const section of targetSections) {
      const accessors = this.storeMap.get(section);
      if (accessors) {
        exported[section] = accessors.get(tenantId);
      }
    }

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tenantId,
      sections: exported,
    };
  }

  importConfig(
    tenantId: string,
    payload: ExportPayload,
    merge: boolean,
    userId: string,
  ): ImportResult {
    const validation = this.validateImportPayload(payload);
    if (validation.errors.length > 0) {
      throw new AppError(400, 'Import validation failed', 'IMPORT_VALIDATION_FAILED', validation.errors);
    }

    const imported: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const [section, config] of Object.entries(payload.sections)) {
      const accessors = this.storeMap.get(section);
      if (!accessors) {
        skipped.push(section);
        continue;
      }

      try {
        if (merge) {
          const existing = accessors.get(tenantId);
          const merged = { ...existing, ...(config as Record<string, unknown>) };
          accessors.set(tenantId, merged, userId);
        } else {
          accessors.set(tenantId, config as Record<string, unknown>, userId);
        }
        imported.push(section);
      } catch (err) {
        errors.push(`${section}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { imported, skipped, errors };
  }

  validateImportPayload(payload: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!payload || typeof payload !== 'object') {
      errors.push('Payload must be an object');
      return { valid: false, errors };
    }

    const p = payload as Record<string, unknown>;

    if (!p.version || typeof p.version !== 'string') {
      errors.push('Missing or invalid version field');
    }

    if (!p.sections || typeof p.sections !== 'object') {
      errors.push('Missing or invalid sections field');
    } else {
      const sections = p.sections as Record<string, unknown>;
      for (const key of Object.keys(sections)) {
        if (!CONFIG_SECTIONS.includes(key as ConfigSection)) {
          errors.push(`Unknown section: ${key}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
