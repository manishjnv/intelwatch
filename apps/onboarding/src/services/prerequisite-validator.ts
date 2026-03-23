import {
  MODULE_DEPENDENCIES,
  PLATFORM_MODULES,
  type PlatformModule,
} from '../schemas/onboarding.js';
import type { ModuleReadinessChecker } from './module-readiness.js';

/** Prerequisite rule: what must be true before a module can be enabled. */
export interface PrerequisiteRule {
  module: PlatformModule;
  requiredModules: string[];
  requiredConfig: string[];
  description: string;
}

/**
 * P0 #6: Validates dependencies before enabling modules.
 * Extends basic MODULE_DEPENDENCIES with config-level prerequisites.
 */
export class PrerequisiteValidator {
  /** Additional config prereqs beyond module dependencies */
  private configPrereqs: Record<string, string[]> = {
    'ai-enrichment': ['api_keys_configured'],
    'enterprise-integration': ['siem_endpoint_configured'],
    'threat-graph': ['neo4j_connected'],
  };

  constructor(private moduleReadiness: ModuleReadinessChecker) {}

  /** Validate all prerequisites for enabling a module. */
  validate(tenantId: string, module: PlatformModule): {
    canEnable: boolean;
    blockers: string[];
    warnings: string[];
  } {
    const blockers: string[] = [];
    const warnings: string[] = [];

    // Check module dependency chain
    const depResult = this.moduleReadiness.validateDependencies(tenantId, module);
    if (!depResult.valid) {
      for (const missing of depResult.missing) {
        blockers.push(`Required module '${missing}' is not enabled`);
      }
    }

    // Check transitive dependencies (deps of deps)
    const transitive = this.getTransitiveDeps(module);
    const allReadiness = this.moduleReadiness.checkAll(tenantId);
    for (const dep of transitive) {
      const readiness = allReadiness.find((m) => m.module === dep);
      if (readiness && !readiness.enabled) {
        warnings.push(`Transitive dependency '${dep}' is not enabled`);
      }
    }

    // Check config prerequisites
    const configReqs = this.configPrereqs[module] ?? [];
    for (const req of configReqs) {
      // In production, would check actual config state
      // For Phase 6, treat as warnings not blockers
      warnings.push(`Configuration '${req}' recommended for ${module}`);
    }

    return {
      canEnable: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  /** Get all prerequisite rules. */
  getRules(): PrerequisiteRule[] {
    return PLATFORM_MODULES.map((mod) => ({
      module: mod,
      requiredModules: (MODULE_DEPENDENCIES[mod] ?? []) as string[],
      requiredConfig: this.configPrereqs[mod] ?? [],
      description: `Prerequisites for ${mod}`,
    }));
  }

  /** Try to enable a module with prerequisite validation. */
  enableWithValidation(tenantId: string, module: PlatformModule): {
    enabled: boolean;
    blockers: string[];
    warnings: string[];
  } {
    const result = this.validate(tenantId, module);
    if (!result.canEnable) {
      return { enabled: false, blockers: result.blockers, warnings: result.warnings };
    }
    this.moduleReadiness.enableModule(tenantId, module);
    return { enabled: true, blockers: [], warnings: result.warnings };
  }

  /** Get dependency chain (ordered: enable these first). */
  getDependencyChain(module: PlatformModule): PlatformModule[] {
    const chain: PlatformModule[] = [];
    const visited = new Set<string>();
    this.buildChain(module, chain, visited);
    return chain;
  }

  // ─── Private ──────────────────────────────────────────

  private getTransitiveDeps(module: string, visited = new Set<string>()): string[] {
    if (visited.has(module)) return [];
    visited.add(module);
    const directDeps = MODULE_DEPENDENCIES[module] ?? [];
    const result: string[] = [];
    for (const dep of directDeps) {
      result.push(dep);
      result.push(...this.getTransitiveDeps(dep, visited));
    }
    return [...new Set(result)];
  }

  private buildChain(module: string, chain: PlatformModule[], visited: Set<string>): void {
    if (visited.has(module)) return;
    visited.add(module);
    const deps = MODULE_DEPENDENCIES[module] ?? [];
    for (const dep of deps) {
      this.buildChain(dep, chain, visited);
    }
    if (PLATFORM_MODULES.includes(module as PlatformModule)) {
      chain.push(module as PlatformModule);
    }
  }
}
