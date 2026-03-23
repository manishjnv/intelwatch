/**
 * #3 — Temporal Wave Detection
 * Z-score anomaly detection on IOC volume spikes.
 * Statistical approach: flags spikes where z > configurable threshold.
 */
import { randomUUID } from 'crypto';
import type { CorrelatedIOC, TemporalWave } from '../schemas/correlation.js';

export interface TemporalWaveConfig {
  zScoreThreshold: number;
  bucketSizeMs: number; // Default 1 hour
  minBuckets: number;   // Minimum data points for valid stats
}

const DEFAULT_CONFIG: TemporalWaveConfig = {
  zScoreThreshold: 2.0,
  bucketSizeMs: 3600 * 1000,
  minBuckets: 6,
};

interface TimeBucket {
  timestamp: number;
  count: number;
  iocIds: string[];
}

export class TemporalWaveService {
  private readonly config: TemporalWaveConfig;

  constructor(config: Partial<TemporalWaveConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Compute mean of an array */
  mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /** Compute standard deviation */
  stddev(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  /** Compute z-score for a single value */
  zScore(value: number, mean: number, stddev: number): number {
    if (stddev === 0) return value > mean ? Infinity : 0;
    return (value - mean) / stddev;
  }

  /** Bucket IOCs by time intervals */
  bucketize(tenantId: string, iocs: Map<string, CorrelatedIOC>, windowHours: number): TimeBucket[] {
    const now = Date.now();
    const windowMs = windowHours * 3600 * 1000;
    const buckets = new Map<number, TimeBucket>();

    for (const ioc of iocs.values()) {
      if (ioc.tenantId !== tenantId) continue;
      const seen = new Date(ioc.firstSeen).getTime();
      if (now - seen > windowMs) continue;

      const bucketKey = Math.floor(seen / this.config.bucketSizeMs) * this.config.bucketSizeMs;
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { timestamp: bucketKey, count: 0, iocIds: [] });
      }
      const bucket = buckets.get(bucketKey)!;
      bucket.count++;
      bucket.iocIds.push(ioc.id);
    }

    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Detect anomalous volume spikes using z-score */
  detectWaves(tenantId: string, iocs: Map<string, CorrelatedIOC>, windowHours: number): TemporalWave[] {
    const buckets = this.bucketize(tenantId, iocs, windowHours);
    if (buckets.length < this.config.minBuckets) return [];

    const counts = buckets.map((b) => b.count);
    const avg = this.mean(counts);
    const sd = this.stddev(counts);

    const waves: TemporalWave[] = [];

    for (const bucket of buckets) {
      const z = this.zScore(bucket.count, avg, sd);
      if (z >= this.config.zScoreThreshold) {
        waves.push({
          id: randomUUID(),
          tenantId,
          startTime: new Date(bucket.timestamp).toISOString(),
          endTime: new Date(bucket.timestamp + this.config.bucketSizeMs).toISOString(),
          peakTime: new Date(bucket.timestamp + this.config.bucketSizeMs / 2).toISOString(),
          zScore: Math.round(z * 1000) / 1000,
          iocCount: bucket.count,
          iocIds: bucket.iocIds,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    return waves.sort((a, b) => b.zScore - a.zScore);
  }
}
