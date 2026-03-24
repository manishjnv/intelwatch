/**
 * @module services/trend-calculator
 * @description Computes trend data from time-series snapshots.
 * Calculates day-over-day and week-over-week deltas with percentage change.
 */

export interface TrendPoint {
  timestamp: string;
  value: number;
}

export interface TrendSeries {
  metric: string;
  label: string;
  points: TrendPoint[];
  currentValue: number;
  previousValue: number;
  delta: number;
  deltaPercent: number;
  direction: 'up' | 'down' | 'flat';
}

export interface TrendSnapshot {
  metric: string;
  value: number;
  timestamp: number;
}

/** In-memory trend data store with configurable retention. */
export class TrendCalculator {
  private snapshots = new Map<string, TrendSnapshot[]>();
  private readonly maxRetentionDays: number;

  constructor(maxRetentionDays = 90) {
    this.maxRetentionDays = maxRetentionDays;
  }

  /** Record a metric value at a point in time. */
  record(metric: string, value: number, timestamp?: number): void {
    const ts = timestamp ?? Date.now();
    const list = this.snapshots.get(metric) ?? [];
    list.push({ metric, value, timestamp: ts });
    this.snapshots.set(metric, list);
  }

  /** Get trend series for a metric over the last N days. */
  getTrend(metric: string, days: number): TrendSeries | null {
    const list = this.snapshots.get(metric);
    if (!list || list.length === 0) return null;

    const cutoff = Date.now() - days * 86_400_000;
    const filtered = list.filter(s => s.timestamp >= cutoff);
    if (filtered.length === 0) return null;

    const points: TrendPoint[] = filtered.map(s => ({
      timestamp: new Date(s.timestamp).toISOString(),
      value: s.value,
    }));

    const last = filtered[filtered.length - 1]!;
    const first = filtered[0]!;
    const currentValue = last.value;
    const previousValue = filtered.length > 1 ? first.value : currentValue;
    const delta = currentValue - previousValue;
    const deltaPercent = previousValue !== 0 ? (delta / previousValue) * 100 : 0;

    return {
      metric,
      label: metricLabel(metric),
      points,
      currentValue,
      previousValue,
      delta,
      deltaPercent: Math.round(deltaPercent * 10) / 10,
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    };
  }

  /** Get all available metrics. */
  getMetrics(): string[] {
    return [...this.snapshots.keys()];
  }

  /** Get trends for all recorded metrics. */
  getAllTrends(days: number): TrendSeries[] {
    const result: TrendSeries[] = [];
    for (const metric of this.snapshots.keys()) {
      const trend = this.getTrend(metric, days);
      if (trend) result.push(trend);
    }
    return result;
  }

  /** Purge data older than retention period. */
  purgeOld(): number {
    const cutoff = Date.now() - this.maxRetentionDays * 86_400_000;
    let purged = 0;
    for (const [metric, list] of this.snapshots.entries()) {
      const before = list.length;
      const filtered = list.filter(s => s.timestamp >= cutoff);
      if (filtered.length === 0) {
        this.snapshots.delete(metric);
      } else {
        this.snapshots.set(metric, filtered);
      }
      purged += before - filtered.length;
    }
    return purged;
  }

  /** Total snapshot count across all metrics. */
  totalSnapshots(): number {
    let total = 0;
    for (const list of this.snapshots.values()) total += list.length;
    return total;
  }

  /** Seed demo trend data for a metric over N days. */
  seedDemo(metric: string, baseValue: number, variance: number, days: number): void {
    const now = Date.now();
    for (let d = days; d >= 0; d--) {
      const ts = now - d * 86_400_000;
      const jitter = (Math.random() - 0.5) * 2 * variance;
      this.record(metric, Math.max(0, Math.round(baseValue + jitter)), ts);
    }
  }
}

function metricLabel(metric: string): string {
  const labels: Record<string, string> = {
    'ioc.total': 'Total IOCs',
    'ioc.critical': 'Critical IOCs',
    'feed.active': 'Active Feeds',
    'feed.articles': 'Articles Ingested',
    'alert.open': 'Open Alerts',
    'alert.total': 'Total Alerts',
    'enrichment.rate': 'Enrichment Rate (%)',
    'enrichment.time': 'Avg Enrichment Time (ms)',
    'actor.active': 'Active Threat Actors',
    'malware.families': 'Malware Families',
    'vuln.critical': 'Critical Vulnerabilities',
    'correlation.matches': 'Correlation Matches',
    'processing.rate': 'IOCs/Hour',
  };
  return labels[metric] ?? metric;
}
