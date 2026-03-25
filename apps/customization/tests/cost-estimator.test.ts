import { describe, it, expect, beforeEach } from 'vitest';
import { CostEstimator } from '../src/services/cost-estimator.js';
import { AI_CTI_SUBTASKS, RECOMMENDED_SUBTASK_MODELS } from '../src/schemas/customization.js';

const ARTICLES = 1000;

describe('CostEstimator', () => {
  let estimator: CostEstimator;

  beforeEach(() => {
    estimator = new CostEstimator();
  });

  // ── estimate — shape ────────────────────────────────────────────
  describe('estimate — response shape', () => {
    it('returns 3 perStage entries (stages 1, 2, 3)', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const result = estimator.estimate(models, ARTICLES);
      expect(result.perStage).toHaveLength(3);
      expect(result.perStage.map(s => s.stage).sort()).toEqual([1, 2, 3]);
    });

    it('returns totalMonthlyUsd as a number ≥ 0', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'haiku' as const]));
      const result = estimator.estimate(models, ARTICLES);
      expect(result.totalMonthlyUsd).toBeGreaterThan(0);
    });

    it('returns comparedTo with starter, professional, enterprise', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const result = estimator.estimate(models, ARTICLES);
      expect(result.comparedTo).toHaveProperty('starter');
      expect(result.comparedTo).toHaveProperty('professional');
      expect(result.comparedTo).toHaveProperty('enterprise');
    });

    it('each stage entry has articles, subtasks, costUsd, model', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'haiku' as const]));
      const result = estimator.estimate(models, ARTICLES);
      for (const stage of result.perStage) {
        expect(stage.articles).toBeGreaterThan(0);
        expect(stage.subtasks).toBeGreaterThan(0);
        expect(stage.costUsd).toBeGreaterThanOrEqual(0);
        expect(['haiku', 'sonnet', 'opus']).toContain(stage.model);
      }
    });
  });

  // ── cost ordering ───────────────────────────────────────────────
  describe('cost ordering', () => {
    it('haiku < sonnet < opus (uniform)', () => {
      const haikuModels = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'haiku' as const]));
      const sonnetModels = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const opusModels = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'opus' as const]));

      const h = estimator.estimate(haikuModels, ARTICLES).totalMonthlyUsd;
      const s = estimator.estimate(sonnetModels, ARTICLES).totalMonthlyUsd;
      const o = estimator.estimate(opusModels, ARTICLES).totalMonthlyUsd;

      expect(h).toBeLessThan(s);
      expect(s).toBeLessThan(o);
    });

    it('comparedTo.starter < comparedTo.professional < comparedTo.enterprise', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const { comparedTo } = estimator.estimate(models, ARTICLES);
      expect(comparedTo.starter).toBeLessThan(comparedTo.professional);
      expect(comparedTo.professional).toBeLessThan(comparedTo.enterprise);
    });
  });

  // ── stage article fractions ─────────────────────────────────────
  describe('stage article fractions', () => {
    it('stage 2 processes fewer articles than stage 1 (20% CTI factor)', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const result = estimator.estimate(models, ARTICLES);
      const s1 = result.perStage.find(s => s.stage === 1)!;
      const s2 = result.perStage.find(s => s.stage === 2)!;
      expect(s2.articles).toBeLessThan(s1.articles);
      expect(s2.articles).toBe(Math.round(ARTICLES * 0.2));
    });

    it('stage 1 and stage 3 both process all articles', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'haiku' as const]));
      const result = estimator.estimate(models, ARTICLES);
      const s1 = result.perStage.find(s => s.stage === 1)!;
      const s3 = result.perStage.find(s => s.stage === 3)!;
      expect(s1.articles).toBe(ARTICLES);
      expect(s3.articles).toBe(ARTICLES);
    });

    it('custom stage2Factor changes stage-2 article count proportionally', () => {
      const customEstimator = new CostEstimator(0.4);
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const result = customEstimator.estimate(models, ARTICLES);
      const s2 = result.perStage.find(s => s.stage === 2)!;
      expect(s2.articles).toBe(Math.round(ARTICLES * 0.4));
    });

    it('out-of-range stage2Factor (> 1) falls back to default 0.2', () => {
      const outOfRange = new CostEstimator(2.0);
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const result = outOfRange.estimate(models, ARTICLES);
      const s2 = result.perStage.find(s => s.stage === 2)!;
      expect(s2.articles).toBe(Math.round(ARTICLES * 0.2));
    });
  });

  // ── subtask counts ──────────────────────────────────────────────
  describe('subtask counts per stage', () => {
    it('stage 1 has 4 subtasks', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const s1 = estimator.estimate(models, ARTICLES).perStage.find(s => s.stage === 1)!;
      expect(s1.subtasks).toBe(4);
    });

    it('stage 2 has 6 subtasks', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const s2 = estimator.estimate(models, ARTICLES).perStage.find(s => s.stage === 2)!;
      expect(s2.subtasks).toBe(6);
    });

    it('stage 3 has 2 subtasks', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const s3 = estimator.estimate(models, ARTICLES).perStage.find(s => s.stage === 3)!;
      expect(s3.subtasks).toBe(2);
    });
  });

  // ── known values ────────────────────────────────────────────────
  describe('known values', () => {
    it('all-haiku is cheaper than $5 per 1000 articles (stage-based pricing)', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'haiku' as const]));
      const result = estimator.estimate(models, ARTICLES);
      expect(result.totalMonthlyUsd).toBeLessThan(5);
    });

    it('all-sonnet at 1000 articles matches comparedTo.professional', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const result = estimator.estimate(models, ARTICLES);
      expect(result.totalMonthlyUsd).toBeCloseTo(result.comparedTo.professional, 1);
    });

    it('professional plan (recommended models) uses sonnet as dominant model for stage 1', () => {
      const result = estimator.estimate(RECOMMENDED_SUBTASK_MODELS as Record<string, 'haiku' | 'sonnet' | 'opus'>, ARTICLES);
      const s1 = result.perStage.find(s => s.stage === 1)!;
      expect(s1.model).toBe('sonnet');
    });
  });

  // ── scaling ─────────────────────────────────────────────────────
  describe('linear scaling', () => {
    it('doubling articles doubles totalMonthlyUsd', () => {
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const r1 = estimator.estimate(models, 500);
      const r2 = estimator.estimate(models, 1000);
      expect(r2.totalMonthlyUsd / r1.totalMonthlyUsd).toBeCloseTo(2, 0);
    });
  });

  // ── missing subtask fallback ────────────────────────────────────
  describe('fallback when model missing', () => {
    it('falls back to sonnet for subtasks not in config', () => {
      // Pass empty config — all subtasks should fall back to sonnet
      const result = estimator.estimate({}, ARTICLES);
      const models = Object.fromEntries(AI_CTI_SUBTASKS.map(s => [s, 'sonnet' as const]));
      const expected = estimator.estimate(models, ARTICLES);
      expect(result.totalMonthlyUsd).toBeCloseTo(expected.totalMonthlyUsd, 1);
    });
  });
});
