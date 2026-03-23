import { describe, it, expect, beforeEach } from 'vitest';
import { AiModelStore } from '../src/services/ai-model-store.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { ConfigVersioning } from '../src/services/config-versioning.js';

describe('AiModelStore', () => {
  let store: AiModelStore;
  let auditTrail: AuditTrail;

  beforeEach(() => {
    auditTrail = new AuditTrail();
    const versioning = new ConfigVersioning();
    store = new AiModelStore(auditTrail, versioning);
  });

  const TENANT = 'tenant-1';

  describe('listAvailableModels', () => {
    it('returns haiku, sonnet, opus', () => {
      const models = store.listAvailableModels();
      expect(models).toHaveLength(3);
      expect(models.map((m) => m.name)).toEqual(['haiku', 'sonnet', 'opus']);
    });

    it('includes cost tier info', () => {
      const models = store.listAvailableModels();
      expect(models[0].costTier).toBe('low');
      expect(models[2].costTier).toBe('high');
    });
  });

  describe('getTaskMappings', () => {
    it('returns default mappings for all tasks', () => {
      const mappings = store.getTaskMappings(TENANT);
      expect(mappings).toHaveLength(5);
      const triage = mappings.find((m) => m.task === 'triage');
      expect(triage?.model).toBe('haiku');
      const extraction = mappings.find((m) => m.task === 'extraction');
      expect(extraction?.model).toBe('sonnet');
    });

    it('isolates mappings between tenants', () => {
      store.setTaskModel(TENANT, 'triage', { model: 'opus' }, 'user-1');
      const t1 = store.getTaskMappings(TENANT);
      const t2 = store.getTaskMappings('tenant-2');
      expect(t1.find((m) => m.task === 'triage')?.model).toBe('opus');
      expect(t2.find((m) => m.task === 'triage')?.model).toBe('haiku');
    });
  });

  describe('setTaskModel', () => {
    it('updates model for a task', () => {
      const mapping = store.setTaskModel(TENANT, 'triage', { model: 'sonnet' }, 'user-1');
      expect(mapping.model).toBe('sonnet');
    });

    it('sets optional temperature and maxTokens', () => {
      const mapping = store.setTaskModel(TENANT, 'analysis', {
        model: 'opus',
        temperature: 0.3,
        maxTokens: 4096,
      }, 'user-1');
      expect(mapping.temperature).toBe(0.3);
      expect(mapping.maxTokens).toBe(4096);
    });

    it('throws for invalid model', () => {
      expect(() =>
        store.setTaskModel(TENANT, 'triage', { model: 'invalid' as never }, 'user-1'),
      ).toThrow('Invalid model');
    });

    it('creates audit entry', () => {
      store.setTaskModel(TENANT, 'triage', { model: 'sonnet' }, 'user-1');
      expect(auditTrail.getEntryCount(TENANT)).toBe(1);
    });
  });

  describe('budget', () => {
    it('returns default budget', () => {
      const budget = store.getBudget(TENANT);
      expect(budget.dailyTokenLimit).toBe(1_000_000);
      expect(budget.monthlyTokenLimit).toBe(20_000_000);
      expect(budget.alertThreshold).toBe(0.8);
    });

    it('updates budget limits', () => {
      const budget = store.setBudget(TENANT, {
        dailyTokenLimit: 500_000,
        monthlyTokenLimit: 10_000_000,
        alertThreshold: 0.9,
      }, 'user-1');
      expect(budget.dailyTokenLimit).toBe(500_000);
      expect(budget.monthlyTokenLimit).toBe(10_000_000);
    });

    it('rejects daily > monthly', () => {
      expect(() =>
        store.setBudget(TENANT, {
          dailyTokenLimit: 5_000_000,
          monthlyTokenLimit: 1_000_000,
          alertThreshold: 0.8,
        }, 'user-1'),
      ).toThrow('Daily limit cannot exceed monthly limit');
    });
  });

  describe('usage tracking', () => {
    it('records and retrieves usage stats', () => {
      store.recordUsage(TENANT, 'triage', 1000);
      store.recordUsage(TENANT, 'extraction', 5000);
      store.recordUsage(TENANT, 'triage', 2000);

      const stats = store.getUsageStats(TENANT, 'day');
      expect(stats.totalTokens).toBe(8000);
      expect(stats.byTask.triage).toBe(3000);
      expect(stats.byTask.extraction).toBe(5000);
    });

    it('calculates budget utilization', () => {
      store.recordUsage(TENANT, 'triage', 10_000_000);
      const stats = store.getUsageStats(TENANT, 'day');
      expect(stats.budgetUtilization).toBeCloseTo(0.5); // 10M / 20M
    });

    it('returns zero stats for tenant with no usage', () => {
      const stats = store.getUsageStats(TENANT, 'day');
      expect(stats.totalTokens).toBe(0);
      expect(stats.budgetUtilization).toBe(0);
    });
  });

  describe('export/import', () => {
    it('exports task mappings and budget', () => {
      const data = store.getExportData(TENANT);
      expect(data.taskMappings).toBeDefined();
      expect(data.budget).toBeDefined();
    });

    it('imports task mappings', () => {
      store.importData(TENANT, {
        taskMappings: { triage: { model: 'opus' } },
      }, 'user-1');
      const mappings = store.getTaskMappings(TENANT);
      expect(mappings.find((m) => m.task === 'triage')?.model).toBe('opus');
    });
  });
});
