import { AppError } from '@etip/shared-utils';
import type { DataSourceRecord } from '../schemas/onboarding.js';
import type { WizardStore } from './wizard-store.js';

/** Test result for a single integration. */
export interface IntegrationTestResult {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  success: boolean;
  latencyMs: number;
  steps: IntegrationTestStep[];
  testedAt: string;
}

export interface IntegrationTestStep {
  name: string;
  passed: boolean;
  durationMs: number;
  message: string;
}

/**
 * P0 #8: Auto-tests SIEM/webhook/feed connections during setup.
 * Runs a multi-step validation: DNS resolve → TCP connect → auth → data pull.
 * Phase 6: simulated (no actual network calls from this service).
 */
export class IntegrationTester {
  /** tenantId:sourceId → last test result */
  private results = new Map<string, IntegrationTestResult>();

  constructor(private wizardStore: WizardStore) {}

  /** Run full integration test for a data source. */
  async testSource(tenantId: string, sourceId: string): Promise<IntegrationTestResult> {
    const wizard = this.wizardStore.get(tenantId);
    const source = wizard.dataSources.find((s) => s.id === sourceId);
    if (!source) {
      throw new AppError(404, `Data source '${sourceId}' not found`, 'DATA_SOURCE_NOT_FOUND');
    }

    const steps = await this.runTestSteps(source);
    const allPassed = steps.every((s) => s.passed);
    const totalLatency = steps.reduce((sum, s) => sum + s.durationMs, 0);

    // Update source status based on test results
    if (allPassed) {
      this.wizardStore.updateDataSourceStatus(tenantId, sourceId, 'connected');
    } else {
      const failedStep = steps.find((s) => !s.passed);
      this.wizardStore.updateDataSourceStatus(
        tenantId,
        sourceId,
        'failed',
        failedStep?.message ?? 'Integration test failed',
      );
    }

    const result: IntegrationTestResult = {
      sourceId,
      sourceName: source.name,
      sourceType: source.type,
      success: allPassed,
      latencyMs: totalLatency,
      steps,
      testedAt: new Date().toISOString(),
    };

    this.results.set(`${tenantId}:${sourceId}`, result);
    return result;
  }

  /** Get last test result for a source. */
  getLastResult(tenantId: string, sourceId: string): IntegrationTestResult | null {
    return this.results.get(`${tenantId}:${sourceId}`) ?? null;
  }

  /** Run test for all sources of a tenant. */
  async testAll(tenantId: string): Promise<IntegrationTestResult[]> {
    const wizard = this.wizardStore.get(tenantId);
    const results: IntegrationTestResult[] = [];
    for (const source of wizard.dataSources) {
      const result = await this.testSource(tenantId, source.id);
      results.push(result);
    }
    return results;
  }

  // ─── Private ──────────────────────────────────────────

  /** Run multi-step test sequence (simulated for Phase 6). */
  private async runTestSteps(source: DataSourceRecord): Promise<IntegrationTestStep[]> {
    const steps: IntegrationTestStep[] = [];

    // Step 1: DNS Resolution
    steps.push({
      name: 'dns_resolve',
      passed: source.url !== null,
      durationMs: 12,
      message: source.url ? `Resolved ${new URL(source.url).hostname}` : 'No URL configured',
    });

    // Step 2: TCP Connection
    steps.push({
      name: 'tcp_connect',
      passed: source.url !== null,
      durationMs: 25,
      message: source.url ? `Connected to ${new URL(source.url).host}` : 'Skipped (no URL)',
    });

    // Step 3: Authentication
    const authRequired = ['stix_taxii', 'rest_api', 'siem_splunk', 'siem_sentinel', 'siem_elastic'];
    if (authRequired.includes(source.type)) {
      steps.push({
        name: 'authentication',
        passed: true, // Simulated success
        durationMs: 45,
        message: 'Authentication successful',
      });
    }

    // Step 4: Data pull
    steps.push({
      name: 'data_pull',
      passed: true, // Simulated success
      durationMs: 80,
      message: `Successfully retrieved sample data from ${source.type}`,
    });

    return steps;
  }
}
