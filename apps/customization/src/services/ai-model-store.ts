import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import {
  AI_TASKS,
  AI_MODELS,
  DEFAULT_TASK_MODELS,
  type AiTask,
  type AiModel,
  type SetTaskModelInput,
  type SetBudgetInput,
} from '../schemas/customization.js';
import type { AuditTrail } from './audit-trail.js';
import type { ConfigVersioning } from './config-versioning.js';

export interface TaskMapping {
  id: string;
  tenantId: string;
  task: AiTask;
  model: AiModel;
  temperature?: number;
  maxTokens?: number;
  updatedAt: string;
}

export interface BudgetConfig {
  tenantId: string;
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  alertThreshold: number;
  updatedAt: string;
}

export interface UsageRecord {
  task: string;
  tokens: number;
  timestamp: string;
}

export interface UsageStats {
  totalTokens: number;
  byTask: Record<string, number>;
  dailyUsage: number;
  monthlyUsage: number;
  budgetUtilization: number;
}

export class AiModelStore {
  private taskMappings = new Map<string, TaskMapping>();
  private budgets = new Map<string, BudgetConfig>();
  /** tenantId → usage records */
  private tenantUsage = new Map<string, UsageRecord[]>();

  constructor(
    private auditTrail: AuditTrail,
    private versioning: ConfigVersioning,
  ) {}

  private taskKey(tenantId: string, task: string): string {
    return `${tenantId}:${task}`;
  }

