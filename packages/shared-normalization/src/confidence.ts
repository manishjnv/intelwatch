/**
 * @module @etip/shared-normalization/confidence
 * @description Confidence scoring types for IOC intelligence.
 * The composite confidence formula uses a weighted 3-signal approach
 * (feedReliability 0.35, corroboration 0.35, aiScore 0.30) with
 * type-specific exponential time-decay (IPs decay fast, hashes slow).
 *
 * @see 00-ARCHITECTURE-ROADMAP.md (composite confidence formula)
 */
import { z } from 'zod';

/** Individual confidence signal weights (must sum to 1.0). */
export const CONFIDENCE_WEIGHTS = {
  feedReliability: 0.35,
  corroboration: 0.35,
  aiScore: 0.30,
} as const;

/**
 * Type-specific decay rates for IOC confidence.
 * Hashes are permanent artifacts (near-zero decay).
 * IPs change hands quickly (aggressive decay).
 * Domains/URLs are in between.
 */
export const IOC_DECAY_RATES: Record<string, number> = {
  hash_md5: 0.002,
  hash_sha1: 0.001,
  hash_sha256: 0.001,
  hash_sha512: 0.001,
  ip: 0.05,          // halves in ~14 days
  ipv6: 0.05,
  domain: 0.02,      // halves in ~35 days
  fqdn: 0.02,
  url: 0.04,         // halves in ~17 days
  email: 0.03,       // halves in ~23 days
  cve: 0.005,        // CVEs are permanent
  cidr: 0.04,
  asn: 0.01,
  bitcoin_address: 0.003,
  unknown: 0.01,     // default fallback
} as const;

/** Default decay rate when IOC type is not in the lookup table */
export const DEFAULT_DECAY_RATE = 0.01;

/** Confidence signal input (one per contributing source). */
export const ConfidenceSignalSchema = z.object({
  feedReliability: z.number().min(0).max(100).describe('Source feed reliability score (0-100)'),
  corroboration: z.number().min(0).max(100).describe('How many independent sources confirm this IOC (0-100)'),
  aiScore: z.number().min(0).max(100).describe('AI enrichment confidence score (0-100)'),
  /** @deprecated Kept for backward compatibility — no longer used in weight calculation */
  communityVotes: z.number().min(0).max(100).optional().default(0),
});

/** Output type (after defaults applied) */
export type ConfidenceSignal = z.infer<typeof ConfidenceSignalSchema>;
/** Input type (communityVotes optional) — use this for function parameters */
export type ConfidenceSignalInput = z.input<typeof ConfidenceSignalSchema>;

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
 * Decay rate varies by IOC type — hashes decay slowly, IPs decay fast.
 *
 * @param signals - Individual confidence signals
 * @param daysSinceLastSeen - Days since last sighting of this IOC
 * @param iocType - Optional IOC type for type-specific decay rate
 * @returns Composite confidence result
 */
export function calculateCompositeConfidence(
  signals: ConfidenceSignalInput,
  daysSinceLastSeen: number,
  iocType?: string,
): CompositeConfidence {
  const validated = ConfidenceSignalSchema.parse(signals);

  const raw =
    CONFIDENCE_WEIGHTS.feedReliability * validated.feedReliability +
    CONFIDENCE_WEIGHTS.corroboration * validated.corroboration +
    CONFIDENCE_WEIGHTS.aiScore * validated.aiScore;

  const decayRate = iocType ? (IOC_DECAY_RATES[iocType] ?? DEFAULT_DECAY_RATE) : DEFAULT_DECAY_RATE;
  const decayFactor = Math.exp(-decayRate * Math.max(0, daysSinceLastSeen));
  const score = Math.round(raw * decayFactor);

  return {
    score: Math.min(100, Math.max(0, score)),
    signals: validated,
    daysSinceLastSeen,
    decayFactor: Math.round(decayFactor * 1000) / 1000,
  };
}
