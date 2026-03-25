import { describe, it, expect, beforeEach } from 'vitest';
import { AiModelStore } from '../src/services/ai-model-store.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { ConfigVersioning } from '../src/services/config-versioning.js';
import { AI_CTI_SUBTASKS, RECOMMENDED_SUBTASK_MODELS, FALLBACK_SUBTASK_MODELS } from '../src/schemas/customization.js';

const TENANT = 'tenant-expand-1';
const USER   = 'user-1';

describe('AiModelStore — CTI subtask expansion (12 subtasks)', () => {
  let store: AiModelStore;

  beforeEach(() => {
    store = new AiModelStore(new AuditTrail(), new ConfigVersioning());
  });

  // ── getSubtaskMappings ───────────────────────────────────────────
  describe('getSubtaskMappings', () => {
    it('returns exactly 12 subtask mappings', () => {
      const mappings = store.getSubtaskMappings(TENANT);
      expect(mappings).toHaveLength(12);
    });

    it('each mapping has the correct subtask name', () => {
      const mappings = store.getSubtaskMappings(TENANT);
      const names = mappings.map((m) => m.subtask);
      for (const subtask of AI_CTI_SUBTASKS) {
        expect(names).toContain(subtask);
      }
    });

    it('defaults to recommended model for every subtask', () => {
      const mappings = store.getSubtaskMappings(TENANT);
      for (const mapping of mappings) {
        expect(mapping.model).toBe(RECOMMENDED_SUBTASK_MODELS[mapping.subtask]);
      }
    });

    it('defaults to correct fallback model for every subtask', () => {
      const mappings = store.getSubtaskMappings(TENANT);
      for (const mapping of mappings) {
        expect(mapping.fallbackModel).toBe(FALLBACK_SUBTASK_MODELS[mapping.subtask]);
      }
    });

    it('marks all defaults as isRecommended=true', () => {
      const mappings = store.getSubtaskMappings(TENANT);
      expect(mappings.every((m) => m.isRecommended)).toBe(true);
    });

    it('assigns correct stage per subtask', () => {
      const mappings = store.getSubtaskMappings(TENANT);
      const s1 = mappings.filter((m) => m.stage === 1).map((m) => m.subtask);
      expect(s1).toContain('summarization');
      expect(s1).toContain('classification');
      const s2 = mappings.filter((m) => m.stage === 2).map((m) => m.subtask);
      expect(s2).toContain('ioc_extraction');
      expect(s2).toContain('ttp_mapping');
      const s3 = mappings.filter((m) => m.stage === 3).map((m) => m.subtask);
      expect(s3).toContain('deduplication');
      expect(s3).toContain('cross_article_merge');
    });

    it('is tenant-isolated', () => {
      store.setSubtaskModel(TENANT, 'summarization', { model: 'haiku' }, USER);
      const other = store.getSubtaskMappings('other-tenant');
      expect(other.find((m) => m.subtask === 'summarization')?.model).toBe('sonnet'); // default
    });

    it('returns copies — mutations do not affect store state', () => {
      const mappings = store.getSubtaskMappings(TENANT);
      const m = mappings.find((x) => x.subtask === 'summarization')!;
      m.model = 'opus'; // mutate the returned copy
      expect(store.getSubtaskMappings(TENANT).find((x) => x.subtask === 'summarization')!.model).toBe('sonnet');
    });
  });

  // ── setSubtaskModel ──────────────────────────────────────────────
  describe('setSubtaskModel', () => {
    it('updates the model for the specified subtask', () => {
      store.setSubtaskModel(TENANT, 'ioc_extraction', { model: 'opus' }, USER);
      const m = store.getSubtaskMappings(TENANT).find((x) => x.subtask === 'ioc_extraction')!;
      expect(m.model).toBe('opus');
    });

    it('sets isRecommended=false when overriding recommended model', () => {
      store.setSubtaskModel(TENANT, 'summarization', { model: 'haiku' }, USER); // recommended is sonnet
      const m = store.getSubtaskMappings(TENANT).find((x) => x.subtask === 'summarization')!;
      expect(m.isRecommended).toBe(false);
    });

    it('sets isRecommended=true when setting the recommended model', () => {
      store.setSubtaskModel(TENANT, 'summarization', { model: 'haiku' }, USER);
      store.setSubtaskModel(TENANT, 'summarization', { model: 'sonnet' }, USER); // back to recommended
      const m = store.getSubtaskMappings(TENANT).find((x) => x.subtask === 'summarization')!;
      expect(m.isRecommended).toBe(true);
    });

    it('updates fallbackModel when provided', () => {
      store.setSubtaskModel(TENANT, 'cve_identification', { model: 'sonnet', fallbackModel: 'haiku' }, USER);
      const m = store.getSubtaskMappings(TENANT).find((x) => x.subtask === 'cve_identification')!;
      expect(m.fallbackModel).toBe('haiku');
    });

    it('preserves fallbackModel when not provided', () => {
      const before = store.getSubtaskMappings(TENANT).find((x) => x.subtask === 'cve_identification')!;
      store.setSubtaskModel(TENANT, 'cve_identification', { model: 'haiku' }, USER);
      const after = store.getSubtaskMappings(TENANT).find((x) => x.subtask === 'cve_identification')!;
      expect(after.fallbackModel).toBe(before.fallbackModel); // unchanged
    });

    it('does not affect other subtasks', () => {
      const before = store.getSubtaskMappings(TENANT).find((x) => x.subtask === 'classification')!.model;
      store.setSubtaskModel(TENANT, 'summarization', { model: 'haiku' }, USER);
      const after = store.getSubtaskMappings(TENANT).find((x) => x.subtask === 'classification')!.model;
      expect(after).toBe(before);
    });
  });

  // ── applySubtaskBatch ────────────────────────────────────────────
  describe('applySubtaskBatch', () => {
    it('sets all subtasks to the specified model', () => {
      const configs: Record<string, { model: 'haiku'; fallbackModel: 'sonnet' }> = {};
      for (const subtask of AI_CTI_SUBTASKS) {
        configs[subtask] = { model: 'haiku', fallbackModel: 'sonnet' };
      }
      const results = store.applySubtaskBatch(TENANT, configs, USER, 'Starter plan');
      expect(results.every((m) => m.model === 'haiku')).toBe(true);
    });

    it('returns 12 updated mappings', () => {
      const configs: Record<string, { model: 'opus'; fallbackModel: 'sonnet' }> = {};
      for (const subtask of AI_CTI_SUBTASKS) configs[subtask] = { model: 'opus', fallbackModel: 'sonnet' };
      const results = store.applySubtaskBatch(TENANT, configs, USER, 'Enterprise plan');
      expect(results).toHaveLength(12);
    });

    it('skips subtasks not present in configs', () => {
      const originalModels = store.getSubtaskMappings(TENANT).reduce<Record<string, string>>((acc, m) => {
        acc[m.subtask] = m.model; return acc;
      }, {});
      // Only provide config for 1 subtask
      store.applySubtaskBatch(TENANT, { summarization: { model: 'haiku', fallbackModel: 'sonnet' } }, USER, 'partial');
      const after = store.getSubtaskMappings(TENANT);
      for (const m of after) {
        if (m.subtask !== 'summarization') {
          expect(m.model).toBe(originalModels[m.subtask]);
        }
      }
    });
  });

  // ── listRecommended ──────────────────────────────────────────────
  describe('listRecommended', () => {
    it('returns 12 recommended entries', () => {
      expect(store.listRecommended()).toHaveLength(12);
    });

    it('each entry has subtask, stage, recommendedModel, fallbackModel, description', () => {
      const rec = store.listRecommended();
      for (const r of rec) {
        expect(r.subtask).toBeDefined();
        expect([1, 2, 3]).toContain(r.stage);
        expect(r.recommendedModel).toBeDefined();
        expect(r.fallbackModel).toBeDefined();
        expect(r.description.length).toBeGreaterThan(10);
      }
    });

    it('deduplication recommended model is haiku (cheapest for Stage 3)', () => {
      const dedup = store.listRecommended().find((r) => r.subtask === 'deduplication')!;
      expect(dedup.recommendedModel).toBe('haiku');
    });

    it('ttp_mapping fallback is opus (needs deep reasoning)', () => {
      const ttp = store.listRecommended().find((r) => r.subtask === 'ttp_mapping')!;
      expect(ttp.fallbackModel).toBe('opus');
    });

    it('is tenant-independent (always returns same values)', () => {
      const rec1 = store.listRecommended();
      store.setSubtaskModel(TENANT, 'summarization', { model: 'haiku' }, USER);
      const rec2 = store.listRecommended();
      // Recommended values are static — should not change after setting a tenant model
      expect(rec1.find((r) => r.subtask === 'summarization')?.recommendedModel)
        .toBe(rec2.find((r) => r.subtask === 'summarization')?.recommendedModel);
    });
  });

  // ── backward-compat: existing 5-task methods still work ──────────
  describe('backward compatibility — existing 5 tasks', () => {
    it('getTaskMappings still returns 5 original tasks', () => {
      const mappings = store.getTaskMappings(TENANT);
      expect(mappings).toHaveLength(5);
    });

    it('setTaskModel still works for legacy tasks', () => {
      const m = store.setTaskModel(TENANT, 'triage', { model: 'sonnet' }, USER);
      expect(m.model).toBe('sonnet');
    });
  });
});
