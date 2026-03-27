/**
 * @module @etip/shared-normalization/bayesian-confidence
 * @description Bayesian log-odds confidence model for IOC scoring.
 * Converts each signal to log-odds, sums them, then converts back.
 * Key property: 2 high-reliability feeds produce higher score than
 * 4 low-reliability feeds — multiplicative, not additive.
 *
 * Feature-gated: TI_BAYESIAN_CONFIDENCE=true (default when global processing enabled).
 * Existing linear model in confidence.ts is UNTOUCHED.
 */

import {
  IOC_DECAY_RATES,
  DEFAULT_DECAY_RATE,
  type ConfidenceSignalInput,
  type CompositeConfidence,
  ConfidenceSignalSchema,
  calculateCompositeConfidence,
} from './confidence.js';

// ── Signal weights for Bayesian model ────────────────────────────
export const BAYESIAN_WEIGHTS = {
  feedReliability: 0.40,
  corroboration: 0.35,
  aiScore: 0.25,
} as const;

/**
 * Convert a probability (0-1) to log-odds.
 * Clamps input to [0.01, 0.99] to avoid ±Infinity.
 */
export function toLogOdds(p: number): number {
  const clamped = Math.min(0.99, Math.max(0.01, p));
  return Math.log(clamped / (1 - clamped));
}

/**
 * Convert log-odds back to probability (0-1).
 */
export function fromLogOdds(logOdds: number): number {
  return 1 / (1 + Math.exp(-logOdds));
}

export interface BayesianConfidenceInput {
  feedReliability: number;   // 0-100
  corroboration: number;     // 0-100
  aiScore: number;           // 0-100
  daysSinceLastSeen: number;
  iocType?: string;
}

/**
 * Calculate confidence using Bayesian log-odds model.
 * Returns same CompositeConfidence interface for drop-in compatibility.
 */
export function calculateBayesianConfidence(
  input: BayesianConfidenceInput,
): CompositeConfidence {
  const { feedReliability, corroboration, aiScore, daysSinceLastSeen, iocType } = input;

  // Start with uninformed prior: logOdds(0.5) = 0
  let logOdds = 0;

  // Each signal updates posterior multiplicatively
  logOdds += toLogOdds(feedReliability / 100) * BAYESIAN_WEIGHTS.feedReliability;
  logOdds += toLogOdds(corroboration / 100) * BAYESIAN_WEIGHTS.corroboration;
  logOdds += toLogOdds(aiScore / 100) * BAYESIAN_WEIGHTS.aiScore;

  // Convert back to probability, scale to 0-100
  const raw = fromLogOdds(logOdds) * 100;

  // Apply time decay (reuse existing IOC_DECAY_RATES)
  const decayRate = iocType ? (IOC_DECAY_RATES[iocType] ?? DEFAULT_DECAY_RATE) : DEFAULT_DECAY_RATE;
  const decayFactor = Math.exp(-decayRate * Math.max(0, daysSinceLastSeen));
  const score = Math.round(raw * decayFactor);

  return {
    score: Math.min(100, Math.max(0, score)),
    signals: ConfidenceSignalSchema.parse({
      feedReliability,
      corroboration,
      aiScore,
    }),
    daysSinceLastSeen,
    decayFactor: Math.round(decayFactor * 1000) / 1000,
  };
}

/** Confidence calculator function signature. */
export type ConfidenceCalculator = (
  signals: ConfidenceSignalInput,
  daysSinceLastSeen: number,
  iocType?: string,
) => CompositeConfidence;

/**
 * Factory function returning the appropriate confidence calculator.
 * Default: 'bayesian' when TI_BAYESIAN_CONFIDENCE=true.
 * Fallback: 'linear' (existing calculateCompositeConfidence).
 */
export function selectConfidenceModel(model: 'linear' | 'bayesian'): ConfidenceCalculator {
  if (model === 'bayesian') {
    return (signals, daysSinceLastSeen, iocType) =>
      calculateBayesianConfidence({
        feedReliability: signals.feedReliability,
        corroboration: signals.corroboration,
        aiScore: signals.aiScore,
        daysSinceLastSeen,
        iocType,
      });
  }
  return calculateCompositeConfidence;
}
