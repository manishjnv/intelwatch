/**
 * @module global-ai-store
 * @description Super-admin global AI model configuration store.
 * Controls which AI model is used for each CTI subtask at the platform level.
 * Gated by TI_GLOBAL_PROCESSING_ENABLED.
 */

import { AppError } from '@etip/shared-utils';

// ── Types ─────────────────────────────────────────────────────────

export type AiModelName = 'haiku' | 'sonnet' | 'opus';
export type ConfidenceModelType = 'linear' | 'bayesian';

export interface GlobalAiConfigRow {
  category: string;
  subtask: string;
  model: AiModelName;
  fallbackModel: AiModelName;
  updatedBy: string;
  updatedAt: Date;
}

export interface ModelRecommendation {
  model: AiModelName;
  accuracy: number;
  reason: string;
}

export interface ConfigWithRecommendation extends GlobalAiConfigRow {
  recommended: ModelRecommendation;
  isCurrentlyRecommended: boolean;
}

// ── Recommended Models (static reference) ─────────────────────────

export const RECOMMENDED_MODELS: Record<string, ModelRecommendation> = {
  'news_feed.classification':      { model: 'sonnet', accuracy: 93, reason: 'Best CTI relevance detection vs cost' },
  'news_feed.ioc_extraction':      { model: 'sonnet', accuracy: 93, reason: 'Structured extraction needs reasoning' },
  'news_feed.deduplication':       { model: 'haiku',  accuracy: 92, reason: 'Pattern matching — haiku sufficient, 10x cheaper' },
  'news_feed.summarization':       { model: 'sonnet', accuracy: 0,  reason: 'Future subtask' },
  'news_feed.keyword_extraction':  { model: 'haiku',  accuracy: 0,  reason: 'Future subtask' },
  'news_feed.date_enrichment':     { model: 'haiku',  accuracy: 0,  reason: 'Future subtask' },
  'ioc_enrichment.ioc_triage':     { model: 'sonnet', accuracy: 93, reason: 'Risk scoring needs nuanced threat context' },
  'ioc_enrichment.cve_identification': { model: 'haiku', accuracy: 90, reason: 'Future subtask' },
  'ioc_enrichment.threat_actor':   { model: 'sonnet', accuracy: 93, reason: 'Future subtask' },
  'ioc_enrichment.ttp_mapping':    { model: 'sonnet', accuracy: 93, reason: 'Future subtask' },
  'ioc_enrichment.graph_relations': { model: 'haiku', accuracy: 88, reason: 'Future subtask' },
  'ioc_enrichment.ioc_expiry':     { model: 'haiku',  accuracy: 90, reason: 'Future subtask' },
  'reporting.executive_summary':   { model: 'sonnet', accuracy: 0,  reason: 'Future subtask' },
  'reporting.trend_analysis':      { model: 'haiku',  accuracy: 0,  reason: 'Future subtask' },
  'reporting.risk_narrative':      { model: 'sonnet', accuracy: 0,  reason: 'Future subtask' },
};

const VALID_MODELS: AiModelName[] = ['haiku', 'sonnet', 'opus'];

function parseKey(key: string): { category: string; subtask: string } {
  const [category = '', subtask = ''] = key.split('.');
  return { category, subtask };
}

// ── Store ─────────────────────────────────────────────────────────

export class GlobalAiStore {
  private cache: Map<string, GlobalAiConfigRow> = new Map();
  private cacheExpiry = 0;
  private readonly cacheTtlMs = 5 * 60 * 1000; // 5 min

  constructor(_prisma?: unknown) {}

