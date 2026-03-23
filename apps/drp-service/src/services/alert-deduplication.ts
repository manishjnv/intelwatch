import type { DRPStore } from '../schemas/store.js';
import type { DRPAlert, DRPAlertType, AlertEvidence } from '../schemas/drp.js';

/**
 * #4 Smart Alert Deduplication.
 *
 * Before creating a new alert, checks for existing alerts on the same asset
 * with overlapping detection values. Merges evidence and boosts confidence
 * via corroboration rather than creating duplicates.
 */

const SIMILARITY_THRESHOLDS: Record<string, number> = {
  typosquatting: 1.0,      // exact domain match required
  credential_leak: 1.0,    // exact breach name match
  dark_web_mention: 0.8,   // fuzzy keyword overlap
  social_impersonation: 0.9,
  rogue_app: 0.9,
  exposed_service: 1.0,    // exact host:port match
};

export class AlertDeduplication {
  private readonly store: DRPStore;

  constructor(store: DRPStore) {
    this.store = store;
  }

  /**
   * Find an existing alert that matches the new detection.
   * Returns the duplicate if found, null otherwise.
   */
  findDuplicate(
    tenantId: string,
    assetId: string,
    type: DRPAlertType,
    detectedValue: string,
  ): DRPAlert | null {
    const alerts = this.store.getAlertsByAsset(tenantId, assetId);
    const threshold = SIMILARITY_THRESHOLDS[type] ?? 1.0;

    for (const alert of alerts) {
      if (alert.type !== type) continue;
      if (alert.status === 'resolved' || alert.status === 'false_positive') continue;

      const similarity = this.computeSimilarity(alert.detectedValue, detectedValue, type);
      if (similarity >= threshold) {
        return alert;
      }
    }

    return null;
  }

  /**
   * Merge new evidence into an existing alert and boost confidence.
   * Corroboration from multiple detection runs increases reliability.
   */
  mergeIntoExisting(
    tenantId: string,
    alertId: string,
    newEvidence: AlertEvidence[],
  ): DRPAlert {
    const alert = this.store.getAlert(tenantId, alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found for merge`);
    }

    // Add new evidence
    for (const ev of newEvidence) {
      alert.evidence.push(ev);
    }

    // Boost confidence via corroboration (diminishing returns)
    const corroborationBoost = 0.05 * Math.min(newEvidence.length, 3);
    alert.confidence = Math.min(1, alert.confidence + corroborationBoost);

    // Add corroboration reason
    alert.confidenceReasons.push({
      signal: 'corroboration',
      weight: 0.15,
      value: corroborationBoost / 0.05,
      description: `Corroborated by ${newEvidence.length} additional evidence item(s)`,
    });

    alert.updatedAt = new Date().toISOString();
    this.store.setAlert(tenantId, alert);
    return alert;
  }

  /**
   * Compute similarity between two detected values based on alert type.
   * Returns 0-1 where 1 = exact match.
   */
  private computeSimilarity(
    existing: string,
    incoming: string,
    type: DRPAlertType,
  ): number {
    const normExisting = existing.toLowerCase().trim();
    const normIncoming = incoming.toLowerCase().trim();

    if (normExisting === normIncoming) return 1.0;

    if (type === 'dark_web_mention') {
      // Fuzzy: check word overlap
      const wordsA = new Set(normExisting.split(/\s+/));
      const wordsB = new Set(normIncoming.split(/\s+/));
      const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
      const union = new Set([...wordsA, ...wordsB]);
      return union.size > 0 ? intersection.size / union.size : 0;
    }

    if (type === 'exposed_service') {
      // host:port comparison
      const [hostA, portA] = normExisting.split(':');
      const [hostB, portB] = normIncoming.split(':');
      if (hostA === hostB && portA === portB) return 1.0;
      if (hostA === hostB) return 0.8;
      return 0;
    }

    // Default: Levenshtein-based similarity
    const distance = this.levenshtein(normExisting, normIncoming);
    const maxLen = Math.max(normExisting.length, normIncoming.length);
    return maxLen > 0 ? 1 - distance / maxLen : 1;
  }

  /** Compute Levenshtein edit distance. */
  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i]![j] = a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
    return dp[m]![n]!;
  }
}
