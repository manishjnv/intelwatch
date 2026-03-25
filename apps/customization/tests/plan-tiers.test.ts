import { describe, it, expect, beforeEach } from 'vitest';
import { PlanTierService, PLAN_METADATA, PLAN_SUBTASK_CONFIGS } from '../src/services/plan-tiers.js';
import { AiModelStore } from '../src/services/ai-model-store.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { ConfigVersioning } from '../src/services/config-versioning.js';
import { AI_CTI_SUBTASKS, RECOMMENDED_SUBTASK_MODELS } from '../src/schemas/customization.js';

const TENANT = 'tenant-plan-1';
const USER   = 'user-1';

describe('PlanTierService', () => {
  let service: PlanTierService;
  let store: AiModelStore;

  beforeEach(() => {
    service = new PlanTierService();
    store   = new AiModelStore(new AuditTrail(), new ConfigVersioning());
  });

  // ── listPlans ────────────────────────────────────────────────────
  describe('listPlans', () => {
    it('returns all 4 plan tiers', () => {
      expect(service.listPlans()).toHaveLength(4);
    });

    it('includes starter, professional, enterprise, custom', () => {
      const names = service.listPlans().map((p) => p.plan);
      expect(names).toContain('starter');
      expect(names).toContain('professional');
      expect(names).toContain('enterprise');
      expect(names).toContain('custom');
    });

    it('professional is the recommended plan', () => {
      const professional = service.listPlans().find((p) => p.plan === 'professional')!;
      expect(professional.isRecommended).toBe(true);
    });

    it('no other plan is recommended', () => {
      const others = service.listPlans().filter((p) => p.plan !== 'professional');
      expect(others.every((p) => !p.isRecommended)).toBe(true);
    });

    it('each plan has display name, description, cost, accuracy', () => {
      for (const plan of service.listPlans()) {
        expect(plan.displayName.length).toBeGreaterThan(0);
        expect(plan.description.length).toBeGreaterThan(10);
        expect(plan.costPer1KArticlesUsd.length).toBeGreaterThan(0);
        expect(plan.accuracyPct.length).toBeGreaterThan(0);
      }
    });
  });

  // ── getPlan ──────────────────────────────────────────────────────
  describe('getPlan', () => {
    it('returns metadata for a known plan', () => {
      const meta = service.getPlan('enterprise');
      expect(meta.plan).toBe('enterprise');
      expect(meta.isRecommended).toBe(false);
    });
  });

  // ── PLAN_SUBTASK_CONFIGS ─────────────────────────────────────────
  describe('PLAN_SUBTASK_CONFIGS', () => {
    it('starter sets all 12 subtasks to haiku', () => {
      for (const subtask of AI_CTI_SUBTASKS) {
        expect(PLAN_SUBTASK_CONFIGS.starter[subtask].model).toBe('haiku');
      }
    });

    it('enterprise sets all 12 subtasks to opus', () => {
      for (const subtask of AI_CTI_SUBTASKS) {
        expect(PLAN_SUBTASK_CONFIGS.enterprise[subtask].model).toBe('opus');
      }
    });

    it('professional uses recommended model for each subtask', () => {
      for (const subtask of AI_CTI_SUBTASKS) {
        expect(PLAN_SUBTASK_CONFIGS.professional[subtask].model)
          .toBe(RECOMMENDED_SUBTASK_MODELS[subtask]);
      }
    });

    it('professional deduplication uses haiku (recommended for Stage 3)', () => {
      expect(PLAN_SUBTASK_CONFIGS.professional.deduplication.model).toBe('haiku');
    });

    it('all defined plans cover all 12 subtasks', () => {
      for (const plan of ['starter', 'professional', 'enterprise'] as const) {
        for (const subtask of AI_CTI_SUBTASKS) {
          expect(PLAN_SUBTASK_CONFIGS[plan][subtask]).toBeDefined();
        }
      }
    });
  });

  // ── applyPlan ────────────────────────────────────────────────────
  describe('applyPlan', () => {
    it('starter — sets all subtasks to haiku', () => {
      const results = service.applyPlan(TENANT, 'starter', store, USER);
      expect(results.every((m) => m.model === 'haiku')).toBe(true);
    });

    it('professional — uses recommended model per subtask', () => {
      const results = service.applyPlan(TENANT, 'professional', store, USER);
      for (const m of results) {
        expect(m.model).toBe(RECOMMENDED_SUBTASK_MODELS[m.subtask]);
      }
    });

    it('enterprise — sets all subtasks to opus', () => {
      const results = service.applyPlan(TENANT, 'enterprise', store, USER);
      expect(results.every((m) => m.model === 'opus')).toBe(true);
    });

    it('returns 12 subtask mappings', () => {
      expect(service.applyPlan(TENANT, 'starter', store, USER)).toHaveLength(12);
    });

    it('throws 400 for custom plan (bulk not allowed)', () => {
      expect(() => service.applyPlan(TENANT, 'custom' as never, store, USER))
        .toThrow('Custom plan cannot be applied in bulk');
    });

    it('is tenant-isolated — applying plan for T1 does not affect T2', () => {
      service.applyPlan(TENANT, 'starter', store, USER);
      const t2 = store.getSubtaskMappings('other-tenant');
      // other-tenant still has professional defaults (sonnet for most)
      const summ = t2.find((m) => m.subtask === 'summarization')!;
      expect(summ.model).toBe('sonnet');
    });

    it('can re-apply a different plan over an existing one', () => {
      service.applyPlan(TENANT, 'starter', store, USER);
      expect(store.getSubtaskMappings(TENANT).every((m) => m.model === 'haiku')).toBe(true);

      service.applyPlan(TENANT, 'enterprise', store, USER);
      expect(store.getSubtaskMappings(TENANT).every((m) => m.model === 'opus')).toBe(true);
    });
  });

  // ── detectCurrentPlan ────────────────────────────────────────────
  describe('detectCurrentPlan', () => {
    it('detects starter after applying starter', () => {
      service.applyPlan(TENANT, 'starter', store, USER);
      const subtasks = store.getSubtaskMappings(TENANT);
      expect(service.detectCurrentPlan(subtasks)).toBe('starter');
    });

    it('detects professional after applying professional', () => {
      service.applyPlan(TENANT, 'professional', store, USER);
      const subtasks = store.getSubtaskMappings(TENANT);
      expect(service.detectCurrentPlan(subtasks)).toBe('professional');
    });

    it('detects enterprise after applying enterprise', () => {
      service.applyPlan(TENANT, 'enterprise', store, USER);
      const subtasks = store.getSubtaskMappings(TENANT);
      expect(service.detectCurrentPlan(subtasks)).toBe('enterprise');
    });

    it('returns custom when subtasks are mixed (no predefined tier matches)', () => {
      service.applyPlan(TENANT, 'starter', store, USER);
      // Override one subtask to break the uniform pattern
      store.setSubtaskModel(TENANT, 'summarization', { model: 'opus' }, USER);
      const subtasks = store.getSubtaskMappings(TENANT);
      expect(service.detectCurrentPlan(subtasks)).toBe('custom');
    });
  });
});
