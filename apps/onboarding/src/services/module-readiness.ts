import {
  PLATFORM_MODULES,
  MODULE_DEPENDENCIES,
  type PlatformModule,
  type ModuleReadiness,
} from '../schemas/onboarding.js';
import type { Redis } from 'ioredis';

/** Default enabled modules for new tenants. */
const DEFAULT_ENABLED: PlatformModule[] = [
  'ingestion',
  'normalization',
  'ai-enrichment',
  'ioc-intelligence',
  'vulnerability-intel',
];

const KEY_PREFIX = 'etip:';
const KEY_SUFFIX = ':modules';

function redisKey(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}${KEY_SUFFIX}`;
}

interface ModuleState {
  enabled: string[];
  configured: string[];
}

/**
 * Checks which modules are enabled, configured, and healthy.
 * Redis-backed (S159d) via the same client WizardStore uses; falls back to
 * in-memory Maps only when no Redis client is injected (test mode).
 */
export class ModuleReadinessChecker {
  /** tenantId → set of enabled modules (in-memory cache) */
  private enabledModules = new Map<string, Set<PlatformModule>>(); // memory-ok: cache — per-process copy of the tenant Redis key (Redis is the source of truth; memory-only when no Redis, i.e. tests)
  /** tenantId → set of configured modules (had their setup completed) */
  private configuredModules = new Map<string, Set<PlatformModule>>(); // memory-ok: cache — per-process copy of the tenant Redis key (Redis is the source of truth; memory-only when no Redis, i.e. tests)
  private redis: Redis | null;

  constructor(redis?: Redis | null) {
    this.redis = redis ?? null;
  }

  /** Get readiness for all modules. */
  async checkAll(tenantId: string): Promise<ModuleReadiness[]> {
    await this.ensureDefaults(tenantId);
    return PLATFORM_MODULES.map((mod) => this.checkModuleSync(tenantId, mod));
  }

  /** Check a single module's readiness. */
  async checkModule(tenantId: string, module: PlatformModule): Promise<ModuleReadiness> {
    await this.ensureDefaults(tenantId);
    return this.checkModuleSync(tenantId, module);
  }

  /** Synchronous readiness computation once Maps are hydrated. */
  private checkModuleSync(tenantId: string, module: PlatformModule): ModuleReadiness {
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
  async enableModule(tenantId: string, module: PlatformModule): Promise<ModuleReadiness> {
    await this.ensureDefaults(tenantId);
    this.enabledModules.get(tenantId)!.add(module);
    await this.persist(tenantId);
    return this.checkModuleSync(tenantId, module);
  }

  /** Disable a module for a tenant. */
  async disableModule(tenantId: string, module: PlatformModule): Promise<ModuleReadiness> {
    await this.ensureDefaults(tenantId);
    this.enabledModules.get(tenantId)!.delete(module);
    await this.persist(tenantId);
    return this.checkModuleSync(tenantId, module);
  }

  /** Mark a module as configured. */
  async markConfigured(tenantId: string, module: PlatformModule): Promise<void> {
    await this.ensureDefaults(tenantId);
    this.configuredModules.get(tenantId)!.add(module);
    await this.persist(tenantId);
  }

  /** Get count of enabled modules. */
  async getEnabledCount(tenantId: string): Promise<number> {
    await this.ensureDefaults(tenantId);
    return this.enabledModules.get(tenantId)!.size;
  }

  /** Get modules that are ready. */
  async getReadyModules(tenantId: string): Promise<PlatformModule[]> {
    const all = await this.checkAll(tenantId);
    return all.filter((m) => m.status === 'ready').map((m) => m.module);
  }

  /** Validate module dependencies before enabling. */
  async validateDependencies(tenantId: string, module: PlatformModule): Promise<{ valid: boolean; missing: string[] }> {
    await this.ensureDefaults(tenantId);
    const enabled = this.enabledModules.get(tenantId)!;
    const deps = MODULE_DEPENDENCIES[module] ?? [];
    const missing = deps.filter((d) => !enabled.has(d as PlatformModule));
    return { valid: missing.length === 0, missing };
  }

  // ─── Private ──────────────────────────────────────────

  /** Hydrate tenant state from cache, then Redis, then defaults (mirrors WizardStore). */
  private async ensureDefaults(tenantId: string): Promise<void> {
    if (this.enabledModules.has(tenantId)) return;

    if (this.redis) {
      const raw = await this.redis.get(redisKey(tenantId));
      if (raw) {
        const state = JSON.parse(raw) as ModuleState;
        this.enabledModules.set(tenantId, new Set(state.enabled as PlatformModule[]));
        this.configuredModules.set(tenantId, new Set(state.configured as PlatformModule[]));
        return;
      }
    }

    this.enabledModules.set(tenantId, new Set(DEFAULT_ENABLED));
    // Default modules are considered configured
    this.configuredModules.set(tenantId, new Set(DEFAULT_ENABLED));
    await this.persist(tenantId);
  }

  /** Persist current state to Redis (if available). */
  private async persist(tenantId: string): Promise<void> {
    if (!this.redis) return;
    const enabled = this.enabledModules.get(tenantId);
    const configured = this.configuredModules.get(tenantId);
    if (!enabled || !configured) return;
    const state: ModuleState = { enabled: [...enabled], configured: [...configured] };
    await this.redis.set(redisKey(tenantId), JSON.stringify(state));
  }
}
