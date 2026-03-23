import type { ConfidenceReason } from '../schemas/drp.js';

interface SignalInput {
  signalType: string;
  rawValue: number;
  description: string;
}

/**
 * #1 Multi-Signal Confidence Scoring with Reason Summaries.
 *
 * Each detection signal contributes a weighted component to the composite
 * confidence. Every signal produces a human-readable reason so analysts
 * can understand why a score is high or low.
 */

const SIGNAL_WEIGHTS: Record<string, number> = {
  // Typosquatting signals
  homoglyph_similarity: 0.25,
  insertion_similarity: 0.15,
  deletion_similarity: 0.15,
  transposition_similarity: 0.15,
  tld_variant_match: 0.20,
  domain_registered: 0.30,
  recent_registration: 0.25,
  hosting_suspicious: 0.15,
  // Dark web signals
  keyword_density: 0.25,
  source_reputation: 0.30,
  mention_recency: 0.20,
  data_for_sale: 0.35,
  credential_dump: 0.40,
  // Credential leak signals
  breach_severity: 0.30,
  exposed_count: 0.25,
  password_included: 0.35,
  breach_recency: 0.20,
  // Attack surface signals
  service_risk: 0.30,
  version_outdated: 0.20,
  cert_expired: 0.25,
  high_risk_port: 0.25,
};

const DEFAULT_WEIGHT = 0.15;

export class ConfidenceScorer {
  /**
   * Compute composite confidence from a set of detection signals.
   * Returns the confidence score (0-1) and reasons for each signal contribution.
   */
  score(signals: SignalInput[]): { confidence: number; reasons: ConfidenceReason[] } {
    if (signals.length === 0) {
      return { confidence: 0, reasons: [] };
    }

    const reasons: ConfidenceReason[] = [];
    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const weight = SIGNAL_WEIGHTS[signal.signalType] ?? DEFAULT_WEIGHT;
      const clampedValue = Math.max(0, Math.min(1, signal.rawValue));
      const contribution = weight * clampedValue;

      weightedSum += contribution;
      totalWeight += weight;

      reasons.push({
        signal: signal.signalType,
        weight,
        value: clampedValue,
        description: this.generateDescription(signal.signalType, clampedValue, signal.description),
      });
    }

    const confidence = totalWeight > 0
      ? Math.min(1, Math.max(0, weightedSum / totalWeight))
      : 0;

    // Sort reasons by contribution (highest first)
    reasons.sort((a, b) => (b.weight * b.value) - (a.weight * a.value));

    return { confidence: Math.round(confidence * 1000) / 1000, reasons };
  }

  /** Get the weight for a signal type. */
  getSignalWeight(signalType: string): number {
    return SIGNAL_WEIGHTS[signalType] ?? DEFAULT_WEIGHT;
  }

  /** Generate a human-readable description for a signal contribution. */
  private generateDescription(signalType: string, value: number, rawDesc: string): string {
    const pct = Math.round(value * 100);
    const strength = value >= 0.8 ? 'strong' : value >= 0.5 ? 'moderate' : 'weak';
    return `${strength} ${signalType.replace(/_/g, ' ')} signal (${pct}%): ${rawDesc}`;
  }
}
