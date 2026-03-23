import type { DRPStore } from '../schemas/store.js';
import type { TrendingDataPoint, TrendingAnalysis } from '../schemas/p1-p2.js';

const PERIOD_MS: Record<string, number> = {
  '24h': 24 * 3600000,
  '7d': 7 * 24 * 3600000,
  '30d': 30 * 24 * 3600000,
  '90d': 90 * 24 * 3600000,
};

const GRANULARITY_MS: Record<string, number> = {
  hour: 3600000,
  day: 86400000,
  week: 7 * 86400000,
};

/** #9 Trending risk analysis — time-series threat counts, rolling averages, z-score anomaly. */
export class TrendingAnalysisService {
  private readonly store: DRPStore;

  constructor(store: DRPStore) {
    this.store = store;
  }

  /** Analyze alert trends over a time period. */
  analyze(
    tenantId: string,
    period: string,
    granularity: string,
    alertType?: string,
    assetId?: string,
  ): TrendingAnalysis {
    const periodMs = PERIOD_MS[period] ?? PERIOD_MS['7d']!;
    const granMs = GRANULARITY_MS[granularity] ?? GRANULARITY_MS['day']!;
    const now = Date.now();
    const start = now - periodMs;

    // Get alerts in time window
    let alerts = Array.from(this.store.getTenantAlerts(tenantId).values())
      .filter((a) => new Date(a.createdAt).getTime() >= start);

    if (alertType) alerts = alerts.filter((a) => a.type === alertType);
    if (assetId) alerts = alerts.filter((a) => a.assetId === assetId);

    // Build time-series buckets
    const bucketCount = Math.ceil(periodMs / granMs);
    const dataPoints: TrendingDataPoint[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = start + i * granMs;
      const bucketEnd = bucketStart + granMs;
      const bucketAlerts = alerts.filter((a) => {
        const t = new Date(a.createdAt).getTime();
        return t >= bucketStart && t < bucketEnd;
      });

      const bySeverity: Record<string, number> = {};
      const byType: Record<string, number> = {};
      for (const a of bucketAlerts) {
        bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
        byType[a.type] = (byType[a.type] ?? 0) + 1;
      }

      dataPoints.push({
        timestamp: new Date(bucketStart).toISOString(),
        count: bucketAlerts.length,
        bySeverity,
        byType,
      });
    }

    // Calculate rolling average and z-score
    const counts = dataPoints.map((dp) => dp.count);
    const rollingAverage = this.rollingAverage(counts);
    const zScore = this.zScore(counts);
    const trend = this.detectTrend(counts);

    // Find peak
    let peakTimestamp: string | null = null;
    let maxCount = 0;
    for (const dp of dataPoints) {
      if (dp.count > maxCount) {
        maxCount = dp.count;
        peakTimestamp = dp.timestamp;
      }
    }

    return {
      period,
      granularity,
      dataPoints,
      rollingAverage,
      zScore,
      isAnomaly: Math.abs(zScore) > 2.0,
      trend,
      totalAlerts: alerts.length,
      peakTimestamp,
    };
  }

  /** Compute rolling average of last 3 data points. */
  private rollingAverage(counts: number[]): number {
    if (counts.length === 0) return 0;
    const window = counts.slice(-3);
    return window.reduce((s, c) => s + c, 0) / window.length;
  }

  /** Z-score of the last data point relative to the series. */
  private zScore(counts: number[]): number {
    if (counts.length < 2) return 0;
    const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
    const variance = counts.reduce((s, c) => s + (c - mean) ** 2, 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    const lastValue = counts[counts.length - 1]!;
    return (lastValue - mean) / stdDev;
  }

  /** Simple trend detection from first half vs second half. */
  private detectTrend(counts: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (counts.length < 4) return 'stable';
    const mid = Math.floor(counts.length / 2);
    const firstHalf = counts.slice(0, mid).reduce((s, c) => s + c, 0) / mid;
    const secondHalf = counts.slice(mid).reduce((s, c) => s + c, 0) / (counts.length - mid);
    const ratio = firstHalf > 0 ? secondHalf / firstHalf : secondHalf > 0 ? 2 : 1;
    if (ratio > 1.2) return 'increasing';
    if (ratio < 0.8) return 'decreasing';
    return 'stable';
  }
}
