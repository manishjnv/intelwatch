/**
 * Enrichment Quality Score (#10) — meta-score for enrichment completeness.
 * Computed as: provider coverage (33%) + data freshness (33%) + AI confidence (34%).
 * Low quality can trigger re-enrichment scheduling.
 */

import type { VTResult, AbuseIPDBResult, HaikuTriageResult } from './schema.js';

/** Weights for quality score components */
const WEIGHTS = { coverage: 0.33, freshness: 0.33, aiConfidence: 0.34 };

/** Max age in hours before freshness decays to zero */
const MAX_FRESHNESS_HOURS = 168; // 7 days

/**
 * Compute enrichment quality score (0-100).
 * - Provider coverage: % of applicable providers that returned data
 * - Data freshness: how recent the enrichment is (decays over 7 days)
 * - AI confidence: Haiku confidence level (0 if no AI)
 */
export function computeEnrichmentQuality(
  vt: VTResult | null,
  abuse: AbuseIPDBResult | null,
  haiku: HaikuTriageResult | null,
  iocType: string,
  enrichedAt: Date | null,
): number {
  // Provider coverage (0-100)
  const applicable = countApplicableProviders(iocType);
  let covered = 0;
  if (vt) covered++;
  if (abuse) covered++;
  if (haiku) covered++;
  const coverageScore = applicable > 0 ? (covered / applicable) * 100 : 0;

  // Data freshness (0-100, linear decay over MAX_FRESHNESS_HOURS)
  let freshnessScore = 0;
  if (enrichedAt) {
    const hoursAgo = (Date.now() - enrichedAt.getTime()) / (1000 * 60 * 60);
    freshnessScore = Math.max(0, 100 * (1 - hoursAgo / MAX_FRESHNESS_HOURS));
  }

  // AI confidence (0-100)
  const aiConfidenceScore = haiku ? haiku.confidence : 0;

  const raw = coverageScore * WEIGHTS.coverage +
    freshnessScore * WEIGHTS.freshness +
    aiConfidenceScore * WEIGHTS.aiConfidence;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

/** Count how many providers are applicable for a given IOC type */
function countApplicableProviders(iocType: string): number {
  let count = 1; // Haiku always applicable
  // VT supports: ip, ipv6, domain, fqdn, url, hash_*
  const vtTypes = ['ip', 'ipv6', 'domain', 'fqdn', 'url'];
  if (vtTypes.includes(iocType) || iocType.startsWith('hash_')) count++;
  // AbuseIPDB supports: ip, ipv6 only
  if (iocType === 'ip' || iocType === 'ipv6') count++;
  return count;
}
