/**
 * @module @etip/shared-normalization/confidence
 * @description Confidence scoring types for IOC intelligence.
 * The composite confidence formula uses a weighted 4-signal approach
 * with exponential time-decay.
 *
 * @see 00-ARCHITECTURE-ROADMAP.md (composite confidence formula)
 */
import { z } from 'zod';

/** Individual confidence signal weights (must sum to 1.0). */
export const CONFIDENCE_WEIGHTS = {
  feedReliability: 0.30,
  corroboration: 0.25,
  aiScore: 0.25,
  communityVotes: 0.20,
} as const;

/** Confidence signal input (one per contributing source). */
export const ConfidenceSignalSchema = z.object({
  feedReliability: z.number().min(0).max(100).describe('Source feed reliability score (0-100)'),
  corroboration: z.number().min(0).max(100).describe('How many independent sources confirm this IOC (0-100)'),
  aiScore: z.number().min(0).max(100).describe('AI enrichment confidence score (0-100)'),
  communityVotes: z.number().min(0).max(100).describe('Community consensus score (0-100)'),
});

export type ConfidenceSignal = z.infer<typeof ConfidenceSignalSchema>;

/** Composite confidence result after weighting and decay. */
export interface CompositeConfidence {
  /** Final score after weighting + time decay (0-100). */
  score: number;
  /** Individual signal contributions (before decay). */
  signals: ConfidenceSignal;
  /** Days since last sighting (for decay calculation). */
  daysSinceLastSeen: number;
  /** Decay factor applied (0.0-1.0). */
  decayFactor: number;
}

/**
 * Calculate composite confidence score.
 * Formula: sum(weight_i * signal_i) * decay(days)
 * Decay: e^(-0.01 * days) — halves roughly every 69 days.
 *
 * @param signals - Individual confidence signals
 * @param daysSinceLastSeen - Days since last sighting of this IOC
 * @returns Composite confidence result
 */
export function calculateCompositeConfidence(
  signals: ConfidenceSignal,
  daysSinceLastSeen: number,
): CompositeConfidence {
  const validated = ConfidenceSignalSchema.parse(signals);

  const raw =
    CONFIDENCE_WEIGHTS.feedReliability * validated.feedReliability +
    CONFIDENCE_WEIGHTS.corroboration * validated.corroboration +
    CONFIDENCE_WEIGHTS.aiScore * validated.aiScore +
    CONFIDENCE_WEIGHTS.communityVotes * validated.communityVotes;

  const decayFactor = Math.exp(-0.01 * Math.max(0, daysSinceLastSeen));
  const score = Math.round(raw * decayFactor);

  return {
    score: Math.min(100, Math.max(0, score)),
    signals: validated,
    daysSinceLastSeen,
    decayFactor: Math.round(decayFactor * 1000) / 1000,
  };
}
