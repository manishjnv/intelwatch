import { describe, it, expect } from 'vitest';
import { CostPredictor, TOKEN_PRICING, type SubtaskCostConfig } from '../src/services/cost-predictor.js';

describe('CostPredictor', () => {
  const predictor = new CostPredictor();

  const makeConfig = (model: 'haiku' | 'sonnet' | 'opus'): SubtaskCostConfig[] => [
    { category: 'news_feed', subtask: 'classification', model },
    { category: 'news_feed', subtask: 'ioc_extraction', model },
    { category: 'ioc_enrichment', subtask: 'ioc_triage', model },
  ];

  const volume = { articlesPerMonth: 10_000, iocsPerMonth: 5_000 };

  it('all haiku → low cost', () => {
    const result = predictor.estimateMonthlyCost(makeConfig('haiku'), volume);
    expect(result.totalMonthly).toBeGreaterThan(0);
    expect(result.totalMonthly).toBeLessThan(20); // Cheap relative to opus
    expect(result.perSubtask).toHaveLength(3);
  });

  it('all opus → high cost', () => {
    const result = predictor.estimateMonthlyCost(makeConfig('opus'), volume);
    expect(result.totalMonthly).toBeGreaterThan(50);
  });

  it('mixed models → intermediate cost', () => {
    const haikuCost = predictor.estimateMonthlyCost(makeConfig('haiku'), volume).totalMonthly;
    const opusCost = predictor.estimateMonthlyCost(makeConfig('opus'), volume).totalMonthly;
    const sonnetCost = predictor.estimateMonthlyCost(makeConfig('sonnet'), volume).totalMonthly;
    // all-haiku < all-sonnet < all-opus
    expect(haikuCost).toBeLessThan(sonnetCost);
    expect(sonnetCost).toBeLessThan(opusCost);
  });

  it('zero volume → $0', () => {
    const result = predictor.estimateMonthlyCost(makeConfig('sonnet'), {
      articlesPerMonth: 0,
      iocsPerMonth: 0,
    });
    expect(result.totalMonthly).toBe(0);
  });

  it('estimateCostDelta: haiku→sonnet → positive delta', () => {
    const result = predictor.estimateCostDelta(
      makeConfig('haiku'),
      makeConfig('sonnet'),
      volume,
    );
    expect(result.delta).toBeGreaterThan(0);
    expect(result.proposed).toBeGreaterThan(result.current);
  });
});
