import {
  PLATFORM_MODULES,
  MODULE_DEPENDENCIES,
  type PlatformModule,
  type ModuleReadiness,
} from '../schemas/onboarding.js';

/** Default enabled modules for new tenants. */
const DEFAULT_ENABLED: PlatformModule[] = [
  'ingestion',
  'normalization',
  'ai-enrichment',
  'ioc-intelligence',
  'vulnerability-intel',
];

/**
 * Checks which modules are enabled, configured, and healthy.
 * Uses in-memory state (DECISION-013). In production, would query
 * customization-service and each module's health endpoint.
 */
export class ModuleReadinessChecker {
  /** tenantId → set of enabled modules */
  private enabledModules = new Map<string, Set<PlatformModule>>();
  /** tenantId → set of configured modules (had their setup completed) */
  private configuredModules = new Map<string, Set<PlatformModule>>();

  /** Get readiness for all modules. */
  checkAll(tenantId: string): ModuleReadiness[] {
    this.ensureDefaults(tenantId);
    return PLATFORM_MODULES.map((mod) => this.checkModule(tenantId, mod));
  }

  /** Check a single module's readiness. */
  checkModule(tenantId: string, module: PlatformModule): ModuleReadiness {
    this.ensureDefaults(tenantId);
    const enabled = this.enabledModules.get(tenantId)!;
    const configured = this.configuredModules.get(tenantId)!;
    const deps = MODULE_DEPENDENCIES[module] ?? [];
    const missingDeps = deps.filter((d) => !enabled.has(d as PlatformModule));

    let status: ModuleReadiness['status'];
    if (!enabled.has(module)) {
      status = 'disabled';
    } else if (missingDeps.length > 0) {
      status = 'needs_deps';
    } else if (!configured.has(module)) {
      status = 'needs_config';
    } else {
      status = 'ready';
    }

    return {
      module,
      enabled: enabled.has(module),
      healthy: enabled.has(module) && missingDeps.length === 0,
      configured: configured.has(module),
      dependencies: deps as string[],
      missingDeps,
      status,
    };
  }

  /** Enable a module for a tenant. */
  enableModule(tenantId: string, module: PlatformModule): ModuleReadiness {
    this.ensureDefaults(tenantId);
    this.enabledModules.get(tenantId)!.add(module);
    return this.checkModule(tenantId, module);
  }

  /** Disable a module for a tenant. */
  disableModule(tenantId: string, module: PlatformModule): ModuleReadiness {
    this.ensureDefaults(tenantId);
    this.enabledModules.get(tenantId)!.delete(module);
    return this.checkModule(tenantId, module);
  }

  /** Mark a module as configured. */
  markConfigured(tenantId: string, module: PlatformModule): void {
    this.ensureDefaults(tenantId);
    this.configuredModules.get(tenantId)!.add(module);
  }

  /** Get count of enabled modules. */
  getEnabledCount(tenantId: string): number {
    this.ensureDefaults(tenantId);
    return this.enabledModules.get(tenantId)!.size;
  }

  /** Get modules that are ready. */
  getReadyModules(tenantId: string): PlatformModule[] {
    return this.checkAll(tenantId)
      .filter((m) => m.status === 'ready')
      .map((m) => m.module);
  }

  /** Validate module dependencies before enabling. */
  validateDependencies(tenantId: string, module: PlatformModule): { valid: boolean; missing: string[] } {
    this.ensureDefaults(tenantId);
    const enabled = this.enabledModules.get(tenantId)!;
    const deps = MODULE_DEPENDENCIES[module] ?? [];
    const missing = deps.filter((d) => !enabled.has(d as PlatformModule));
    return { valid: missing.length === 0, missing };
  }

  // ─── Private ──────────────────────────────────────────

  private ensureDefaults(tenantId: string): void {
    if (!this.enabledModules.has(tenantId)) {
      this.enabledModules.set(tenantId, new Set(DEFAULT_ENABLED));
    }
    if (!this.configuredModules.has(tenantId)) {
      // Default modules are considered configured
      this.configuredModules.set(tenantId, new Set(DEFAULT_ENABLED));
    }
  }
}