  private ensureDefaults(tenantId: string): void {
    for (const task of AI_TASKS) {
      const k = this.taskKey(tenantId, task);
      if (!this.taskMappings.has(k)) {
        this.taskMappings.set(k, {
          id: randomUUID(),
          tenantId,
          task,
          model: (DEFAULT_TASK_MODELS[task] ?? 'sonnet') as AiModel,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (!this.budgets.has(tenantId)) {
      this.budgets.set(tenantId, {
        tenantId,
        dailyTokenLimit: 1_000_000,
        monthlyTokenLimit: 20_000_000,
        alertThreshold: 0.8,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  listAvailableModels(): Array<{ name: AiModel; description: string; costTier: string }> {
    return [
      { name: 'haiku', description: 'Fast, cost-effective for triage and classification', costTier: 'low' },
      { name: 'sonnet', description: 'Balanced performance for extraction and analysis', costTier: 'medium' },
      { name: 'opus', description: 'Highest capability for complex reasoning', costTier: 'high' },
    ];
  }

  getTaskMappings(tenantId: string): TaskMapping[] {
    this.ensureDefaults(tenantId);
    return Array.from(this.taskMappings.values())
      .filter((t) => t.tenantId === tenantId)
      .map((t) => ({ ...t }));
  }

  setTaskModel(
    tenantId: string,
    task: string,
    input: SetTaskModelInput,
    userId: string,
  ): TaskMapping {
    this.ensureDefaults(tenantId);
    const k = this.taskKey(tenantId, task);
    const existing = this.taskMappings.get(k);
    if (!existing) throw new AppError(404, `Task '${task}' not found`, 'TASK_NOT_FOUND');

    if (!AI_MODELS.includes(input.model)) {
      throw new AppError(400, `Invalid model: ${input.model}`, 'INVALID_MODEL');
    }

    const before = { ...existing };
    existing.model = input.model;
    if (input.temperature !== undefined) existing.temperature = input.temperature;
    if (input.maxTokens !== undefined) existing.maxTokens = input.maxTokens;
    existing.updatedAt = new Date().toISOString();

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'ai',
      action: 'task_model.updated',
      before: before as unknown as Record<string, unknown>,
      after: existing as unknown as Record<string, unknown>,
    });

    this.versioning.snapshot(tenantId, 'ai', this.getExportData(tenantId), userId, `Set ${task} model to ${input.model}`);

    return { ...existing };
  }

  getBudget(tenantId: string): BudgetConfig {
    this.ensureDefaults(tenantId);
    const budget = this.budgets.get(tenantId)!;
    return { ...budget };
  }

  setBudget(tenantId: string, input: SetBudgetInput, userId: string): BudgetConfig {
    this.ensureDefaults(tenantId);

    if (input.dailyTokenLimit > input.monthlyTokenLimit) {
      throw new AppError(400, 'Daily limit cannot exceed monthly limit', 'BUDGET_INVALID');
    }

    const budget = this.budgets.get(tenantId)!;
    const before = { ...budget };

    budget.dailyTokenLimit = input.dailyTokenLimit;
    budget.monthlyTokenLimit = input.monthlyTokenLimit;
    budget.alertThreshold = input.alertThreshold;
    budget.updatedAt = new Date().toISOString();

    this.auditTrail.log({
      tenantId,
      userId,
      section: 'ai',
      action: 'budget.updated',
      before: before as unknown as Record<string, unknown>,
      after: budget as unknown as Record<string, unknown>,
    });

    return { ...budget };
  }

  recordUsage(tenantId: string, task: string, tokens: number): void {
    const record: UsageRecord = {
      task,
      tokens,
      timestamp: new Date().toISOString(),
    };
    if (!this.tenantUsage.has(tenantId)) {
      this.tenantUsage.set(tenantId, []);
    }
    this.tenantUsage.get(tenantId)!.push(record);
  }

  getUsageStats(tenantId: string, period: string = 'day'): UsageStats {
    this.ensureDefaults(tenantId);
    const records = this.tenantUsage.get(tenantId) ?? [];
    const budget = this.budgets.get(tenantId)!;

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const periodMs = period === 'week' ? 7 * dayMs : period === 'month' ? 30 * dayMs : dayMs;

    const periodRecords = records.filter(
      (r) => now - new Date(r.timestamp).getTime() < periodMs,
    );
    const dayRecords = records.filter(
      (r) => now - new Date(r.timestamp).getTime() < dayMs,
    );
    const monthRecords = records.filter(
      (r) => now - new Date(r.timestamp).getTime() < 30 * dayMs,
    );

    const totalTokens = periodRecords.reduce((sum, r) => sum + r.tokens, 0);
    const dailyUsage = dayRecords.reduce((sum, r) => sum + r.tokens, 0);
    const monthlyUsage = monthRecords.reduce((sum, r) => sum + r.tokens, 0);

    const byTask: Record<string, number> = {};
    for (const r of periodRecords) {
      byTask[r.task] = (byTask[r.task] ?? 0) + r.tokens;
    }

    return {
      totalTokens,
      byTask,
      dailyUsage,
      monthlyUsage,
      budgetUtilization: budget.monthlyTokenLimit > 0
        ? monthlyUsage / budget.monthlyTokenLimit
        : 0,
    };
  }

  getExportData(tenantId: string): Record<string, unknown> {
    this.ensureDefaults(tenantId);
    const mappings = this.getTaskMappings(tenantId);
    const budget = this.getBudget(tenantId);
    return {
      taskMappings: mappings.reduce((acc, m) => {
        acc[m.task] = { model: m.model, temperature: m.temperature, maxTokens: m.maxTokens };
        return acc;
      }, {} as Record<string, unknown>),
      budget: {
        dailyTokenLimit: budget.dailyTokenLimit,
        monthlyTokenLimit: budget.monthlyTokenLimit,
        alertThreshold: budget.alertThreshold,
      },
    };
  }

  importData(tenantId: string, data: Record<string, unknown>, _userId: string): void {
    this.ensureDefaults(tenantId);
    const now = new Date().toISOString();

    if (data.taskMappings && typeof data.taskMappings === 'object') {
      const mappings = data.taskMappings as Record<string, Record<string, unknown>>;
      for (const [task, config] of Object.entries(mappings)) {
        const k = this.taskKey(tenantId, task);
        const existing = this.taskMappings.get(k);
        if (existing && config.model && AI_MODELS.includes(config.model as AiModel)) {
          existing.model = config.model as AiModel;
          if (typeof config.temperature === 'number') existing.temperature = config.temperature;
          if (typeof config.maxTokens === 'number') existing.maxTokens = config.maxTokens;
          existing.updatedAt = now;
        }
      }
    }

    if (data.budget && typeof data.budget === 'object') {
      const b = data.budget as Record<string, unknown>;
      const budget = this.budgets.get(tenantId)!;
      if (typeof b.dailyTokenLimit === 'number') budget.dailyTokenLimit = b.dailyTokenLimit;
      if (typeof b.monthlyTokenLimit === 'number') budget.monthlyTokenLimit = b.monthlyTokenLimit;
      if (typeof b.alertThreshold === 'number') budget.alertThreshold = b.alertThreshold;
      budget.updatedAt = now;
    }
  }
}
