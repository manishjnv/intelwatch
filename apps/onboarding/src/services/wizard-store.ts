import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import {
  WIZARD_STEPS,
  type WizardStep,
  type StepStatus,
  type WizardState,
  type OrgProfileInput,
  type TeamInviteInput,
  type DashboardPreferenceInput,
  type DataSourceRecord,
} from '../schemas/onboarding.js';

/**
 * In-memory store for onboarding wizard state (DECISION-013 pattern).
 * One wizard state per tenant. State lost on restart — acceptable for Phase 6.
 */
export class WizardStore {
  /** tenantId → WizardState */
  private wizards = new Map<string, WizardState>();

  /** Get or create wizard state for a tenant. */
  getOrCreate(tenantId: string): WizardState {
    let wizard = this.wizards.get(tenantId);
    if (!wizard) {
      const now = new Date().toISOString();
      wizard = {
        id: randomUUID(),
        tenantId,
        currentStep: 'welcome',
        steps: this.initSteps(),
        completionPercent: 0,
        orgProfile: null,
        teamInvites: [],
        dataSources: [],
        dashboardPrefs: null,
        startedAt: now,
        updatedAt: now,
        completedAt: null,
      };
      this.wizards.set(tenantId, wizard);
    }
    return { ...wizard, steps: { ...wizard.steps }, dataSources: [...wizard.dataSources] };
  }

  /** Get wizard state (throws if not found). */
  get(tenantId: string): WizardState {
    const wizard = this.wizards.get(tenantId);
    if (!wizard) {
      throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
    }
    return { ...wizard, steps: { ...wizard.steps }, dataSources: [...wizard.dataSources] };
  }

  /** Complete a step and advance. */
  completeStep(tenantId: string, step: WizardStep, data?: Record<string, unknown>): WizardState {
    const wizard = this.wizards.get(tenantId);
    if (!wizard) {
      throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
    }

    wizard.steps[step] = 'completed';
    wizard.updatedAt = new Date().toISOString();

    // Apply step-specific data
    if (step === 'welcome' && data) {
      wizard.orgProfile = data as unknown as OrgProfileInput;
    }
    if (step === 'dashboard_config' && data) {
      wizard.dashboardPrefs = data as unknown as DashboardPreferenceInput;
    }

    // Advance to next incomplete step
    wizard.currentStep = this.findNextStep(wizard);
    wizard.completionPercent = this.calcCompletion(wizard);

    // Check if all done
    if (wizard.completionPercent === 100) {
      wizard.completedAt = wizard.updatedAt;
    }

    return { ...wizard, steps: { ...wizard.steps }, dataSources: [...wizard.dataSources] };
  }

  /** Skip a step. */
  skipStep(tenantId: string, step: WizardStep): WizardState {
    const wizard = this.wizards.get(tenantId);
    if (!wizard) {
      throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
    }

    // Cannot skip required steps
    const required: WizardStep[] = ['welcome', 'org_profile', 'readiness_check', 'launch'];
    if (required.includes(step)) {
      throw new AppError(400, `Step '${step}' cannot be skipped`, 'STEP_NOT_SKIPPABLE');
    }

    wizard.steps[step] = 'skipped';
    wizard.updatedAt = new Date().toISOString();
    wizard.currentStep = this.findNextStep(wizard);
    wizard.completionPercent = this.calcCompletion(wizard);

    if (wizard.completionPercent === 100) {
      wizard.completedAt = wizard.updatedAt;
    }

    return { ...wizard, steps: { ...wizard.steps }, dataSources: [...wizard.dataSources] };
  }

  /** Set org profile data. */
  setOrgProfile(tenantId: string, profile: OrgProfileInput): WizardState {
    const wizard = this.wizards.get(tenantId);
    if (!wizard) {
      throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
    }
    wizard.orgProfile = profile;
    wizard.updatedAt = new Date().toISOString();
    return { ...wizard, steps: { ...wizard.steps }, dataSources: [...wizard.dataSources] };
  }

  /** Add team invites. */
  addTeamInvites(tenantId: string, invites: TeamInviteInput['invites']): WizardState {
    const wizard = this.wizards.get(tenantId);
    if (!wizard) {
      throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
    }
    wizard.teamInvites = [...wizard.teamInvites, ...invites];
    wizard.updatedAt = new Date().toISOString();
    return { ...wizard, steps: { ...wizard.steps }, dataSources: [...wizard.dataSources] };
  }

  /** Add a data source record. */
  addDataSource(tenantId: string, source: DataSourceRecord): WizardState {
    const wizard = this.wizards.get(tenantId);
    if (!wizard) {
      throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
    }
    wizard.dataSources.push(source);
    wizard.updatedAt = new Date().toISOString();
    return { ...wizard, steps: { ...wizard.steps }, dataSources: [...wizard.dataSources] };
  }

  /** Update data source status. */
  updateDataSourceStatus(
    tenantId: string,
    sourceId: string,
    status: DataSourceRecord['status'],
    errorMessage?: string,
  ): DataSourceRecord {
    const wizard = this.wizards.get(tenantId);
    if (!wizard) {
      throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
    }
    const source = wizard.dataSources.find((s) => s.id === sourceId);
    if (!source) {
      throw new AppError(404, `Data source '${sourceId}' not found`, 'DATA_SOURCE_NOT_FOUND');
    }
    source.status = status;
    source.lastTestedAt = new Date().toISOString();
    source.errorMessage = errorMessage ?? null;
    wizard.updatedAt = source.lastTestedAt;
    return { ...source };
  }

  /** Reset wizard (restart onboarding). */
  reset(tenantId: string): WizardState {
    this.wizards.delete(tenantId);
    return this.getOrCreate(tenantId);
  }

  /** Check if onboarding is complete. */
  isComplete(tenantId: string): boolean {
    const wizard = this.wizards.get(tenantId);
    return wizard?.completedAt !== null && wizard?.completedAt !== undefined;
  }

  /** Set dashboard preferences. */
  setDashboardPrefs(tenantId: string, prefs: DashboardPreferenceInput): WizardState {
    const wizard = this.wizards.get(tenantId);
    if (!wizard) {
      throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
    }
    wizard.dashboardPrefs = prefs;
    wizard.updatedAt = new Date().toISOString();
    return { ...wizard, steps: { ...wizard.steps }, dataSources: [...wizard.dataSources] };
  }

  // ─── Private helpers ─────────────────────────────────

  private initSteps(): Record<WizardStep, StepStatus> {
    const steps = {} as Record<WizardStep, StepStatus>;
    for (const step of WIZARD_STEPS) {
      steps[step] = 'pending';
    }
    return steps;
  }

  private findNextStep(wizard: WizardState): WizardStep {
    for (const step of WIZARD_STEPS) {
      if (wizard.steps[step] === 'pending' || wizard.steps[step] === 'in_progress') {
        return step;
      }
    }
    return 'launch'; // All done
  }

  private calcCompletion(wizard: WizardState): number {
    const total = WIZARD_STEPS.length;
    const done = WIZARD_STEPS.filter(
      (s) => wizard.steps[s] === 'completed' || wizard.steps[s] === 'skipped',
    ).length;
    return Math.round((done / total) * 100);
  }
}
