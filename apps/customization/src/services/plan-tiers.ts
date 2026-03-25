import { AppError } from '@etip/shared-utils';
import {
  AI_PLANS,
  AI_CTI_SUBTASKS,
  RECOMMENDED_SUBTASK_MODELS,
  FALLBACK_SUBTASK_MODELS,
  type AiPlan,
  type AiModel,
} from '../schemas/customization.js';
import type { AiModelStore, SubtaskMapping } from './ai-model-store.js';

// ─── Plan subtask config type ─────────────────────────────────────

export type SubtaskConfig = { model: AiModel; fallbackModel: AiModel };
export type PlanSubtaskConfigs = Record<string, SubtaskConfig>;

// ─── Tier metadata ────────────────────────────────────────────────

export interface PlanTierMeta {
  plan: AiPlan;
  displayName: string;
  description: string;
  stageModel: string;           // human-readable "all stages use X"
  costPer1KArticlesUsd: string; // "$4–6"
  accuracyPct: string;          // "~85%"
  isRecommended: boolean;
}

export const PLAN_METADATA: Record<AiPlan, PlanTierMeta> = {
  starter: {
    plan: 'starter',
    displayName: 'Starter',
    description: 'Cost-efficient tier — all stages use Haiku. Best for high-volume, lower-stakes feeds.',
    stageModel: 'haiku (all stages)',
    costPer1KArticlesUsd: '$4–6',
    accuracyPct: '~85%',
    isRecommended: false,
  },
  professional: {
    plan: 'professional',
    displayName: 'Professional',
    description: 'Balanced tier — all stages use Sonnet. Recommended for most production deployments.',
    stageModel: 'sonnet (all stages)',
    costPer1KArticlesUsd: '~$27',
    accuracyPct: '~93%',
    isRecommended: true,
  },
  enterprise: {
    plan: 'enterprise',
    displayName: 'Enterprise',
    description: 'Maximum accuracy — all stages use Opus. Best for high-stakes CTI operations.',
    stageModel: 'opus (all stages)',
    costPer1KArticlesUsd: '~$85',
    accuracyPct: '~96%',
    isRecommended: false,
  },
  custom: {
    plan: 'custom',
    displayName: 'Custom',
    description: 'Per-subtask configuration — set each of the 12 subtasks individually.',
    stageModel: 'per-subtask',
    costPer1KArticlesUsd: 'variable',
    accuracyPct: 'variable',
    isRecommended: false,
  },
};

// ─── Plan subtask configs ─────────────────────────────────────────

/** Build subtask configs where every subtask uses the same model (with default fallbacks). */
function uniformPlan(model: AiModel): PlanSubtaskConfigs {
  const result: PlanSubtaskConfigs = {};
  for (const subtask of AI_CTI_SUBTASKS) {
    result[subtask] = { model, fallbackModel: FALLBACK_SUBTASK_MODELS[subtask] };
  }
  return result;
}

/** Professional plan: use recommended (★) model + standard fallbacks */
function professionalPlan(): PlanSubtaskConfigs {
  const result: PlanSubtaskConfigs = {};
  for (const subtask of AI_CTI_SUBTASKS) {
    result[subtask] = {
      model:         RECOMMENDED_SUBTASK_MODELS[subtask],
      fallbackModel: FALLBACK_SUBTASK_MODELS[subtask],
    };
  }
  return result;
}

export const PLAN_SUBTASK_CONFIGS: Record<Exclude<AiPlan, 'custom'>, PlanSubtaskConfigs> = {
  starter:      uniformPlan('haiku'),
  professional: professionalPlan(),
  enterprise:   uniformPlan('opus'),
};

// ─── PlanTierService ──────────────────────────────────────────────

/**
 * Manages the 4 AI plan tiers (Starter / Professional / Enterprise / Custom).
 *
 * `applyPlan` bulk-sets all 12 CTI subtask models for a tenant in one call,
 * producing a single audit event + single version snapshot.
 */
export class PlanTierService {
  /**
   * List all plan tiers with metadata. Custom tier shows current subtask config.
   */
  listPlans(): PlanTierMeta[] {
    return AI_PLANS.map((plan) => PLAN_METADATA[plan]);
  }

  /**
   * Get metadata for one plan.
   */
  getPlan(plan: AiPlan): PlanTierMeta {
    const meta = PLAN_METADATA[plan];
    if (!meta) throw new AppError(404, `Unknown plan tier: ${plan}`, 'PLAN_NOT_FOUND');
    return meta;
  }

  /**
   * Apply a plan tier — sets all 12 subtask models at once.
   * Throws 400 for the 'custom' plan (no bulk config; set subtasks individually).
   * Returns the full list of updated SubtaskMappings.
   */
  applyPlan(
    tenantId: string,
    plan: Exclude<AiPlan, 'custom'>,
    store: AiModelStore,
    userId: string,
  ): SubtaskMapping[] {
    if (!AI_PLANS.includes(plan)) {
      throw new AppError(400, `Unknown plan: ${plan}`, 'PLAN_INVALID');
    }
    // Note: TypeScript enforces plan !== 'custom' via Exclude<AiPlan, 'custom'>,
    // but we guard at runtime for safety (called from the route which re-casts).
    // Cast to string to avoid TS2367 unreachable comparison warning.
    if ((plan as string) === 'custom') {
      throw new AppError(
        400,
        "Custom plan cannot be applied in bulk — set each subtask model individually via PUT /ai/tasks/:subtask",
        'PLAN_CUSTOM_BULK_NOT_ALLOWED',
      );
    }

    const configs = PLAN_SUBTASK_CONFIGS[plan];
    return store.applySubtaskBatch(
      tenantId,
      configs,
      userId,
      `Applied ${PLAN_METADATA[plan].displayName} plan tier`,
    );
  }

  /**
   * Detect which plan tier a tenant's current config matches.
   * Returns null when config matches no predefined tier (i.e. 'custom').
   */
  detectCurrentPlan(subtasks: SubtaskMapping[]): AiPlan | null {
    const planNames: Array<Exclude<AiPlan, 'custom'>> = ['starter', 'professional', 'enterprise'];

    for (const plan of planNames) {
      const cfg = PLAN_SUBTASK_CONFIGS[plan];
      const allMatch = subtasks.every((s) => cfg[s.subtask]?.model === s.model);
      if (allMatch) return plan;
    }

    return 'custom';
  }
}
