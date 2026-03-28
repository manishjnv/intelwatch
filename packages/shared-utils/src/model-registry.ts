/**
 * @module model-registry
 * @description Multi-provider AI model catalog with pricing, accuracy benchmarks,
 * and helper functions. Source of truth for all model metadata in the platform.
 *
 * @example
 * ```typescript
 * import { MODEL_CATALOG, getModelsByProvider, getBestAccuracy, getBestCost } from '@etip/shared-utils';
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────

export type AiProvider = 'anthropic' | 'openai' | 'google';
export type ModelTier = 'economy' | 'standard' | 'premium';

/** Pricing per 1M tokens in USD */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/** Accuracy benchmark for a specific subtask (0-100 scale) */
export interface SubtaskBenchmark {
  subtask: string;
  accuracy: number;
}

/** Complete definition for one AI model */
export interface ModelDefinition {
  id: string;
  provider: AiProvider;
  displayName: string;
  tier: ModelTier;
  pricing: ModelPricing;
  contextWindow: number;
  benchmarks: SubtaskBenchmark[];
}

// ── Subtask list (canonical) ──────────────────────────────────────

export const ALL_SUBTASKS = [
  'triage', 'extraction', 'classification', 'summarization', 'translation',
  'risk_scoring', 'context_gen', 'attribution', 'campaign_link', 'false_positive',
  'exec_summary', 'technical_detail', 'trend_analysis', 'recommendation', 'formatting',
] as const;

export type Subtask = (typeof ALL_SUBTASKS)[number];

// ── Model Catalog (9 models, 3 providers) ─────────────────────────

