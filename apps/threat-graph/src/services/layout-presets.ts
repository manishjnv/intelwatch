import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type { CreateLayoutInput, LayoutPreset, LayoutListResponse } from '../schemas/operations.js';

/**
 * Layout Presets Service — #19.
 *
 * In-memory CRUD store for graph visualization layout configurations.
 * Frontend is FROZEN — this is a backend-only storage API.
 * Follows DECISION-013 pattern: in-memory for Phase 4, migrate to
 * Redis/PostgreSQL for horizontal scaling.
 */
export class LayoutPresetsService {
  private readonly presets = new Map<string, LayoutPreset>();
  private readonly maxPerTenant: number;

  constructor(maxPerTenant = 50) {
    this.maxPerTenant = maxPerTenant;
  }

  /** Creates a new layout preset. */
  create(tenantId: string, userId: string, input: CreateLayoutInput): LayoutPreset {
    const tenantPresets = this.listForTenant(tenantId);
    if (tenantPresets.length >= this.maxPerTenant) {
      throw new AppError(400,
        `Maximum ${this.maxPerTenant} presets per tenant reached`,
        'MAX_PRESETS_REACHED',
      );
    }

    const now = new Date().toISOString();
    const preset: LayoutPreset = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      description: input.description ?? '',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      config: input.config,
    };

    this.presets.set(preset.id, preset);
    return preset;
  }

  /** Lists all presets for a tenant, sorted by updatedAt desc. */
  list(tenantId: string): LayoutListResponse {
    const tenantPresets = this.listForTenant(tenantId);
    tenantPresets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { presets: tenantPresets, total: tenantPresets.length };
  }

  /** Gets a specific preset by ID. */
  getById(tenantId: string, presetId: string): LayoutPreset | null {
    const preset = this.presets.get(presetId);
    if (!preset || preset.tenantId !== tenantId) return null;
    return preset;
  }

  /** Deletes a preset by ID. Returns true if deleted. */
  delete(tenantId: string, presetId: string): boolean {
    const preset = this.presets.get(presetId);
    if (!preset || preset.tenantId !== tenantId) return false;
    this.presets.delete(presetId);
    return true;
  }

  /** Returns count of presets for a tenant. */
  count(tenantId: string): number {
    return this.listForTenant(tenantId).length;
  }

  /** Clears all presets. Used in testing. */
  clear(tenantId?: string): void {
    if (tenantId) {
      for (const [id, preset] of this.presets) {
        if (preset.tenantId === tenantId) this.presets.delete(id);
      }
    } else {
      this.presets.clear();
    }
  }

  /** Internal: get all presets for a tenant. */
  private listForTenant(tenantId: string): LayoutPreset[] {
    return Array.from(this.presets.values()).filter((p) => p.tenantId === tenantId);
  }
}
