import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from '../src/services/cost-tracker.js';

let tracker: CostTracker;

beforeEach(() => { tracker = new CostTracker(); });

describe('CostTracker.calculateStageCost', () => {
  it('calculates Haiku triage cost correctly', () => {
    // 500 input + 100 output tokens
    // Input: 500/1M * $0.25 = $0.000125
    // Output: 100/1M * $1.25 = $0.000125
    // Total: $0.00025
    const cost = tracker.calculateStageCost(500, 100, 'haiku');
    expect(cost).toBeCloseTo(0.00025, 6);
  });

  it('calculates Sonnet extraction cost correctly', () => {
    // 2000 input + 500 output
    // Input: 2000/1M * $3 = $0.006
    // Output: 500/1M * $15 = $0.0075
    // Total: $0.0135
    const cost = tracker.calculateStageCost(2000, 500, 'sonnet');
    expect(cost).toBeCloseTo(0.0135, 4);
  });

  it('calculates Opus cost correctly', () => {
    const cost = tracker.calculateStageCost(1000, 200, 'opus');
    // Input: 1000/1M * $15 = $0.015
    // Output: 200/1M * $75 = $0.015
    expect(cost).toBeCloseTo(0.03, 4);
  });
});

describe('CostTracker.trackStage', () => {
  it('records stage and returns record', () => {
    const record = tracker.trackStage('article-1', 'triage', 500, 100, 'haiku');
    expect(record.stage).toBe('triage');
    expect(record.costUsd).toBeGreaterThan(0);
  });
});

describe('CostTracker.getArticleCost', () => {
  it('returns full breakdown for an article', () => {
    tracker.trackStage('a1', 'triage', 500, 100, 'haiku');
    tracker.trackStage('a1', 'extraction', 2000, 500, 'sonnet');
    tracker.trackStage('a1', 'external_api', 0, 0, 'haiku');

    const cost = tracker.getArticleCost('a1');
    expect(cost.stages).toHaveLength(3);
    expect(cost.totalTokens).toBe(500 + 100 + 2000 + 500);
    expect(cost.totalCostUsd).toBeGreaterThan(0);
    expect(cost.externalApiCalls).toBe(1);
  });

  it('returns zero for unknown article', () => {
    const cost = tracker.getArticleCost('unknown');
    expect(cost.totalCostUsd).toBe(0);
    expect(cost.stages).toHaveLength(0);
  });
});

describe('CostTracker — tenant budget', () => {
  it('tracks tenant spend', () => {
    tracker.addTenantSpend('t1', 0.50);
    tracker.addTenantSpend('t1', 0.30);
    expect(tracker.getTenantSpend('t1')).toBeCloseTo(0.80, 2);
  });

  it('returns 0 for unknown tenant', () => {
    expect(tracker.getTenantSpend('unknown')).toBe(0);
  });

  it('detects over-budget', () => {
    tracker.addTenantSpend('t1', 10.00);
    const alert = tracker.checkBudgetAlert('t1', 5.00);
    expect(alert.isOverBudget).toBe(true);
    expect(alert.percentUsed).toBe(200);
  });

  it('detects under-budget', () => {
    tracker.addTenantSpend('t1', 2.50);
    const alert = tracker.checkBudgetAlert('t1', 10.00);
    expect(alert.isOverBudget).toBe(false);
    expect(alert.percentUsed).toBe(25);
  });
});

describe('CostTracker.getPricing', () => {
  it('returns model pricing info', () => {
    const pricing = CostTracker.getPricing();
    expect(pricing.haiku.input).toBe(0.25);
    expect(pricing.sonnet.output).toBe(15.00);
    expect(pricing.opus.input).toBe(15.00);
  });
});
