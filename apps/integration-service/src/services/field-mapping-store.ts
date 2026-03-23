import { randomUUID } from 'crypto';
import type {
  FieldMappingPreset,
  CreateFieldMappingPresetInput,
  UpdateFieldMappingPresetInput,
  IntegrationType,
} from '../schemas/integration.js';

/**
 * P1 #7: In-memory store for reusable field mapping presets.
 * Allows users to create, manage, and apply mapping templates
 * across multiple integrations of the same type.
 */
export class FieldMappingStore {
  private presets = new Map<string, FieldMappingPreset>();

  /** Create a new field mapping preset. */
  createPreset(tenantId: string, input: CreateFieldMappingPresetInput): FieldMappingPreset {
    // Check for duplicate names within tenant + target type
    const existing = this.findByName(tenantId, input.name, input.targetType);
    if (existing) {
      const { AppError } = require('@etip/shared-utils');
      throw new AppError(409, `Preset "${input.name}" already exists for ${input.targetType}`, 'PRESET_DUPLICATE');
    }

    const now = new Date().toISOString();
    const preset: FieldMappingPreset = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      description: input.description ?? '',
      targetType: input.targetType,
      mappings: input.mappings,
      createdAt: now,
      updatedAt: now,
    };
    this.presets.set(preset.id, preset);
    return preset;
  }

  /** Get a preset by ID, filtered by tenant. */
  getPreset(id: string, tenantId: string): FieldMappingPreset | undefined {
    const preset = this.presets.get(id);
    if (!preset || preset.tenantId !== tenantId) return undefined;
    return preset;
  }

  /** List presets for a tenant with optional type filter. */
  listPresets(
    tenantId: string,
    opts: { targetType?: IntegrationType; page: number; limit: number },
  ): { data: FieldMappingPreset[]; total: number } {
    let items = Array.from(this.presets.values()).filter(
      (p) => p.tenantId === tenantId,
    );
    if (opts.targetType) {
      items = items.filter((p) => p.targetType === opts.targetType);
    }
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Update an existing preset. */
  updatePreset(
    id: string,
    tenantId: string,
    input: UpdateFieldMappingPresetInput,
  ): FieldMappingPreset | undefined {
    const existing = this.getPreset(id, tenantId);
    if (!existing) return undefined;

    // Check name uniqueness if name is being changed
    if (input.name && input.name !== existing.name) {
      const targetType = input.targetType ?? existing.targetType;
      const dupe = this.findByName(tenantId, input.name, targetType);
      if (dupe) {
        const { AppError } = require('@etip/shared-utils');
        throw new AppError(409, `Preset "${input.name}" already exists for ${targetType}`, 'PRESET_DUPLICATE');
      }
    }

    const updated: FieldMappingPreset = {
      ...existing,
      ...input,
      id: existing.id,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.presets.set(id, updated);
    return updated;
  }

  /** Delete a preset. */
  deletePreset(id: string, tenantId: string): boolean {
    const existing = this.getPreset(id, tenantId);
    if (!existing) return false;
    this.presets.delete(id);
    return true;
  }

  /** Find a preset by name + target type within a tenant. */
  private findByName(tenantId: string, name: string, targetType: IntegrationType): FieldMappingPreset | undefined {
    return Array.from(this.presets.values()).find(
      (p) => p.tenantId === tenantId && p.name === name && p.targetType === targetType,
    );
  }
}
