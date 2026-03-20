/**
 * Feed Reliability Auto-Tuner
 * Automatically scores feeds 0-100 based on confirmation rate, false positive rate,
 * freshness, and uptime. Uses exponential moving average to prevent sudden jumps.
 *
 * Differentiator: Anomali/ThreatConnect use static feed reliability set by admins.
 * ETIP auto-tunes based on actual feed performance data, feeding directly into
 * the composite confidence calculation.
 */

export interface FeedMetrics {
  totalIOCs: number;
  confirmedIOCs: number;     // IOCs later seen in 2+ feeds
  falsePositives: number;    // IOCs marked FP by analysts
  avgHoursToFirstReport: number; // avg time this feed reports before others
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
}

export interface ReliabilityBreakdown {
  confirmationRate: number;   // 0-100 weighted 40%
  falsePositiveRate: number;  // 0-100 weighted 30% (inverted: low FP = high score)
  freshnessScore: number;     // 0-100 weighted 20%
  uptimeScore: number;        // 0-100 weighted 10%
  rawScore: number;           // 0-100 before smoothing
  smoothedScore: number;      // 0-100 after EMA smoothing
}

const WEIGHTS = {
  confirmation: 0.40,
  falsePositive: 0.30,
  freshness: 0.20,
  uptime: 0.10,
} as const;

const DEFAULT_SMOOTHING = 0.3; // EMA alpha: 30% new, 70% old

export class ReliabilityScorer {
  /** Calculate confirmation rate score (0-100) */
  confirmationScore(totalIOCs: number, confirmedIOCs: number): number {
    if (totalIOCs === 0) return 50; // neutral for new feeds
    const rate = confirmedIOCs / totalIOCs;
    return Math.min(100, Math.round(rate * 100));
  }

  /** Calculate false positive score (0-100, inverted: low FP = high score) */
  falsePositiveScore(totalIOCs: number, falsePositives: number): number {
    if (totalIOCs === 0) return 50;
    const fpRate = falsePositives / totalIOCs;
    return Math.max(0, Math.round((1 - fpRate) * 100));
  }

  /** Calculate freshness score (0-100) based on avg hours to first report */
  freshnessScore(avgHoursToFirstReport: number): number {
    // < 1 hour = 100, 6 hours = 75, 24 hours = 50, 72+ hours = 10
    if (avgHoursToFirstReport <= 0) return 50;
    if (avgHoursToFirstReport <= 1) return 100;
    if (avgHoursToFirstReport >= 72) return 10;
    // Logarithmic decay
    return Math.max(10, Math.round(100 - 21 * Math.log(avgHoursToFirstReport)));
  }

  /** Calculate uptime score (0-100) based on consecutive failures */
  uptimeScore(consecutiveFailures: number, maxFailures: number): number {
    if (maxFailures <= 0) return 100;
    const ratio = Math.min(1, consecutiveFailures / maxFailures);
    return Math.round((1 - ratio) * 100);
  }

  /** Calculate full reliability score from metrics */
  calculateReliability(metrics: FeedMetrics): ReliabilityBreakdown {
    const confirmation = this.confirmationScore(metrics.totalIOCs, metrics.confirmedIOCs);
    const falsePositive = this.falsePositiveScore(metrics.totalIOCs, metrics.falsePositives);
    const freshness = this.freshnessScore(metrics.avgHoursToFirstReport);
    const uptime = this.uptimeScore(metrics.consecutiveFailures, metrics.maxConsecutiveFailures);

    const rawScore = Math.round(
      confirmation * WEIGHTS.confirmation +
      falsePositive * WEIGHTS.falsePositive +
      freshness * WEIGHTS.freshness +
      uptime * WEIGHTS.uptime,
    );

    return {
      confirmationRate: confirmation,
      falsePositiveRate: falsePositive,
      freshnessScore: freshness,
      uptimeScore: uptime,
      rawScore: Math.min(100, Math.max(0, rawScore)),
      smoothedScore: rawScore, // caller should use adjustReliability for smoothing
    };
  }

  /** Apply exponential moving average to prevent sudden score jumps */
  adjustReliability(currentScore: number, newScore: number, alpha: number = DEFAULT_SMOOTHING): number {
    const smoothed = alpha * newScore + (1 - alpha) * currentScore;
    return Math.min(100, Math.max(0, Math.round(smoothed)));
  }
}
