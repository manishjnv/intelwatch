/**
 * @module cost-predictor
 * @description AI cost prediction for global processing configuration.
 * Estimates monthly costs based on model assignments, token usage, and volume.
 */

import type { AiModelName } from './global-ai-store.js';

// ── Token Pricing (per 1M tokens, USD) ─────────────────────────

export const TOKEN_PRICING: Record<AiModelName, { inputPer1M: number; outputPer1M: number }> = {
  haiku:  { inputPer1M: 0.25,  outputPer1M: 1.25 },
  sonnet: { inputPer1M: 3.00,  outputPer1M: 15.00 },
  opus:   { inputPer1M: 15.00, outputPer1M: 75.00 },
};

// ── Avg tokens per subtask (estimated from production traces) ───

export const AVG_TOKENS_PER_SUBTASK: Record<string, { input: number; output: number }> = {
  classification:      { input: 800,  output: 200 },
  ioc_extraction:      { input: 1200, output: 400 },
  deduplication:       { input: 600,  output: 100 },
  summarization:       { input: 1500, output: 500 },
  keyword_extraction:  { input: 800,  output: 150 },
  date_enrichment:     { input: 600,  output: 100 },
  ioc_triage:          { input: 1000, output: 300 },
  cve_identification:  { input: 900,  output: 250 },
  threat_actor:        { input: 1200, output: 400 },
  ttp_mapping:         { input: 1100, output: 350 },
  graph_relations:     { input: 800,  output: 200 },
  ioc_expiry:          { input: 600,  output: 150 },
  executive_summary:   { input: 2000, output: 800 },
  trend_analysis:      { input: 1500, output: 600 },
  risk_narrative:      { input: 1800, output: 700 },
};

// ── Types ─────────────────────────────────────────────────────────

export interface SubtaskCostConfig {
  category: string;
  subtask: string;
  model: AiModelName;
}

export interface VolumeEstimate {
  articlesPerMonth: number;
  iocsPerMonth: number;
}

export interface SubtaskCostBreakdown {
  category: string;
  subtask: string;
  model: AiModelName;
  monthlyCost: number;
}

export interface CostEstimate {
  totalMonthly: number;
  perSubtask: SubtaskCostBreakdown[];
}

export interface CostDelta {
  current: number;
  proposed: number;
  delta: number;
}

// ── News feed vs IOC enrichment categories ────────────────────────

const NEWS_FEED_SUBTASKS = new Set([
  'classification', 'ioc_extraction', 'deduplication',
  'summarization', 'keyword_extraction', 'date_enrichment',
]);

// ── Cost Predictor ────────────────────────────────────────────────

export class CostPredictor {
  /**
   * Estimate monthly cost for a given configuration + volume.
   */
  estimateMonthlyCost(config: SubtaskCostConfig[], volume: VolumeEstimate): CostEstimate {
    const perSubtask: SubtaskCostBreakdown[] = [];

    for (const item of config) {
      const tokens = AVG_TOKENS_PER_SUBTASK[item.subtask] ?? { input: 800, output: 200 };
      const pricing = TOKEN_PRICING[item.model];

      // Determine call count based on category
      const callCount = NEWS_FEED_SUBTASKS.has(item.subtask)
        ? volume.articlesPerMonth
        : volume.iocsPerMonth;

      const inputCost = (tokens.input * pricing.inputPer1M) / 1_000_000 * callCount;
      const outputCost = (tokens.output * pricing.outputPer1M) / 1_000_000 * callCount;
      const monthlyCost = Math.round((inputCost + outputCost) * 100) / 100;

      perSubtask.push({
        category: item.category,
        subtask: item.subtask,
        model: item.model,
        monthlyCost,
      });
    }

    const totalMonthly = Math.round(perSubtask.reduce((sum, s) => sum + s.monthlyCost, 0) * 100) / 100;

    return { totalMonthly, perSubtask };
  }

  /**
   * Compare current vs proposed configuration costs.
   */
  estimateCostDelta(
    currentConfig: SubtaskCostConfig[],
    proposedConfig: SubtaskCostConfig[],
    volume: VolumeEstimate,
  ): CostDelta {
    const current = this.estimateMonthlyCost(currentConfig, volume).totalMonthly;
    const proposed = this.estimateMonthlyCost(proposedConfig, volume).totalMonthly;
    return {
      current,
      proposed,
      delta: Math.round((proposed - current) * 100) / 100,
    };
  }
}
