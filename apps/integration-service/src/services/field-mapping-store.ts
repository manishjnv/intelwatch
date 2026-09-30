import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type {
  FieldMappingPreset,
  CreateFieldMappingPresetInput,
  UpdateFieldMappingPresetInput,
  IntegrationType,
} from '../schemas/integration.js';
import type { DocRepo } from './doc-repo.js';
import { MemoryDocRepo } from './doc-repo.js';

/**
 * P1 #7: Store for reusable field mapping presets. Persists as
 * `field_mapping_preset` documents (Step 3 S157).
 */
export class FieldMappingStore {
  constructor(private readonly repo: DocRepo<FieldMappingPreset> = new MemoryDocRepo<FieldMappingPreset>()) {}

  /** Create a new field mapping preset. */
  async createPreset(tenantId: string, input: CreateFieldMappingPresetInput): Promise<FieldMappingPreset> {
    // Check for duplicate names within tenant + target type
    const existing = await this.findByName(tenantId, input.name, input.targetType);
    if (existing) {
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
    return this.repo.save(preset);
  }

  /** Get a preset by ID, filtered by tenant. */
  async getPreset(id: string, tenantId: string): Promise<FieldMappingPreset | undefined> {
    return (await this.repo.get(id, tenantId)) ?? undefined;
  }

  /** List presets for a tenant with optional type filter. */
  async listPresets(
    tenantId: string,
    opts: { targetType?: IntegrationType; page: number; limit: number },
  ): Promise<{ data: FieldMappingPreset[]; total: number }> {
    let items = await this.repo.list(tenantId);
    if (opts.targetType) {
      items = items.filter((p) => p.targetType === opts.targetType);
    }
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Update an existing preset. */
  async updatePreset(
    id: string,
    tenantId: string,
    input: UpdateFieldMappingPresetInput,
  ): Promise<FieldMappingPreset | undefined> {
    const existing = await this.getPreset(id, tenantId);
    if (!existing) return undefined;

    // Check name uniqueness if name is being changed
    if (input.name && input.name !== existing.name) {
      const targetType = input.targetType ?? existing.targetType;
      const dupe = await this.findByName(tenantId, input.name, targetType);
      if (dupe) {
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
    return this.repo.save(updated);
  }

  /** Delete a preset. */
  async deletePreset(id: string, tenantId: string): Promise<boolean> {
    return this.repo.delete(id, tenantId);
  }

  /** Find a preset by name + target type within a tenant. */
  private async findByName(
    tenantId: string,
    name: string,
    targetType: IntegrationType,
  ): Promise<FieldMappingPreset | undefined> {
    const items = await this.repo.list(tenantId);
    return items.find((p) => p.name === name && p.targetType === targetType);
  }
}