export const MODEL_CATALOG: ModelDefinition[] = [
  // ── Anthropic ────────────────────────────────────────────────────
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.6',
    tier: 'premium',
    pricing: { inputPer1M: 15.00, outputPer1M: 75.00 },
    contextWindow: 200_000,
    benchmarks: [
      { subtask: 'triage', accuracy: 88 },
      { subtask: 'extraction', accuracy: 96 },
      { subtask: 'classification', accuracy: 95 },
      { subtask: 'summarization', accuracy: 96 },
      { subtask: 'translation', accuracy: 93 },
      { subtask: 'risk_scoring', accuracy: 96 },
      { subtask: 'context_gen', accuracy: 95 },
      { subtask: 'attribution', accuracy: 96 },
      { subtask: 'campaign_link', accuracy: 93 },
      { subtask: 'false_positive', accuracy: 88 },
      { subtask: 'exec_summary', accuracy: 96 },
      { subtask: 'technical_detail', accuracy: 95 },
      { subtask: 'trend_analysis', accuracy: 94 },
      { subtask: 'recommendation', accuracy: 90 },
      { subtask: 'formatting', accuracy: 88 },
    ],
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    tier: 'standard',
    pricing: { inputPer1M: 3.00, outputPer1M: 15.00 },
    contextWindow: 200_000,
    benchmarks: [
      { subtask: 'triage', accuracy: 84 },
      { subtask: 'extraction', accuracy: 92 },
      { subtask: 'classification', accuracy: 91 },
      { subtask: 'summarization', accuracy: 92 },
      { subtask: 'translation', accuracy: 89 },
      { subtask: 'risk_scoring', accuracy: 94 },
      { subtask: 'context_gen', accuracy: 92 },
      { subtask: 'attribution', accuracy: 92 },
      { subtask: 'campaign_link', accuracy: 89 },
      { subtask: 'false_positive', accuracy: 84 },
      { subtask: 'exec_summary', accuracy: 93 },
      { subtask: 'technical_detail', accuracy: 91 },
      { subtask: 'trend_analysis', accuracy: 90 },
      { subtask: 'recommendation', accuracy: 85 },
      { subtask: 'formatting', accuracy: 83 },
    ],
  },
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    tier: 'economy',
    pricing: { inputPer1M: 0.80, outputPer1M: 4.00 },
    contextWindow: 200_000,
    benchmarks: [
      { subtask: 'triage', accuracy: 78 },
      { subtask: 'extraction', accuracy: 80 },
      { subtask: 'classification', accuracy: 79 },
      { subtask: 'summarization', accuracy: 78 },
      { subtask: 'translation', accuracy: 76 },
      { subtask: 'risk_scoring', accuracy: 80 },
      { subtask: 'context_gen', accuracy: 78 },
      { subtask: 'attribution', accuracy: 76 },
      { subtask: 'campaign_link', accuracy: 74 },
      { subtask: 'false_positive', accuracy: 78 },
      { subtask: 'exec_summary', accuracy: 76 },
      { subtask: 'technical_detail', accuracy: 74 },
      { subtask: 'trend_analysis', accuracy: 72 },
      { subtask: 'recommendation', accuracy: 76 },
      { subtask: 'formatting', accuracy: 74 },
    ],
  },

  // ── OpenAI ──────────────────────────────────────────────────────
  {
    id: 'o3',
    provider: 'openai',
    displayName: 'o3',
    tier: 'premium',
    pricing: { inputPer1M: 10.00, outputPer1M: 40.00 },
    contextWindow: 200_000,
    benchmarks: [
      { subtask: 'triage', accuracy: 86 },
      { subtask: 'extraction', accuracy: 94 },
      { subtask: 'classification', accuracy: 93 },
      { subtask: 'summarization', accuracy: 93 },
      { subtask: 'translation', accuracy: 91 },
      { subtask: 'risk_scoring', accuracy: 95 },
      { subtask: 'context_gen', accuracy: 93 },
      { subtask: 'attribution', accuracy: 95 },
      { subtask: 'campaign_link', accuracy: 91 },
      { subtask: 'false_positive', accuracy: 86 },
      { subtask: 'exec_summary', accuracy: 94 },
      { subtask: 'technical_detail', accuracy: 93 },
      { subtask: 'trend_analysis', accuracy: 92 },
      { subtask: 'recommendation', accuracy: 88 },
      { subtask: 'formatting', accuracy: 85 },
    ],
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    tier: 'standard',
    pricing: { inputPer1M: 2.50, outputPer1M: 10.00 },
    contextWindow: 128_000,
    benchmarks: [
      { subtask: 'triage', accuracy: 82 },
      { subtask: 'extraction', accuracy: 89 },
      { subtask: 'classification', accuracy: 88 },
      { subtask: 'summarization', accuracy: 89 },
      { subtask: 'translation', accuracy: 87 },
      { subtask: 'risk_scoring', accuracy: 90 },
      { subtask: 'context_gen', accuracy: 89 },
      { subtask: 'attribution', accuracy: 88 },
      { subtask: 'campaign_link', accuracy: 86 },
      { subtask: 'false_positive', accuracy: 82 },
      { subtask: 'exec_summary', accuracy: 90 },
      { subtask: 'technical_detail', accuracy: 88 },
      { subtask: 'trend_analysis', accuracy: 87 },
      { subtask: 'recommendation', accuracy: 83 },
      { subtask: 'formatting', accuracy: 81 },
    ],
  },
  {
    id: 'o3-mini',
    provider: 'openai',
    displayName: 'o3-mini',
    tier: 'standard',
    pricing: { inputPer1M: 1.10, outputPer1M: 4.40 },
    contextWindow: 200_000,
    benchmarks: [
      { subtask: 'triage', accuracy: 80 },
      { subtask: 'extraction', accuracy: 85 },
      { subtask: 'classification', accuracy: 83 },
      { subtask: 'summarization', accuracy: 84 },
      { subtask: 'translation', accuracy: 82 },
      { subtask: 'risk_scoring', accuracy: 86 },
      { subtask: 'context_gen', accuracy: 84 },
      { subtask: 'attribution', accuracy: 83 },
      { subtask: 'campaign_link', accuracy: 80 },
      { subtask: 'false_positive', accuracy: 80 },
      { subtask: 'exec_summary', accuracy: 84 },
      { subtask: 'technical_detail', accuracy: 82 },
      { subtask: 'trend_analysis', accuracy: 81 },
      { subtask: 'recommendation', accuracy: 80 },
      { subtask: 'formatting', accuracy: 78 },
    ],
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    tier: 'economy',
    pricing: { inputPer1M: 0.15, outputPer1M: 0.60 },
    contextWindow: 128_000,
    benchmarks: [
      { subtask: 'triage', accuracy: 76 },
      { subtask: 'extraction', accuracy: 79 },
      { subtask: 'classification', accuracy: 81 },
      { subtask: 'summarization', accuracy: 78 },
      { subtask: 'translation', accuracy: 77 },
      { subtask: 'risk_scoring', accuracy: 78 },
      { subtask: 'context_gen', accuracy: 76 },
      { subtask: 'attribution', accuracy: 74 },
      { subtask: 'campaign_link', accuracy: 72 },
      { subtask: 'false_positive', accuracy: 76 },
      { subtask: 'exec_summary', accuracy: 74 },
      { subtask: 'technical_detail', accuracy: 72 },
      { subtask: 'trend_analysis', accuracy: 70 },
      { subtask: 'recommendation', accuracy: 74 },
      { subtask: 'formatting', accuracy: 72 },
    ],
  },

  // ── Google ──────────────────────────────────────────────────────
  {
    id: 'gemini-2.5-pro',
    provider: 'google',
    displayName: 'Gemini 2.5 Pro',
    tier: 'standard',
    pricing: { inputPer1M: 1.25, outputPer1M: 10.00 },
    contextWindow: 1_000_000,
    benchmarks: [
      { subtask: 'triage', accuracy: 83 },
      { subtask: 'extraction', accuracy: 90 },
      { subtask: 'classification', accuracy: 89 },
      { subtask: 'summarization', accuracy: 90 },
      { subtask: 'translation', accuracy: 91 },
      { subtask: 'risk_scoring', accuracy: 91 },
      { subtask: 'context_gen', accuracy: 90 },
      { subtask: 'attribution', accuracy: 88 },
      { subtask: 'campaign_link', accuracy: 85 },
      { subtask: 'false_positive', accuracy: 83 },
      { subtask: 'exec_summary', accuracy: 90 },
      { subtask: 'technical_detail', accuracy: 88 },
      { subtask: 'trend_analysis', accuracy: 88 },
      { subtask: 'recommendation', accuracy: 84 },
      { subtask: 'formatting', accuracy: 82 },
    ],
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'google',
    displayName: 'Gemini 2.5 Flash',
    tier: 'economy',
    pricing: { inputPer1M: 0.15, outputPer1M: 0.60 },
    contextWindow: 1_000_000,
    benchmarks: [
      { subtask: 'triage', accuracy: 75 },
      { subtask: 'extraction', accuracy: 78 },
      { subtask: 'classification', accuracy: 77 },
      { subtask: 'summarization', accuracy: 76 },
      { subtask: 'translation', accuracy: 79 },
      { subtask: 'risk_scoring', accuracy: 76 },
      { subtask: 'context_gen', accuracy: 74 },
      { subtask: 'attribution', accuracy: 72 },
      { subtask: 'campaign_link', accuracy: 70 },
      { subtask: 'false_positive', accuracy: 74 },
      { subtask: 'exec_summary', accuracy: 74 },
      { subtask: 'technical_detail', accuracy: 72 },
      { subtask: 'trend_analysis', accuracy: 70 },
      { subtask: 'recommendation', accuracy: 72 },
      { subtask: 'formatting', accuracy: 74 },
    ],
  },
];

