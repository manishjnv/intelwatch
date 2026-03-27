/**
 * @module @etip/shared-normalization/stix-confidence
 * @description OASIS STIX 2.1 Section 4.14 semantic confidence scale.
 * Maps numeric confidence scores (0-100) to human-readable tiers
 * and traffic-light colors for display.
 */

export type StixConfidenceTier =
  | 'None'
  | 'Low'
  | 'Low-Medium'
  | 'Medium-Low'
  | 'Medium'
  | 'High-Low'
  | 'High';

/**
 * Map a numeric confidence score to STIX 2.1 semantic tier.
 * Based on OASIS STIX 2.1 Section 4.14.
 */
export function stixConfidenceTier(score: number): StixConfidenceTier {
  if (score <= 0) return 'None';
  if (score <= 14) return 'Low';
  if (score <= 29) return 'Low-Medium';
  if (score <= 44) return 'Medium-Low';
  if (score <= 69) return 'Medium';
  if (score <= 84) return 'High-Low';
  return 'High';
}

/**
 * Map a numeric confidence score to a traffic-light color.
 *   None/Low/Low-Medium → red
 *   Medium-Low/Medium   → amber
 *   High-Low/High       → green
 */
export function stixConfidenceColor(score: number): 'red' | 'amber' | 'green' {
  const tier = stixConfidenceTier(score);
  if (tier === 'None' || tier === 'Low' || tier === 'Low-Medium') return 'red';
  if (tier === 'Medium-Low' || tier === 'Medium') return 'amber';
  return 'green';
}

/**
 * Format a confidence score with its STIX tier for display.
 * @example formatConfidenceWithTier(72) → "72 (High-Low)"
 */
export function formatConfidenceWithTier(score: number): string {
  return `${score} (${stixConfidenceTier(score)})`;
}
