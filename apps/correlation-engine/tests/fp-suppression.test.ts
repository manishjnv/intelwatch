import { describe, it, expect, beforeEach } from 'vitest';
import { FPSuppressionService } from '../src/services/fp-suppression.js';
import type { FPFeedback, RuleStats, CorrelationResult } from '../src/schemas/correlation.js';

function makeResult(overrides: Partial<CorrelationResult>): CorrelationResult {
  return {
    id: 'r1', tenantId: 't1', correlationType: 'cooccurrence', severity: 'HIGH',
    confidence: 0.8, entities: [], metadata: {}, suppressed: false,
    ruleId: 'test-rule', createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Correlation Engine — #9 FPSuppressionService', () => {
  let svc: FPSuppressionService;
  let feedbackStore: FPFeedback[];
  let ruleStatsStore: Map<string, RuleStats>;

  beforeEach(() => {
    svc = new FPSuppressionService({ fpThreshold: 0.7, minSamples: 5 });
    feedbackStore = [];
    ruleStatsStore = new Map();
  });

  it('1. recordFeedback stores feedback and returns it', () => {
    const fb = svc.recordFeedback('t1', 'corr-1', 'true_positive', 'analyst-1', feedbackStore, ruleStatsStore, 'rule-1');
    expect(fb.verdict).toBe('true_positive');
    expect(fb.tenantId).toBe('t1');
    expect(feedbackStore).toHaveLength(1);
  });

  it('2. updateRuleStats increments TP count', () => {
    svc.updateRuleStats('rule-1', 'true_positive', ruleStatsStore);
    const stats = ruleStatsStore.get('rule-1')!;
    expect(stats.tpCount).toBe(1);
    expect(stats.fpCount).toBe(0);
    expect(stats.fpRate).toBe(0);
  });

  it('3. updateRuleStats increments FP count and computes rate', () => {
    svc.updateRuleStats('rule-1', 'false_positive', ruleStatsStore);
    svc.updateRuleStats('rule-1', 'true_positive', ruleStatsStore);
    const stats = ruleStatsStore.get('rule-1')!;
    expect(stats.fpCount).toBe(1);
    expect(stats.tpCount).toBe(1);
    expect(stats.fpRate).toBe(0.5);
  });

  it('4. shouldSuppress returns false when below minSamples', () => {
    const stats: RuleStats = { ruleId: 'r1', totalResults: 3, fpCount: 3, tpCount: 0, fpRate: 1.0, suppressed: false };
    expect(svc.shouldSuppress(stats)).toBe(false); // 3 < 5 minSamples
  });

  it('5. shouldSuppress returns true when FP rate exceeds threshold', () => {
    const stats: RuleStats = { ruleId: 'r1', totalResults: 5, fpCount: 4, tpCount: 1, fpRate: 0.8, suppressed: false };
    expect(svc.shouldSuppress(stats)).toBe(true); // 0.8 >= 0.7
  });

  it('6. auto-suppresses after enough false positives', () => {
    // Submit 5 false positives
    for (let i = 0; i < 5; i++) {
      svc.updateRuleStats('rule-1', 'false_positive', ruleStatsStore);
    }
    const stats = ruleStatsStore.get('rule-1')!;
    expect(stats.suppressed).toBe(true);
    expect(stats.fpRate).toBe(1.0);
  });

  it('7. applySuppression marks results from suppressed rules', () => {
    ruleStatsStore.set('bad-rule', { ruleId: 'bad-rule', totalResults: 10, fpCount: 9, tpCount: 1, fpRate: 0.9, suppressed: true });
    const results = [
      makeResult({ id: 'r1', ruleId: 'bad-rule' }),
      makeResult({ id: 'r2', ruleId: 'good-rule' }),
    ];
    const suppressed = svc.applySuppression(results, ruleStatsStore);
    expect(suppressed[0]!.suppressed).toBe(true);
    expect(suppressed[1]!.suppressed).toBe(false);
  });

  it('8. getSuppressedRuleIds returns only suppressed rules', () => {
    ruleStatsStore.set('bad', { ruleId: 'bad', totalResults: 10, fpCount: 8, tpCount: 2, fpRate: 0.8, suppressed: true });
    ruleStatsStore.set('good', { ruleId: 'good', totalResults: 10, fpCount: 1, tpCount: 9, fpRate: 0.1, suppressed: false });

    const suppressed = svc.getSuppressedRuleIds(ruleStatsStore);
    expect(suppressed).toEqual(['bad']);
  });
});
