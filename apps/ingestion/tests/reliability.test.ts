import { describe, it, expect } from 'vitest';
import { ReliabilityScorer, type FeedMetrics } from '../src/services/reliability.js';

const scorer = new ReliabilityScorer();

describe('ReliabilityScorer — individual scores', () => {
  it('confirmationScore: 50 for new feed (no data)', () => {
    expect(scorer.confirmationScore(0, 0)).toBe(50);
  });

  it('confirmationScore: 80 for 80% confirmed', () => {
    expect(scorer.confirmationScore(100, 80)).toBe(80);
  });

  it('falsePositiveScore: high score for low FP rate', () => {
    expect(scorer.falsePositiveScore(100, 5)).toBe(95);
  });

  it('falsePositiveScore: low score for high FP rate', () => {
    expect(scorer.falsePositiveScore(100, 80)).toBe(20);
  });

  it('freshnessScore: 100 for sub-hour reporting', () => {
    expect(scorer.freshnessScore(0.5)).toBe(100);
  });

  it('freshnessScore: low for 72+ hour delay', () => {
    expect(scorer.freshnessScore(72)).toBe(10);
  });

  it('uptimeScore: 100 for no failures', () => {
    expect(scorer.uptimeScore(0, 5)).toBe(100);
  });

  it('uptimeScore: 0 for max failures', () => {
    expect(scorer.uptimeScore(5, 5)).toBe(0);
  });
});

describe('ReliabilityScorer.calculateReliability', () => {
  it('calculates weighted score from metrics', () => {
    const metrics: FeedMetrics = {
      totalIOCs: 100, confirmedIOCs: 70, falsePositives: 10,
      avgHoursToFirstReport: 2, consecutiveFailures: 0, maxConsecutiveFailures: 5,
    };
    const result = scorer.calculateReliability(metrics);

    expect(result.confirmationRate).toBe(70);
    expect(result.falsePositiveRate).toBe(90); // 1 - 0.10 = 0.90 → 90
    expect(result.uptimeScore).toBe(100);
    expect(result.rawScore).toBeGreaterThan(60);
    expect(result.rawScore).toBeLessThanOrEqual(100);
  });

  it('returns low score for bad feed', () => {
    const metrics: FeedMetrics = {
      totalIOCs: 100, confirmedIOCs: 5, falsePositives: 60,
      avgHoursToFirstReport: 96, consecutiveFailures: 4, maxConsecutiveFailures: 5,
    };
    const result = scorer.calculateReliability(metrics);
    expect(result.rawScore).toBeLessThan(30);
  });
});

describe('ReliabilityScorer.adjustReliability', () => {
  it('smooths score changes with EMA', () => {
    // Current 80, new raw 40, alpha 0.3 → 0.3*40 + 0.7*80 = 12+56 = 68
    expect(scorer.adjustReliability(80, 40, 0.3)).toBe(68);
  });

  it('clamps to 0-100 range', () => {
    expect(scorer.adjustReliability(100, 120, 0.5)).toBe(100);
    expect(scorer.adjustReliability(0, -10, 0.5)).toBe(0);
  });

  it('gradually converges', () => {
    let score = 50;
    score = scorer.adjustReliability(score, 80, 0.3); // 59
    score = scorer.adjustReliability(score, 80, 0.3); // 65
    score = scorer.adjustReliability(score, 80, 0.3); // 70
    expect(score).toBeGreaterThan(65);
    expect(score).toBeLessThan(80);
  });
});