// ── Helper Functions ──────────────────────────────────────────────

/** Get all models for a specific provider */
export function getModelsByProvider(provider: AiProvider): ModelDefinition[] {
  return MODEL_CATALOG.filter(m => m.provider === provider);
}

/** Get a specific model by ID */
export function getModelById(id: string): ModelDefinition | undefined {
  return MODEL_CATALOG.find(m => m.id === id);
}

/** Get the model with the highest accuracy for a given subtask */
export function getBestAccuracy(subtask: string): ModelDefinition | undefined {
  let best: ModelDefinition | undefined;
  let bestScore = -1;

  for (const model of MODEL_CATALOG) {
    const bench = model.benchmarks.find(b => b.subtask === subtask);
    if (bench && bench.accuracy > bestScore) {
      bestScore = bench.accuracy;
      best = model;
    }
  }
  return best;
}

/** Get the cheapest model that meets a minimum accuracy threshold for a subtask */
export function getBestCost(subtask: string, minAccuracy = 0): ModelDefinition | undefined {
  const candidates = MODEL_CATALOG
    .filter(m => {
      const bench = m.benchmarks.find(b => b.subtask === subtask);
      return bench && bench.accuracy >= minAccuracy;
    })
    .sort((a, b) => {
      const aCost = a.pricing.inputPer1M + a.pricing.outputPer1M;
      const bCost = b.pricing.inputPer1M + b.pricing.outputPer1M;
      return aCost - bCost;
    });

  return candidates[0];
}

/** Get the accuracy score for a specific model + subtask combination */
export function getAccuracy(modelId: string, subtask: string): number {
  const model = getModelById(modelId);
  if (!model) return 0;
  const bench = model.benchmarks.find(b => b.subtask === subtask);
  return bench?.accuracy ?? 0;
}

/** Estimate cost per item (assumes avg 1000 input + 300 output tokens) */
export function estimatePerItemCost(
  modelId: string,
  inputTokens = 1000,
  outputTokens = 300,
): number {
  const model = getModelById(modelId);
  if (!model) return 0;
  const inputCost = (inputTokens * model.pricing.inputPer1M) / 1_000_000;
  const outputCost = (outputTokens * model.pricing.outputPer1M) / 1_000_000;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/** Provider display metadata */
export const PROVIDER_META: Record<AiProvider, { label: string; color: string; keyPrefix: string }> = {
  anthropic: { label: 'Anthropic', color: '#8b5cf6', keyPrefix: 'sk-ant-' },
  openai:    { label: 'OpenAI',    color: '#10b981', keyPrefix: 'sk-' },
  google:    { label: 'Google',    color: '#f59e0b', keyPrefix: 'AIza' },
};
