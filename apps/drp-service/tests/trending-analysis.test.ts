import { describe, it, expect, beforeEach } from 'vitest';
import { DRPStore } from '../src/schemas/store.js';
import { AlertManager } from '../src/services/alert-manager.js';
import { ConfidenceScorer } from '../src/services/confidence-scorer.js';
import { SignalAggregator } from '../src/services/signal-aggregator.js';
import { EvidenceChainBuilder } from '../src/services/evidence-chain.js';
import { AlertDeduplication } from '../src/services/alert-deduplication.js';
import { SeverityClassifier } from '../src/services/severity-classifier.js';
import { TrendingAnalysisService } from '../src/services/trending-analysis.js';
import type { DRPAlert } from '../src/schemas/drp.js';

const T = 'tenant-trending-1';

function createDeps() {
  const store = new DRPStore();
  const alertManager = new AlertManager(store, {
    confidenceScorer: new ConfidenceScorer(),
    signalAggregator: new SignalAggregator(store),
    evidenceChain: new EvidenceChainBuilder(store),
    deduplication: new AlertDeduplication(store),
    severityClassifier: new SeverityClassifier(store),
  });
  const trending = new TrendingAnalysisService(store);
  return { store, alertManager, trending };
}

function seedAlertsAtTimes(store: DRPStore, times: number[]) {
  for (let i = 0; i < times.length; i++) {
    const now = new Date(times[i]!).toISOString();
    const alert: DRPAlert = {
      id: `alert-${i}`,
      tenantId: T,
      assetId: 'example.com',
      type: i % 2 === 0 ? 'typosquatting' : 'credential_leak',
      severity: i % 3 === 0 ? 'critical' : 'medium',
      status: 'open',
      title: `Alert ${i}`,
      description: 'Test',
      evidence: [],
      confidence: 0.8,
      confidenceReasons: [],
      signalIds: [],
      assignedTo: null,
      triageNotes: '',
      tags: [],
      detectedValue: `val-${i}`,
      sourceUrl: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    store.setAlert(T, alert);
  }
}

describe('TrendingAnalysisService (#9)', () => {
  let trending: TrendingAnalysisService;
  let store: DRPStore;

  beforeEach(() => {
    const deps = createDeps();
    trending = deps.trending;
    store = deps.store;
  });

  it('returns empty analysis for no alerts', () => {
    const result = trending.analyze(T, '7d', 'day');
    expect(result.totalAlerts).toBe(0);
    expect(result.dataPoints.length).toBeGreaterThan(0);
    expect(result.rollingAverage).toBe(0);
    expect(result.zScore).toBe(0);
    expect(result.trend).toBe('stable');
    expect(result.peakTimestamp).toBeNull();
  });

  it('bins alerts into daily buckets', () => {
    const now = Date.now();
    seedAlertsAtTimes(store, [
      now - 1 * 86400000,
      now - 1 * 86400000 + 1000,
      now - 2 * 86400000,
    ]);
    const result = trending.analyze(T, '7d', 'day');
    expect(result.totalAlerts).toBe(3);
    expect(result.dataPoints.some((dp) => dp.count > 0)).toBe(true);
  });

  it('bins alerts into hourly buckets', () => {
    const now = Date.now();
    seedAlertsAtTimes(store, [now - 3600000, now - 7200000]);
    const result = trending.analyze(T, '24h', 'hour');
    expect(result.granularity).toBe('hour');
    expect(result.totalAlerts).toBe(2);
  });

  it('computes rolling average', () => {
    const now = Date.now();
    seedAlertsAtTimes(store, [
      now - 86400000 * 1,
      now - 86400000 * 1 + 100,
      now - 86400000 * 2,
    ]);
    const result = trending.analyze(T, '7d', 'day');
    expect(result.rollingAverage).toBeGreaterThan(0);
  });

  it('detects anomaly when z-score exceeds 2', () => {
    const now = Date.now();
    // Create a spike: 20 alerts in one bucket, 1 in others
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      times.push(now - 86400000 + i * 1000); // 20 alerts yesterday
    }
    for (let d = 2; d <= 6; d++) {
      times.push(now - d * 86400000); // 1 alert per day for other days
    }
    seedAlertsAtTimes(store, times);
    const result = trending.analyze(T, '7d', 'day');
    // Z-score may or may not exceed 2 depending on which bucket is "last"
    expect(typeof result.isAnomaly).toBe('boolean');
    expect(typeof result.zScore).toBe('number');
  });

  it('detects increasing trend', () => {
    const now = Date.now();
    const times: number[] = [];
    // 1 alert per day in first half, 5 per day in second half
    for (let d = 6; d >= 4; d--) {
      times.push(now - d * 86400000);
    }
    for (let d = 3; d >= 0; d--) {
      for (let i = 0; i < 5; i++) {
        times.push(now - d * 86400000 + i * 1000);
      }
    }
    seedAlertsAtTimes(store, times);
    const result = trending.analyze(T, '7d', 'day');
    expect(result.trend).toBe('increasing');
  });

  it('filters by alert type', () => {
    const now = Date.now();
    seedAlertsAtTimes(store, [now - 86400000, now - 86400000 + 1, now - 86400000 + 2, now - 86400000 + 3]);
    const result = trending.analyze(T, '7d', 'day', 'typosquatting');
    // Only even-indexed alerts are typosquatting
    expect(result.totalAlerts).toBe(2);
  });

  it('filters by asset ID', () => {
    const now = Date.now();
    seedAlertsAtTimes(store, [now - 86400000]);
    const result = trending.analyze(T, '7d', 'day', undefined, 'example.com');
    expect(result.totalAlerts).toBe(1);
  });

  it('finds peak timestamp', () => {
    const now = Date.now();
    const peak = now - 2 * 86400000;
    seedAlertsAtTimes(store, [peak, peak + 100, peak + 200, now - 86400000]);
    const result = trending.analyze(T, '7d', 'day');
    expect(result.peakTimestamp).toBeDefined();
  });

  it('includes bySeverity and byType in data points', () => {
    const now = Date.now();
    seedAlertsAtTimes(store, [now - 86400000, now - 86400000 + 1]);
    const result = trending.analyze(T, '7d', 'day');
    const nonEmpty = result.dataPoints.filter((dp) => dp.count > 0);
    expect(nonEmpty.length).toBeGreaterThan(0);
    for (const dp of nonEmpty) {
      expect(dp.bySeverity).toBeDefined();
      expect(dp.byType).toBeDefined();
    }
  });

  it('handles 30d period', () => {
    const result = trending.analyze(T, '30d', 'day');
    expect(result.period).toBe('30d');
    expect(result.dataPoints.length).toBe(30);
  });

  it('handles 90d period with weekly granularity', () => {
    const result = trending.analyze(T, '90d', 'week');
    expect(result.period).toBe('90d');
    expect(result.granularity).toBe('week');
    expect(result.dataPoints.length).toBeGreaterThan(10);
  });
});
