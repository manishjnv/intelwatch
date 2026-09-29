import { randomUUID } from 'node:crypto';
import type { CreateRuleDto, UpdateRuleDto, RuleCondition, AlertSeverity } from '../schemas/alert.js';
import { MemoryRepo, type Repo } from '../repository.js';

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  tenantId: string;
  severity: AlertSeverity;
  condition: RuleCondition;
  enabled: boolean;
  channelIds: string[];
  escalationPolicyId: string | null;
  cooldownMinutes: number;
  tags: string[];
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListRulesOptions {
  type?: string;
  severity?: string;
  enabled?: boolean;
  page: number;
  limit: number;
}

export interface ListRulesResult {
  data: AlertRule[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Alert rule store (Step 3 S154). Backed by Postgres via `repo` in production;
 * an in-memory MemoryRepo when no repo is injected (dev/test only).
 */
export class RuleStore {
  constructor(private readonly repo: Repo<AlertRule> = new MemoryRepo<AlertRule>()) {}

  /** Create a new alert rule. */
  async create(dto: CreateRuleDto): Promise<AlertRule> {
    const now = new Date().toISOString();
    const rule: AlertRule = {
      id: randomUUID(),
      name: dto.name,
      description: dto.description ?? '',
      tenantId: dto.tenantId,
      severity: dto.severity,
      condition: dto.condition,
      enabled: dto.enabled,
      channelIds: dto.channelIds ?? [],
      escalationPolicyId: dto.escalationPolicyId ?? null,
      cooldownMinutes: dto.cooldownMinutes,
      tags: dto.tags ?? [],
      lastTriggeredAt: null,
      triggerCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.save(rule);
  }

  /** Get a single rule by ID, optionally scoped to a tenant. */
  async getById(id: string, tenantId?: string): Promise<AlertRule | undefined> {
    const rule = await this.repo.get(id);
    if (!rule) return undefined;
    if (tenantId !== undefined && rule.tenantId !== tenantId) return undefined;
    return rule;
  }

  /** List rules for a tenant with optional filters. */
  // ponytail: filters/sort/paginate in JS over the tenant's rows; push into SQL if a tenant ever has thousands of rules.
  async list(tenantId: string, opts: ListRulesOptions): Promise<ListRulesResult> {
    let items = await this.repo.list(tenantId);

    if (opts.type) {
      items = items.filter((r) => r.condition.type === opts.type);
    }
    if (opts.severity) {
      items = items.filter((r) => r.severity === opts.severity);
    }
    if (opts.enabled !== undefined) {
      items = items.filter((r) => r.enabled === opts.enabled);
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const totalPages = Math.ceil(total / opts.limit) || 1;
    const start = (opts.page - 1) * opts.limit;
    const data = items.slice(start, start + opts.limit);

    return { data, total, page: opts.page, limit: opts.limit, totalPages };
  }

  /** Update a rule. Returns updated rule or undefined if not found (or owned by another tenant). */
  async update(id: string, dto: UpdateRuleDto, tenantId?: string): Promise<AlertRule | undefined> {
    const rule = await this.getById(id, tenantId);
    if (!rule) return undefined;

    const updated: AlertRule = {
      ...rule,
      name: dto.name ?? rule.name,
      description: dto.description ?? rule.description,
      severity: dto.severity ?? rule.severity,
      condition: dto.condition ?? rule.condition,
      enabled: dto.enabled ?? rule.enabled,
      channelIds: dto.channelIds ?? rule.channelIds,
      escalationPolicyId: dto.escalationPolicyId ?? rule.escalationPolicyId,
      cooldownMinutes: dto.cooldownMinutes ?? rule.cooldownMinutes,
      tags: dto.tags ?? rule.tags,
      updatedAt: new Date().toISOString(),
    };
    return this.repo.save(updated);
  }

  /** Delete a rule. Returns true if deleted (and owned by the given tenant, if provided). */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    const rule = await this.getById(id, tenantId);
    if (!rule) return false;
    return this.repo.delete(id);
  }

  /** Toggle a rule's enabled state. */
  async toggle(id: string, enabled: boolean, tenantId?: string): Promise<AlertRule | undefined> {
    const rule = await this.getById(id, tenantId);
    if (!rule) return undefined;
    return this.repo.save({ ...rule, enabled, updatedAt: new Date().toISOString() });
  }

  /** Mark a rule as triggered (updates lastTriggeredAt + triggerCount). */
  async markTriggered(id: string): Promise<void> {
    const rule = await this.repo.get(id);
    if (!rule) return;
    await this.repo.save({ ...rule, lastTriggeredAt: new Date().toISOString(), triggerCount: rule.triggerCount + 1 });
  }

  /** Check if a rule is in cooldown. */
  async isInCooldown(id: string): Promise<boolean> {
    const rule = await this.repo.get(id);
    if (!rule || !rule.lastTriggeredAt || rule.cooldownMinutes === 0) return false;
    const cooldownEnd = new Date(rule.lastTriggeredAt).getTime() + rule.cooldownMinutes * 60_000;
    return Date.now() < cooldownEnd;
  }

  /** Get all enabled rules for a tenant. */
  async getEnabledRules(tenantId: string): Promise<AlertRule[]> {
    const items = await this.repo.list(tenantId);
    return items.filter((r) => r.enabled);
  }

  /** Get total rule count for a tenant. */
  async count(tenantId: string): Promise<number> {
    const items = await this.repo.list(tenantId);
    return items.length;
  }

  /** Clear all rules (test-only; only affects the in-memory backend). */
  clear(): void {
    if (this.repo instanceof MemoryRepo) this.repo.clear();
  }
}
