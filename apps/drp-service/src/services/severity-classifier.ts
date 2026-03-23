import type { DRPStore } from '../schemas/store.js';
import type { DRPSeverity, DRPAlertType } from '../schemas/drp.js';

/**
 * #5 Multi-Factor Severity Classification.
 *
 * Replaces simple threshold-based severity with a multi-factor classifier.
 * Factors: confidence score, asset criticality, signal count, alert type,
 * and historical repeat detection. Produces actionable severity ratings.
 */

const TYPE_RISK_WEIGHTS: Record<string, number> = {
  credential_leak: 0.9,
  exposed_service: 0.8,
  typosquatting: 0.7,
  dark_web_mention: 0.6,
  social_impersonation: 0.5,
  rogue_app: 0.5,
};

interface ClassificationInput {
  confidence: number;
  assetCriticality: number;
  signalCount: number;
  alertType: DRPAlertType;
  isRepeatDetection?: boolean;
}

export class SeverityClassifier {
  private readonly store: DRPStore;

  constructor(store: DRPStore) {
    this.store = store;
  }

  /**
   * Classify severity based on multiple factors.
   * Returns a severity level from critical to info.
   */
  classify(input: ClassificationInput): DRPSeverity {
    const score = this.computeCompositeScore(input);

    if (score >= 0.85) return 'critical';
    if (score >= 0.65) return 'high';
    if (score >= 0.40) return 'medium';
    if (score >= 0.20) return 'low';
    return 'info';
  }

  /**
   * Compute composite severity score (0-1) from multiple factors.
   *
   * Weights:
   * - Confidence: 35% — how reliable the detection is
   * - Asset criticality: 25% — how important the asset is
   * - Type risk: 20% — inherent risk of the alert type
   * - Signal density: 10% — number of corroborating signals
   * - Repeat detection: 10% — has been detected before
   */
  computeCompositeScore(input: ClassificationInput): number {
    const typeRisk = TYPE_RISK_WEIGHTS[input.alertType] ?? 0.5;
    const signalDensity = Math.min(1, input.signalCount / 5);
    const repeatBoost = input.isRepeatDetection ? 1.0 : 0.0;

    const score =
      input.confidence * 0.35 +
      input.assetCriticality * 0.25 +
      typeRisk * 0.20 +
      signalDensity * 0.10 +
      repeatBoost * 0.10;

    return Math.min(1, Math.max(0, score));
  }

  /** Check if this is a repeat detection for the same asset and type. */
  isRepeat(tenantId: string, assetId: string, alertType: DRPAlertType): boolean {
    const alerts = this.store.getAlertsByAsset(tenantId, assetId);
    return alerts.some(
      (a) => a.type === alertType && (a.status === 'open' || a.status === 'investigating'),
    );
  }

  /** Get severity classification reasons. */
  getClassificationReasons(input: ClassificationInput): Array<{
    factor: string;
    weight: number;
    value: number;
    contribution: number;
  }> {
    const typeRisk = TYPE_RISK_WEIGHTS[input.alertType] ?? 0.5;
    const signalDensity = Math.min(1, input.signalCount / 5);
    const repeatValue = input.isRepeatDetection ? 1.0 : 0.0;

    return [
      { factor: 'confidence', weight: 0.35, value: input.confidence, contribution: input.confidence * 0.35 },
      { factor: 'asset_criticality', weight: 0.25, value: input.assetCriticality, contribution: input.assetCriticality * 0.25 },
      { factor: 'type_risk', weight: 0.20, value: typeRisk, contribution: typeRisk * 0.20 },
      { factor: 'signal_density', weight: 0.10, value: signalDensity, contribution: signalDensity * 0.10 },
      { factor: 'repeat_detection', weight: 0.10, value: repeatValue, contribution: repeatValue * 0.10 },
    ];
  }
}
