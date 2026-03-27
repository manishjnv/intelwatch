import { describe, it, expect } from 'vitest';
import {
  toLogOdds,
  fromLogOdds,
  calculateBayesianConfidence,
  selectConfidenceModel,
} from '../src/bayesian-confidence.js';
import { calculateCompositeConfidence } from '../src/confidence.js';

// ── toLogOdds ────────────────────────────────────────────────────
describe('toLogOdds', () => {
  it('0.5 → 0 (uninformed prior)', () => {
    expect(toLogOdds(0.5)).toBeCloseTo(0, 5);
  });

  it('0.9 → ~2.2', () => {
    expect(toLogOdds(0.9)).toBeCloseTo(2.197, 2);
  });

  it('0.1 → ~-2.2', () => {
    expect(toLogOdds(0.1)).toBeCloseTo(-2.197, 2);
  });

  it('clamps 0 to 0.01', () => {
    const result = toLogOdds(0);
    expect(result).toBeCloseTo(toLogOdds(0.01), 5);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('clamps 1 to 0.99', () => {
    const result = toLogOdds(1);
    expect(result).toBeCloseTo(toLogOdds(0.99), 5);
    expect(Number.isFinite(result)).toBe(true);
  });
});

// ── fromLogOdds ──────────────────────────────────────────────────
describe('fromLogOdds', () => {
  it('round-trips with toLogOdds', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(fromLogOdds(toLogOdds(p))).toBeCloseTo(p, 5);
    }
  });

  it('0 → 0.5', () => {
    expect(fromLogOdds(0)).toBeCloseTo(0.5, 5);
  });
});

// ── calculateBayesianConfidence ──────────────────────────────────
describe('calculateBayesianConfidence', () => {
  it('all signals at 50 → approximately 50', () => {
    const result = calculateBayesianConfidence({
      feedReliability: 50, corroboration: 50, aiScore: 50,
      daysSinceLastSeen: 0,
    });
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.score).toBeLessThanOrEqual(55);
  });

  it('all signals at 90 → score >85', () => {
    const result = calculateBayesianConfidence({
      feedReliability: 90, corroboration: 90, aiScore: 90,
      daysSinceLastSeen: 0,
    });
    expect(result.score).toBeGreaterThan(85);
  });

  it('all signals at 10 → score <15', () => {
    const result = calculateBayesianConfidence({
      feedReliability: 10, corroboration: 10, aiScore: 10,
      daysSinceLastSeen: 0,
    });
    expect(result.score).toBeLessThan(15);
  });

  it('2 high-reliability > 4 low-reliability (multiplicative not additive)', () => {
    const highQuality = calculateBayesianConfidence({
      feedReliability: 90, corroboration: 90, aiScore: 70,
      daysSinceLastSeen: 0,
    });
    const lowQuality = calculateBayesianConfidence({
      feedReliability: 40, corroboration: 40, aiScore: 40,
      daysSinceLastSeen: 0,
    });
    expect(highQuality.score).toBeGreaterThan(lowQuality.score);
  });

  it('decay reduces score over time', () => {
    const fresh = calculateBayesianConfidence({
      feedReliability: 80, corroboration: 80, aiScore: 80,
      daysSinceLastSeen: 0,
    });
    const aged = calculateBayesianConfidence({
      feedReliability: 80, corroboration: 80, aiScore: 80,
      daysSinceLastSeen: 30,
    });
    expect(aged.score).toBeLessThan(fresh.score);
  });

  it('IP decays faster than SHA256', () => {
    const ipScore = calculateBayesianConfidence({
      feedReliability: 80, corroboration: 80, aiScore: 80,
      daysSinceLastSeen: 30, iocType: 'ip',
    });
    const hashScore = calculateBayesianConfidence({
      feedReliability: 80, corroboration: 80, aiScore: 80,
      daysSinceLastSeen: 30, iocType: 'hash_sha256',
    });
    expect(ipScore.score).toBeLessThan(hashScore.score);
  });

  it('result always clamped 0-100', () => {
    const low = calculateBayesianConfidence({
      feedReliability: 1, corroboration: 1, aiScore: 1,
      daysSinceLastSeen: 365,
    });
    const high = calculateBayesianConfidence({
      feedReliability: 99, corroboration: 99, aiScore: 99,
      daysSinceLastSeen: 0,
    });
    expect(low.score).toBeGreaterThanOrEqual(0);
    expect(low.score).toBeLessThanOrEqual(100);
    expect(high.score).toBeGreaterThanOrEqual(0);
    expect(high.score).toBeLessThanOrEqual(100);
  });

  it('returns valid CompositeConfidence shape', () => {
    const result = calculateBayesianConfidence({
      feedReliability: 70, corroboration: 60, aiScore: 80,
      daysSinceLastSeen: 5,
    });
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('daysSinceLastSeen');
    expect(result).toHaveProperty('decayFactor');
    expect(result.signals.feedReliability).toBe(70);
    expect(result.signals.corroboration).toBe(60);
    expect(result.signals.aiScore).toBe(80);
    expect(result.daysSinceLastSeen).toBe(5);
  });
});

// ── selectConfidenceModel ────────────────────────────────────────
describe('selectConfidenceModel', () => {
  it('"bayesian" returns Bayesian function', () => {
    const calc = selectConfidenceModel('bayesian');
    const result = calc({ feedReliability: 80, corroboration: 80, aiScore: 80 }, 0);
    // Bayesian model should produce different result from linear
    expect(result.score).toBeGreaterThan(0);
  });

  it('"linear" returns existing linear function', () => {
    const calc = selectConfidenceModel('linear');
    const result = calc({ feedReliability: 80, corroboration: 80, aiScore: 80 }, 0);
    const direct = calculateCompositeConfidence({ feedReliability: 80, corroboration: 80, aiScore: 80 }, 0);
    expect(result.score).toBe(direct.score);
  });

  it('both models accept same input shape (interface compatibility)', () => {
    const input = { feedReliability: 70, corroboration: 60, aiScore: 50 };
    const bayesian = selectConfidenceModel('bayesian')(input, 10, 'ip');
    const linear = selectConfidenceModel('linear')(input, 10, 'ip');
    // Both return CompositeConfidence
    expect(bayesian).toHaveProperty('score');
    expect(linear).toHaveProperty('score');
    expect(bayesian).toHaveProperty('decayFactor');
    expect(linear).toHaveProperty('decayFactor');
  });

  it('bayesian gives higher score than linear for corroborated IOCs', () => {
    const input = { feedReliability: 90, corroboration: 90, aiScore: 85 };
    const bayesian = selectConfidenceModel('bayesian')(input, 0);
    const linear = selectConfidenceModel('linear')(input, 0);
    expect(bayesian.score).toBeGreaterThanOrEqual(linear.score);
  });

  it('bayesian gives lower score than linear for single-source IOCs', () => {
    const input = { feedReliability: 30, corroboration: 10, aiScore: 20 };
    const bayesian = selectConfidenceModel('bayesian')(input, 0);
    const linear = selectConfidenceModel('linear')(input, 0);
    expect(bayesian.score).toBeLessThanOrEqual(linear.score);
  });
});
