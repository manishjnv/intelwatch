import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GlobalAiStore, RECOMMENDED_MODELS, type GlobalAiConfigRow } from '../src/services/global-ai-store.js';

describe('GlobalAiStore', () => {
  let store: GlobalAiStore;

  beforeEach(() => {
    store = new GlobalAiStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── getConfig ──────────────────────────────────────────────────

  describe('getConfig', () => {
    it('empty store → seeds defaults from RECOMMENDED_MODELS', async () => {
      const config = await store.getConfig();
      expect(config.length).toBe(Object.keys(RECOMMENDED_MODELS).length);
      // All rows should have model from recommendation
      for (const row of config) {
        const key = `${row.category}.${row.subtask}`;
        expect(RECOMMENDED_MODELS[key]).toBeDefined();
        expect(row.model).toBe(RECOMMENDED_MODELS[key].model);
      }
    });

    it('returns existing rows after setModel', async () => {
      await store.setModel('news_feed', 'classification', 'opus', 'admin');
      const config = await store.getConfig();
      const classification = config.find((r) => r.subtask === 'classification');
      expect(classification?.model).toBe('opus');
    });
  });

  // ── getConfigWithRecommendations ────────────────────────────────

  describe('getConfigWithRecommendations', () => {
    it('merges DB config with recommendations', async () => {
      const { config, recommendations } = await store.getConfigWithRecommendations();
      expect(config.length).toBe(Object.keys(RECOMMENDED_MODELS).length);
      expect(recommendations).toBe(RECOMMENDED_MODELS);
      // Each entry should have recommended field
      for (const entry of config) {
        expect(entry.recommended).toBeDefined();
        expect(entry.recommended.model).toBeDefined();
        expect(entry.recommended.reason).toBeDefined();
      }
    });

    it('isCurrentlyRecommended flag correct', async () => {
      // Default should be all recommended
      const { config: before } = await store.getConfigWithRecommendations();
      expect(before.every((c) => c.isCurrentlyRecommended)).toBe(true);

      // Change one to non-recommended
      await store.setModel('news_feed', 'classification', 'opus', 'admin');
      const { config: after } = await store.getConfigWithRecommendations();
      const changed = after.find((c) => c.subtask === 'classification');
      expect(changed?.isCurrentlyRecommended).toBe(false);
    });
  });

  // ── setModel ───────────────────────────────────────────────────

  describe('setModel', () => {
    it('valid input → upserts', async () => {
      const row = await store.setModel('news_feed', 'classification', 'opus', 'admin-1');
      expect(row.model).toBe('opus');
      expect(row.updatedBy).toBe('admin-1');
      expect(row.category).toBe('news_feed');
      expect(row.subtask).toBe('classification');
    });

    it('invalid model → throws AppError', async () => {
      await expect(
        store.setModel('news_feed', 'classification', 'gpt4', 'admin'),
      ).rejects.toThrow('Invalid model');
    });

    it('invalid category.subtask → throws AppError', async () => {
      await expect(
        store.setModel('bogus', 'nonexistent', 'haiku', 'admin'),
      ).rejects.toThrow('Invalid subtask');
    });
  });

  // ── getModelForSubtask ──────────────────────────────────────────

  describe('getModelForSubtask', () => {
    it('returns DB value after setModel', async () => {
      await store.setModel('news_feed', 'classification', 'opus', 'admin');
      const model = await store.getModelForSubtask('news_feed', 'classification');
      expect(model).toBe('opus');
    });

    it('falls back to recommendation when not in DB', async () => {
      const model = await store.getModelForSubtask('news_feed', 'deduplication');
      expect(model).toBe('haiku'); // recommended default
    });
  });

  // ── getConfidenceModel ──────────────────────────────────────────

  describe('getConfidenceModel', () => {
    it('returns "bayesian" when global processing enabled', async () => {
      const origGlobal = process.env.TI_GLOBAL_PROCESSING_ENABLED;
      const origBayes = process.env.TI_BAYESIAN_CONFIDENCE;
      process.env.TI_GLOBAL_PROCESSING_ENABLED = 'true';
      delete process.env.TI_BAYESIAN_CONFIDENCE;

      const result = await store.getConfidenceModel();
      expect(result).toBe('bayesian');

      process.env.TI_GLOBAL_PROCESSING_ENABLED = origGlobal;
      process.env.TI_BAYESIAN_CONFIDENCE = origBayes;
    });

    it('returns "linear" when bayesian explicitly disabled', async () => {
      const orig = process.env.TI_BAYESIAN_CONFIDENCE;
      process.env.TI_BAYESIAN_CONFIDENCE = 'false';

      const result = await store.getConfidenceModel();
      expect(result).toBe('linear');

      process.env.TI_BAYESIAN_CONFIDENCE = orig;
    });
  });

  // ── applyPlanPreset ──────────────────────────────────────────────

  describe('applyPlanPreset', () => {
    it('starter → all haiku', async () => {
      const rows = await store.applyPlanPreset('starter', 'admin');
      expect(rows.every((r) => r.model === 'haiku')).toBe(true);
    });

    it('teams → recommended models', async () => {
      const rows = await store.applyPlanPreset('teams', 'admin');
      for (const row of rows) {
        const key = `${row.category}.${row.subtask}`;
        expect(row.model).toBe(RECOMMENDED_MODELS[key].model);
      }
    });
  });
});
