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
import type { Redis } from 'ioredis';

const KEY_PREFIX = 'etip:';
const KEY_SUFFIX = ':wizard';
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function redisKey(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}${KEY_SUFFIX}`;
}

/**
 * Wizard state store with optional Redis persistence.
 * - When Redis is provided: state survives container restarts (key: etip:{tenantId}:wizard).
 * - When Redis is null (test mode): falls back to in-memory Map.
 */
export class WizardStore {
  /** tenantId → WizardState (in-memory cache / fallback) */
  private wizards = new Map<string, WizardState>();
  private redis: Redis | null;

  constructor(redis?: Redis | null) {
    this.redis = redis ?? null;
  }

  /** Get or create wizard state for a tenant. */
  async getOrCreate(tenantId: string): Promise<WizardState> {
    // Try cache first
    let wizard = this.wizards.get(tenantId);
    if (wizard) {
      return this.clone(wizard);
    }

    // Try Redis
    if (this.redis) {
      const raw = await this.redis.get(redisKey(tenantId));
      if (raw) {
        wizard = JSON.parse(raw) as WizardState;
        this.wizards.set(tenantId, wizard);
        return this.clone(wizard);
      }
    }

    // Create new
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
    await this.persist(tenantId);
    return this.clone(wizard);
  }

  /** Get wizard state (throws if not found). */
  async get(tenantId: string): Promise<WizardState> {
    // Try cache
    let wizard = this.wizards.get(tenantId);
    if (wizard) return this.clone(wizard);

    // Try Redis
    if (this.redis) {
      const raw = await this.redis.get(redisKey(tenantId));
      if (raw) {
        wizard = JSON.parse(raw) as WizardState;
        this.wizards.set(tenantId, wizard);
        return this.clone(wizard);
      }
    }

    throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
  }

  /** Complete a step and advance. */
  async completeStep(tenantId: string, step: WizardStep, data?: Record<string, unknown>): Promise<WizardState> {
    const wizard = await this.requireWizard(tenantId);

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

    await this.persist(tenantId);
    return this.clone(wizard);
  }

  /** Skip a step. */
  async skipStep(tenantId: string, step: WizardStep): Promise<WizardState> {
    const wizard = await this.requireWizard(tenantId);

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

    await this.persist(tenantId);
    return this.clone(wizard);
  }

  /** Set org profile data. */
  async setOrgProfile(tenantId: string, profile: OrgProfileInput): Promise<WizardState> {
    const wizard = await this.requireWizard(tenantId);
    wizard.orgProfile = profile;
    wizard.updatedAt = new Date().toISOString();
    await this.persist(tenantId);
    return this.clone(wizard);
  }

  /** Add team invites. */
  async addTeamInvites(tenantId: string, invites: TeamInviteInput['invites']): Promise<WizardState> {
    const wizard = await this.requireWizard(tenantId);
    wizard.teamInvites = [...wizard.teamInvites, ...invites];
    wizard.updatedAt = new Date().toISOString();
    await this.persist(tenantId);
    return this.clone(wizard);
  }

  /** Add a data source record. */
  async addDataSource(tenantId: string, source: DataSourceRecord): Promise<WizardState> {
    const wizard = await this.requireWizard(tenantId);
    wizard.dataSources.push(source);
    wizard.updatedAt = new Date().toISOString();
    await this.persist(tenantId);
    return this.clone(wizard);
  }

  /** Update data source status. */
  async updateDataSourceStatus(
    tenantId: string,
    sourceId: string,
    status: DataSourceRecord['status'],
    errorMessage?: string,
  ): Promise<DataSourceRecord> {
    const wizard = await this.requireWizard(tenantId);
    const source = wizard.dataSources.find((s) => s.id === sourceId);
    if (!source) {
      throw new AppError(404, `Data source '${sourceId}' not found`, 'DATA_SOURCE_NOT_FOUND');
    }
    source.status = status;
    source.lastTestedAt = new Date().toISOString();
    source.errorMessage = errorMessage ?? null;
    wizard.updatedAt = source.lastTestedAt;
    await this.persist(tenantId);
    return { ...source };
  }

  /** Reset wizard (restart onboarding). */
  async reset(tenantId: string): Promise<WizardState> {
    this.wizards.delete(tenantId);
    if (this.redis) {
      await this.redis.del(redisKey(tenantId));
    }
    return this.getOrCreate(tenantId);
  }

  /** Check if onboarding is complete. */
  isComplete(tenantId: string): boolean {
    const wizard = this.wizards.get(tenantId);
    return wizard?.completedAt !== null && wizard?.completedAt !== undefined;
  }

  /** Set dashboard preferences. */
  async setDashboardPrefs(tenantId: string, prefs: DashboardPreferenceInput): Promise<WizardState> {
    const wizard = await this.requireWizard(tenantId);
    wizard.dashboardPrefs = prefs;
    wizard.updatedAt = new Date().toISOString();
    await this.persist(tenantId);
    return this.clone(wizard);
  }

  // ─── Private helpers ─────────────────────────────────

  /** Get wizard from cache or Redis, throw if not found. */
  private async requireWizard(tenantId: string): Promise<WizardState> {
    let wizard = this.wizards.get(tenantId);
    if (wizard) return wizard;

    if (this.redis) {
      const raw = await this.redis.get(redisKey(tenantId));
      if (raw) {
        wizard = JSON.parse(raw) as WizardState;
        this.wizards.set(tenantId, wizard);
        return wizard;
      }
    }

    throw new AppError(404, 'No onboarding session found', 'ONBOARDING_NOT_FOUND');
  }

  /** Persist current state to Redis (if available). */
  private async persist(tenantId: string): Promise<void> {
    if (!this.redis) return;
    const wizard = this.wizards.get(tenantId);
    if (!wizard) return;
    await this.redis.set(redisKey(tenantId), JSON.stringify(wizard), 'EX', TTL_SECONDS);
  }

  private clone(wizard: WizardState): WizardState {
    return { ...wizard, steps: { ...wizard.steps }, dataSources: [...wizard.dataSources] };
  }

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
