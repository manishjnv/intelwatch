import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import {
  PLATFORM_MODULES,
  MODULE_DEPENDENCIES,
  type SetToggleInput,
  type PlatformModule,
} from '../schemas/customization.js';
import type { AuditTrail } from './audit-trail.js';
import type { ConfigVersioning } from './config-versioning.js';
import type { ValidationEngine } from './validation-engine.js';

export interface ModuleToggle {
  id: string;
  tenantId: string;
  module: PlatformModule;
  enabled: boolean;
  featureFlags: Record<string, boolean>;
  updatedAt: string;
  updatedBy: string;
}

export class ModuleToggleStore {
  /** tenantId:module → toggle record */
  private toggles = new Map<string, ModuleToggle>();

  constructor(
    private validationEngine: ValidationEngine,
    private auditTrail: AuditTrail,
    private versioning: ConfigVersioning,
  ) {}

  private key(tenantId: string, module: string): string {
    return `${tenantId}:${module}`;
  }

  private ensureDefaults(tenantId: string): void {
    for (const mod of PLATFORM_MODULES) {
      const k = this.key(tenantId, mod);
      if (!this.toggles.has(k)) {
        this.toggles.set(k, {
          id: randomUUID(),
          tenantId,
          module: mod,
          enabled: true,
          featureFlags: {},
          updatedAt: new Date().toISOString(),
          updatedBy: 'system',
        });
      }
    }
  }

  listToggles(tenantId: string): ModuleToggle[] {
    this.ensureDefaults(tenantId);
    return Array.from(this.toggles.values())
      .filter((t) => t.tenantId === tenantId)
      .map((t) => ({ ...t }));
  }

  getToggle(tenantId: string, module: string): ModuleToggle {
    this.ensureDefaults(tenantId);
    const t = this.toggles.get(this.key(tenantId, module));
    if (!t) throw new AppError(404, `Module '${module}' not found`, 'MODULE_NOT_FOUND');
    return { ...t };
  }

  setToggle(
    tenantId: string,
    module: string,
    input: SetToggleInput,
    userId: string,
  ): ModuleToggle {
    this.ensureDefaults(tenantId);
    const k = this.key(tenantId, module);
    const existing = this.toggles.get(k);
    if (!existing) throw new AppError(404, `Module '${module}' not found`, 'MODULE_NOT_FOUND');

    // Validate dependencies
    const proposed = this.listToggles(tenantId).map((t) =>
      t.module === module ? { name: t.module, enabled: input.enabled } : { name: t.module, enabled: t.enabled },
    );
    const result = this.validationEngine.validateModuleDependencies(proposed);
    if (!result.valid) {
      throw new AppError(400, result.errors.join('; '), 'MODULE_DEPENDENCY_VIOLATION');
    }

    const before = { ...existing };
    const now = new Date().toISOString();

    existing.enabled = input.enabled;
    if (input.featureFlags) {
      existing.featureFlags = { ...existing.featureFlags, ...input.featureFlags };
    }
    existing.updatedAt = now;
    existing.updatedBy = userId;

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'modules',
      action: input.enabled ? 'module.enabled' : 'module.disabled',
      before: before as unknown as Record<string, unknown>,
      after: existing as unknown as Record<string, unknown>,
    });

    this.versioning.snapshot(
      tenantId,
      'modules',
      this.getExportData(tenantId),
      userId,
      `${input.enabled ? 'Enabled' : 'Disabled'} ${module}`,
    );

    return { ...existing };
  }

  bulkUpdate(
    tenantId: string,
    modules: Array<{ name: PlatformModule; enabled: boolean }>,
    userId: string,
  ): ModuleToggle[] {
    this.ensureDefaults(tenantId);

    const result = this.validationEngine.validateModuleDependencies(modules);
    if (!result.valid) {
      throw new AppError(400, result.errors.join('; '), 'MODULE_DEPENDENCY_VIOLATION');
    }

    const before = this.getExportData(tenantId);
    const now = new Date().toISOString();
    const updated: ModuleToggle[] = [];

    for (const { name, enabled } of modules) {
      const k = this.key(tenantId, name);
      const toggle = this.toggles.get(k);
      if (toggle) {
        toggle.enabled = enabled;
        toggle.updatedAt = now;
        toggle.updatedBy = userId;
        updated.push({ ...toggle });
      }
    }

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'modules',
      action: 'modules.bulk_update',
      before,
      after: this.getExportData(tenantId),
    });

    this.versioning.snapshot(tenantId, 'modules', this.getExportData(tenantId), userId, 'Bulk update');

    return updated;
  }

  getDependencyGraph(): Record<string, readonly string[]> {
    return { ...MODULE_DEPENDENCIES };
  }

  validateConfiguration(
    toggles: Array<{ name: string; enabled: boolean }>,
  ): { valid: boolean; errors: string[] } {
    return this.validationEngine.validateModuleDependencies(toggles);
  }

  setFeatureFlag(
    tenantId: string,
    module: string,
    flag: string,
    enabled: boolean,
    userId: string,
  ): ModuleToggle {
    this.ensureDefaults(tenantId);
    const k = this.key(tenantId, module);
    const toggle = this.toggles.get(k);
    if (!toggle) throw new AppError(404, `Module '${module}' not found`, 'MODULE_NOT_FOUND');

    const before = { ...toggle, featureFlags: { ...toggle.featureFlags } };
    toggle.featureFlags[flag] = enabled;
    toggle.updatedAt = new Date().toISOString();
    toggle.updatedBy = userId;

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'modules',
      action: `feature_flag.${enabled ? 'enabled' : 'disabled'}`,
      before: before as unknown as Record<string, unknown>,
      after: toggle as unknown as Record<string, unknown>,
    });

    return { ...toggle };
  }

  getExportData(tenantId: string): Record<string, unknown> {
    const toggles = this.listToggles(tenantId);
    const data: Record<string, unknown> = {};
    for (const t of toggles) {
      data[t.module] = { enabled: t.enabled, featureFlags: t.featureFlags };
    }
    return data;
  }

  importData(tenantId: string, data: Record<string, unknown>, userId: string): void {
    this.ensureDefaults(tenantId);
    const now = new Date().toISOString();
    for (const [module, config] of Object.entries(data)) {
      const k = this.key(tenantId, module);
      const toggle = this.toggles.get(k);
      if (toggle && typeof config === 'object' && config !== null) {
        const c = config as Record<string, unknown>;
        if (typeof c.enabled === 'boolean') toggle.enabled = c.enabled;
        if (c.featureFlags && typeof c.featureFlags === 'object') {
          toggle.featureFlags = c.featureFlags as Record<string, boolean>;
        }
        toggle.updatedAt = now;
        toggle.updatedBy = userId;
      }
    }
  }
}
