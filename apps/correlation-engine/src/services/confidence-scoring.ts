/**
 * #6 — Confidence-Weighted Correlation Scoring
 * Composite score: evidence_count × source_diversity × freshness × enrichment_quality
 * Replaces binary match/no-match with probability-ranked results.
 */

export interface ConfidenceInputs {
  evidenceCount: number;     // Number of supporting data points
  sourceDiversity: number;   // Number of unique sources (0-1 normalized)
  freshnessHours: number;    // Hours since last observation
  enrichmentQuality: number; // 0-1 from enrichment service
  maxFreshnessHours?: number;
}

export interface ConfidenceWeights {
  evidence: number;
  diversity: number;
  freshness: number;
  quality: number;
}

const DEFAULT_WEIGHTS: ConfidenceWeights = {
  evidence: 0.25,
  diversity: 0.30,
  freshness: 0.25,
  quality: 0.20,
};

export class ConfidenceScoringService {
  private readonly weights: ConfidenceWeights;

  constructor(weights: Partial<ConfidenceWeights> = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  /** Normalize evidence count using square root scaling (diminishing returns) */
  normalizeEvidence(count: number): number {
    if (count <= 0) return 0;
    return Math.min(1, Math.sqrt(count) / Math.sqrt(20)); // 20 = max meaningful evidence
  }

  /** Normalize source diversity (0-1) */
  normalizeDiversity(uniqueSources: number, totalSources: number): number {
    if (totalSources <= 0) return 0;
    if (uniqueSources <= 1) return 0;
    return Math.min(1, uniqueSources / totalSources);
  }

  /** Freshness decay: exponential decay based on age in hours */
  normalizeFreshness(hoursOld: number, maxHours: number = 168): number {
    if (hoursOld <= 0) return 1;
    if (hoursOld >= maxHours) return 0;
    return Math.exp(-3 * (hoursOld / maxHours));
  }

  /** Compute weighted composite confidence score */
  computeScore(inputs: ConfidenceInputs): number {
    const maxFreshness = inputs.maxFreshnessHours ?? 168;
    const evidence = this.normalizeEvidence(inputs.evidenceCount);
    const diversity = inputs.sourceDiversity;
    const freshness = this.normalizeFreshness(inputs.freshnessHours, maxFreshness);
    const quality = Math.max(0, Math.min(1, inputs.enrichmentQuality));

    const score =
      this.weights.evidence * evidence +
      this.weights.diversity * diversity +
      this.weights.freshness * freshness +
      this.weights.quality * quality;

    return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;
  }

  /** Batch score multiple correlation results */
  batchScore(
    items: Array<{ id: string; inputs: ConfidenceInputs }>,
  ): Array<{ id: string; score: number }> {
    return items.map(({ id, inputs }) => ({
      id,
      score: this.computeScore(inputs),
    }));
  }

  /** Get the current weight configuration */
  getWeights(): ConfidenceWeights {
    return { ...this.weights };
  }
}
