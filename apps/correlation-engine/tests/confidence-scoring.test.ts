import { describe, it, expect, beforeEach } from 'vitest';
import { ConfidenceScoringService } from '../src/services/confidence-scoring.js';

describe('Correlation Engine — #6 ConfidenceScoringService', () => {
  let svc: ConfidenceScoringService;

  beforeEach(() => {
    svc = new ConfidenceScoringService();
  });

  it('1. normalizeEvidence returns 0 for count <= 0', () => {
    expect(svc.normalizeEvidence(0)).toBe(0);
    expect(svc.normalizeEvidence(-1)).toBe(0);
  });

  it('2. normalizeEvidence caps at 1.0 for large counts', () => {
    expect(svc.normalizeEvidence(100)).toBe(1);
  });

  it('3. normalizeEvidence uses sqrt scaling (diminishing returns)', () => {
    const score5 = svc.normalizeEvidence(5);
    const score20 = svc.normalizeEvidence(20);
    expect(score5).toBeLessThan(score20);
    expect(score20).toBe(1); // sqrt(20)/sqrt(20) = 1
  });

  it('4. normalizeFreshness returns 1.0 for hoursOld=0', () => {
    expect(svc.normalizeFreshness(0)).toBe(1);
  });

  it('5. normalizeFreshness returns 0 for hoursOld >= maxHours', () => {
    expect(svc.normalizeFreshness(168, 168)).toBe(0);
    expect(svc.normalizeFreshness(200, 168)).toBe(0);
  });

  it('6. computeScore returns value between 0 and 1', () => {
    const score = svc.computeScore({
      evidenceCount: 10,
      sourceDiversity: 0.7,
      freshnessHours: 12,
      enrichmentQuality: 0.8,
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('7. computeScore varies with different inputs', () => {
    const highScore = svc.computeScore({
      evidenceCount: 20, sourceDiversity: 1.0, freshnessHours: 0, enrichmentQuality: 1.0,
    });
    const lowScore = svc.computeScore({
      evidenceCount: 1, sourceDiversity: 0.1, freshnessHours: 100, enrichmentQuality: 0.1,
    });
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it('8. batchScore returns scores for multiple items', () => {
    const results = svc.batchScore([
      { id: 'a', inputs: { evidenceCount: 5, sourceDiversity: 0.5, freshnessHours: 6, enrichmentQuality: 0.7 } },
      { id: 'b', inputs: { evidenceCount: 15, sourceDiversity: 0.9, freshnessHours: 1, enrichmentQuality: 0.9 } },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe('a');
    expect(results[1]!.score).toBeGreaterThan(results[0]!.score);
  });
});
