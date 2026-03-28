import { describe, it, expect } from 'vitest';
import {
  MODEL_CATALOG,
  PROVIDER_META,
  ALL_SUBTASKS,
  getModelById,
  getModelsByProvider,
  getBestAccuracy,
  getBestCost,
  getAccuracy,
  estimatePerItemCost,
} from '../src/model-registry.js';

describe('MODEL_CATALOG', () => {
  it('contains exactly 9 models', () => {
    expect(MODEL_CATALOG).toHaveLength(9);
  });

  it('covers 3 providers', () => {
    const providers = new Set(MODEL_CATALOG.map(m => m.provider));
    expect(providers).toEqual(new Set(['anthropic', 'openai', 'google']));
  });

  it('every model has benchmarks for all 15 subtasks', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.benchmarks).toHaveLength(ALL_SUBTASKS.length);
      const subtasks = new Set(model.benchmarks.map(b => b.subtask));
      for (const s of ALL_SUBTASKS) {
        expect(subtasks.has(s)).toBe(true);
      }
    }
  });

  it('every model has positive pricing', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.pricing.inputPer1M).toBeGreaterThan(0);
      expect(model.pricing.outputPer1M).toBeGreaterThan(0);
    }
  });

  it('every model has contextWindow > 0', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.contextWindow).toBeGreaterThan(0);
    }
  });

  it('accuracy values are 0-100', () => {
    for (const model of MODEL_CATALOG) {
      for (const bench of model.benchmarks) {
        expect(bench.accuracy).toBeGreaterThanOrEqual(0);
        expect(bench.accuracy).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('getModelsByProvider', () => {
  it('returns 3 Anthropic models', () => {
    const models = getModelsByProvider('anthropic');
    expect(models).toHaveLength(3);
    expect(models.every(m => m.provider === 'anthropic')).toBe(true);
  });

  it('returns 4 OpenAI models', () => {
    expect(getModelsByProvider('openai')).toHaveLength(4);
  });

  it('returns 2 Google models', () => {
    expect(getModelsByProvider('google')).toHaveLength(2);
  });
});

describe('getModelById', () => {
  it('finds claude-sonnet-4-6', () => {
    const model = getModelById('claude-sonnet-4-6');
    expect(model).toBeDefined();
    expect(model!.provider).toBe('anthropic');
    expect(model!.displayName).toBe('Claude Sonnet 4.6');
  });

  it('returns undefined for unknown ID', () => {
    expect(getModelById('nonexistent')).toBeUndefined();
  });
});

describe('getBestAccuracy', () => {
  it('returns the model with highest accuracy for extraction', () => {
    const best = getBestAccuracy('extraction');
    expect(best).toBeDefined();
    // Opus has 96% extraction — should be highest
    expect(best!.id).toBe('claude-opus-4-6');
  });

  it('returns undefined for unknown subtask', () => {
    expect(getBestAccuracy('nonexistent')).toBeUndefined();
  });
});

describe('getBestCost', () => {
  it('returns cheapest model meeting min accuracy', () => {
    const best = getBestCost('triage', 75);
    expect(best).toBeDefined();
    // GPT-4o Mini or Gemini Flash should be cheapest meeting 75%
    expect(best!.pricing.inputPer1M).toBeLessThan(1);
  });

  it('returns cheapest overall when minAccuracy=0', () => {
    const best = getBestCost('triage', 0);
    expect(best).toBeDefined();
    const totalCost = best!.pricing.inputPer1M + best!.pricing.outputPer1M;
    // Should be one of the economy models
    expect(totalCost).toBeLessThan(2);
  });

  it('returns undefined when no model meets threshold', () => {
    expect(getBestCost('triage', 100)).toBeUndefined();
  });
});

describe('getAccuracy', () => {
  it('returns correct accuracy for known model+subtask', () => {
    const acc = getAccuracy('claude-sonnet-4-6', 'risk_scoring');
    expect(acc).toBe(94);
  });

  it('returns 0 for unknown model', () => {
    expect(getAccuracy('unknown', 'triage')).toBe(0);
  });
});

describe('estimatePerItemCost', () => {
  it('calculates cost for Haiku with default tokens', () => {
    const cost = estimatePerItemCost('claude-haiku-4-5');
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01); // Haiku is cheap
  });

  it('calculates cost for Opus with custom tokens', () => {
    const cost = estimatePerItemCost('claude-opus-4-6', 2000, 500);
    expect(cost).toBeGreaterThan(0.05); // Opus is expensive
  });

  it('returns 0 for unknown model', () => {
    expect(estimatePerItemCost('nonexistent')).toBe(0);
  });
});

describe('PROVIDER_META', () => {
  it('has metadata for all 3 providers', () => {
    expect(PROVIDER_META.anthropic.keyPrefix).toBe('sk-ant-');
    expect(PROVIDER_META.openai.keyPrefix).toBe('sk-');
    expect(PROVIDER_META.google.keyPrefix).toBe('AIza');
  });
});
