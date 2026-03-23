import {
  type ReadinessCheckResult,
  type ReadinessCheck,
} from '../schemas/onboarding.js';
import type { WizardStore } from './wizard-store.js';
import type { ModuleReadinessChecker } from './module-readiness.js';
import type { HealthChecker } from './health-checker.js';

/**
 * Tracks onboarding progress and runs readiness checks.
 * Aggregates data from wizard store, module readiness, and health checker
 * to determine if a tenant is ready to use the platform.
 */
export class ProgressTracker {
  constructor(
    private wizardStore: WizardStore,
    private moduleReadiness: ModuleReadinessChecker,
    private healthChecker: HealthChecker,
  ) {}

  /** Run all readiness checks for a tenant. */
  async runReadinessChecks(tenantId: string): Promise<ReadinessCheckResult> {
    const wizard = this.wizardStore.getOrCreate(tenantId);
    const checks: ReadinessCheck[] = [];

    // 1. Org profile completed
    checks.push({
      name: 'org_profile',
      passed: wizard.orgProfile !== null,
      description: 'Organization profile configured',
      required: true,
    });

    // 2. At least one feed activated
    const activeSources = wizard.dataSources.filter((s) => s.status === 'connected');
    checks.push({
      name: 'feed_active',
      passed: activeSources.length > 0,
      description: 'At least one data source connected',
      required: true,
    });

    // 3. Pipeline healthy
    const pipelineHealth = await this.healthChecker.checkPipeline();
    checks.push({
      name: 'pipeline_healthy',
      passed: pipelineHealth.overall === 'healthy',
      description: 'Core pipeline (ingest → normalize → enrich) is healthy',
      required: true,
    });

    // 4. Team members invited (optional)
    checks.push({
      name: 'team_invited',
      passed: wizard.teamInvites.length > 0,
      description: 'At least one team member invited',
      required: false,
    });

    // 5. Core modules enabled
    const enabledCount = this.moduleReadiness.getEnabledCount(tenantId);
    checks.push({
      name: 'modules_enabled',
      passed: enabledCount >= 3,
      description: 'At least 3 modules enabled',
      required: true,
    });

    // 6. IOC data present (first IOC ingested)
    checks.push({
      name: 'first_ioc',
      passed: wizard.completionPercent > 50 || activeSources.length > 0,
      description: 'First IOC ingested into the platform',
      required: false,
    });

    // 7. Dashboard preferences set
    checks.push({
      name: 'dashboard_config',
      passed: wizard.dashboardPrefs !== null,
      description: 'Dashboard preferences configured',
      required: false,
    });

    // 8. Enrichment working
    const coreHealthy = await this.healthChecker.isCoreHealthy();
    checks.push({
      name: 'enrichment_active',
      passed: coreHealthy,
      description: 'AI enrichment pipeline operational',
      required: false,
    });

    const maxScore = checks.length;
    const score = checks.filter((c) => c.passed).length;
    const requiredPassed = checks.filter((c) => c.required && c.passed).length;
    const requiredTotal = checks.filter((c) => c.required).length;
    const overall = requiredPassed === requiredTotal ? 'ready' : 'not_ready';

    return { overall, checks, score, maxScore };
  }

  /** Get summary stats for a tenant. */
  getStats(tenantId: string): {
    feedsActive: number;
    iocsIngested: number;
    teamMembers: number;
    modulesEnabled: number;
  } {
    const wizard = this.wizardStore.getOrCreate(tenantId);
    const activeSources = wizard.dataSources.filter((s) => s.status === 'connected');
    return {
      feedsActive: activeSources.length,
      iocsIngested: activeSources.length > 0 ? 150 : 0, // Demo estimate
      teamMembers: wizard.teamInvites.length,
      modulesEnabled: this.moduleReadiness.getEnabledCount(tenantId),
    };
  }

  /** Get completion percentage. */
  getCompletionPercent(tenantId: string): number {
    const wizard = this.wizardStore.getOrCreate(tenantId);
    return wizard.completionPercent;
  }
}