  /** Get all global AI config rows. Seeds defaults if empty. */
  async getConfig(): Promise<GlobalAiConfigRow[]> {
    if (this.cache.size > 0 && Date.now() < this.cacheExpiry) {
      return Array.from(this.cache.values());
    }

    // Seed from RECOMMENDED_MODELS defaults
    const rows: GlobalAiConfigRow[] = [];
    for (const [key, rec] of Object.entries(RECOMMENDED_MODELS)) {
      const { category, subtask } = parseKey(key);
      const existing = this.cache.get(key);
      rows.push(existing ?? {
        category,
        subtask,
        model: rec.model,
        fallbackModel: 'haiku',
        updatedBy: 'system',
        updatedAt: new Date(),
      });
    }

    // Populate cache
    for (const row of rows) {
      this.cache.set(`${row.category}.${row.subtask}`, row);
    }
    this.cacheExpiry = Date.now() + this.cacheTtlMs;

    return rows;
  }

  /** Get config merged with static recommendations. */
  async getConfigWithRecommendations(): Promise<{
    config: ConfigWithRecommendation[];
    recommendations: typeof RECOMMENDED_MODELS;
  }> {
    const config = await this.getConfig();
    const merged: ConfigWithRecommendation[] = config.map((row) => {
      const key = `${row.category}.${row.subtask}`;
      const rec = RECOMMENDED_MODELS[key] ?? { model: 'haiku', accuracy: 0, reason: 'Unknown subtask' };
      return {
        ...row,
        recommended: rec,
        isCurrentlyRecommended: row.model === rec.model,
      };
    });

    return { config: merged, recommendations: RECOMMENDED_MODELS };
  }

  /** Upsert model for a specific subtask. */
  async setModel(
    category: string,
    subtask: string,
    model: string,
    updatedBy: string,
  ): Promise<GlobalAiConfigRow> {
    if (!VALID_MODELS.includes(model as AiModelName)) {
      throw new AppError(400, `Invalid model: ${model}. Must be one of: ${VALID_MODELS.join(', ')}`, 'VALIDATION_ERROR');
    }

    const key = `${category}.${subtask}`;
    if (!RECOMMENDED_MODELS[key]) {
      throw new AppError(400, `Invalid subtask: ${key}. Not in RECOMMENDED_MODELS.`, 'VALIDATION_ERROR');
    }

    const row: GlobalAiConfigRow = {
      category,
      subtask,
      model: model as AiModelName,
      fallbackModel: 'haiku',
      updatedBy,
      updatedAt: new Date(),
    };

    this.cache.set(key, row);
    // Extend cache expiry on write
    this.cacheExpiry = Date.now() + this.cacheTtlMs;
    return row;
  }

  /** Get the model assigned to a specific subtask (with cache + fallback). */
  async getModelForSubtask(category: string, subtask: string): Promise<string> {
    const key = `${category}.${subtask}`;

    // Check cache first
    if (this.cache.has(key) && Date.now() < this.cacheExpiry) {
      return this.cache.get(key)!.model;
    }

    // Fall back to recommendation default
    const rec = RECOMMENDED_MODELS[key];
    return rec?.model ?? 'haiku';
  }

  /** Get current confidence model type. */
  async getConfidenceModel(): Promise<ConfidenceModelType> {
    if (process.env.TI_BAYESIAN_CONFIDENCE === 'false') return 'linear';
    if (process.env.TI_GLOBAL_PROCESSING_ENABLED === 'true') return 'bayesian';
    return 'linear';
  }

  /** Bulk-set models from plan tier presets. */
  async applyPlanPreset(
    tier: 'starter' | 'teams' | 'enterprise',
    updatedBy: string,
  ): Promise<GlobalAiConfigRow[]> {
    const modelMap: Record<string, AiModelName> = {
      starter: 'haiku',
      teams: 'sonnet',    // Use recommended
      enterprise: 'sonnet',
    };

    const rows: GlobalAiConfigRow[] = [];
    for (const [key, rec] of Object.entries(RECOMMENDED_MODELS)) {
      const { category, subtask } = parseKey(key);
      const model = tier === 'teams' ? rec.model : modelMap[tier]!;
      const row = await this.setModel(category, subtask, model, updatedBy);
      rows.push(row);
    }

    return rows;
  }
}
