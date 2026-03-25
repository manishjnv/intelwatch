import {
  AI_CTI_SUBTASKS,
  AI_CTI_SUBTASK_STAGE,
  type AiModel,
  type AiCtiSubtask,
} from '../schemas/customization.js';

// ─── Pricing table (Anthropic March 2026) ─────────────────────────
// All values in $ per million tokens.
const PRICING: Record<AiModel, { input: number; output: number }> = {
  haiku:  { input: 0.25,  output: 1.25 },
  sonnet: { input: 3,     output: 15 },
  opus:   { input: 15,    output: 75 },
};

// ─── Token usage per article per stage ───────────────────────────
// Each stage runs as a single combined prompt (not separate per subtask).
// Source: CTI-Pipeline-Architecture-v2.0, Section 5.3.
const STAGE_TOKENS: Record<1 | 2 | 3, { input: number; output: number }> = {
  1: { input: 4500, output: 800 },   // Stage 1 — classify + summarize
  2: { input: 5000, output: 1200 },  // Stage 2 — deep extraction
  3: { input: 2000, output: 500 },   // Stage 3 — dedup / merge
};

// Stage 1 and 3 run on all articles; Stage 2 factor is configurable.
const BASE_STAGE_FACTOR: Record<1 | 2 | 3, number> = {
  1: 1.0,
  2: 0.2,  // default — overridden by TI_COST_STAGE2_FACTOR
  3: 1.0,
};

// ─── Public types ─────────────────────────────────────────────────

export interface StageEstimate {
  stage: 1 | 2 | 3;
  /** Dominant model for this stage (most subtasks use this). */
  model: AiModel;
  articles: number;
  subtasks: number;
  costUsd: number;
}

export interface CostEstimate {
  perStage: StageEstimate[];
  totalMonthlyUsd: number;
  /** Reference costs for the 3 predefined plans (uniform model per stage). */
  comparedTo: {
    starter: number;
    professional: number;
    enterprise: number;
  };
}

// ─── CostEstimator ───────────────────────────────────────────────

/**
 * Stateless cost estimator — instantiate once and reuse.
 *
 * Each pipeline stage is treated as a single combined LLM call per article
 * (not one call per subtask). The cost therefore scales with article volume,
 * not subtask count. The dominant model (majority vote per stage) is used
 * when subtasks within a stage have mixed models.
 *
 * @param stage2Factor - Fraction of articles that reach Stage 2 deep extraction.
 *   Must be in [0.0, 1.0]. Values outside this range fall back to the default (0.2).
 *   Configurable via TI_COST_STAGE2_FACTOR env var.
 */
export class CostEstimator {
  private readonly stageArticleFactor: Record<1 | 2 | 3, number>;

  constructor(stage2Factor: number = 0.2) {
    // Clamp to valid range; out-of-range falls back to the default 0.2
    const clamped = stage2Factor >= 0 && stage2Factor <= 1 ? stage2Factor : 0.2;
    this.stageArticleFactor = { ...BASE_STAGE_FACTOR, 2: clamped };
  }

  /**
   * Estimate monthly cost given per-subtask model assignments
   * and a monthly article volume.
   */
  estimate(
    subtaskModels: Record<string, AiModel>,
    articleCount: number,
  ): CostEstimate {
    // Group subtasks by stage
    const byStage = new Map<1 | 2 | 3, AiModel[]>();
    for (const subtask of AI_CTI_SUBTASKS) {
      const model: AiModel = subtaskModels[subtask] ?? 'sonnet';
      const stage = AI_CTI_SUBTASK_STAGE[subtask as AiCtiSubtask];
      const list = byStage.get(stage) ?? [];
      list.push(model);
      byStage.set(stage, list);
    }

    const perStage: StageEstimate[] = [];
    let total = 0;

    for (const [stage, models] of byStage.entries()) {
      const articles = Math.round(articleCount * this.stageArticleFactor[stage]);

      // Pick the model used by the most subtasks in this stage
      const counts = new Map<AiModel, number>();
      for (const m of models) counts.set(m, (counts.get(m) ?? 0) + 1);
      const dominantModel = ([...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['sonnet'])[0] as AiModel;

      const stageCost = this.stageCost(dominantModel, stage, articles);

      perStage.push({
        stage,
        model: dominantModel,
        articles,
        subtasks: models.length,
        costUsd: round2(stageCost),
      });
      total += stageCost;
    }

    perStage.sort((a, b) => a.stage - b.stage);

    return {
      perStage,
      totalMonthlyUsd: round2(total),
      comparedTo: this.uniformComparisons(articleCount),
    };
  }

  // ── helpers ───────────────────────────────────────────────────

  /** Cost for one stage = articles × (inputTokens×inputPrice + outputTokens×outputPrice) / 1M */
  private stageCost(model: AiModel, stage: 1 | 2 | 3, articles: number): number {
    const p = PRICING[model];
    const t = STAGE_TOKENS[stage];
    return articles * (t.input * p.input + t.output * p.output) / 1_000_000;
  }

  /** Total cost when the same model is used for every stage. */
  private uniformTotal(model: AiModel, articleCount: number): number {
    let total = 0;
    for (const stage of [1, 2, 3] as const) {
      const articles = Math.round(articleCount * this.stageArticleFactor[stage]);
      total += this.stageCost(model, stage, articles);
    }
    return total;
  }

  private uniformComparisons(articleCount: number): CostEstimate['comparedTo'] {
    return {
      starter:      round2(this.uniformTotal('haiku', articleCount)),
      professional: round2(this.uniformTotal('sonnet', articleCount)),
      enterprise:   round2(this.uniformTotal('opus', articleCount)),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
