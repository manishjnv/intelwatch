import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { CreateRuleDto, UpdateRuleDto, RuleCondition, AlertSeverity } from '../schemas/alert.js';

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

/** In-memory store for alert rules (DECISION-013). */
export class RuleStore {
  private rules = new Map<string, AlertRule>();

  /** Create a new alert rule. */
  create(dto: CreateRuleDto): AlertRule {
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
    this.rules.set(rule.id, rule);
    return rule;
  }

  /** Get a single rule by ID. */
  getById(id: string): AlertRule | undefined {
    return this.rules.get(id);
  }

  /** List rules for a tenant with optional filters. */
  list(tenantId: string, opts: ListRulesOptions): ListRulesResult {
    let items = Array.from(this.rules.values()).filter((r) => r.tenantId === tenantId);

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

  /** Update a rule. Returns updated rule or undefined if not found. */
  update(id: string, dto: UpdateRuleDto): AlertRule | undefined {
    const rule = this.rules.get(id);
    if (!rule) return undefined;

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.description !== undefined) rule.description = dto.description;
    if (dto.severity !== undefined) rule.severity = dto.severity;
    if (dto.condition !== undefined) rule.condition = dto.condition;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    if (dto.channelIds !== undefined) rule.channelIds = dto.channelIds;
    if (dto.escalationPolicyId !== undefined) rule.escalationPolicyId = dto.escalationPolicyId;
    if (dto.cooldownMinutes !== undefined) rule.cooldownMinutes = dto.cooldownMinutes;
    if (dto.tags !== undefined) rule.tags = dto.tags;
    rule.updatedAt = new Date().toISOString();

    return rule;
  }

  /** Delete a rule. Returns true if deleted. */
  delete(id: string): boolean {
    return this.rules.delete(id);
  }

  /** Toggle a rule's enabled state. */
  toggle(id: string, enabled: boolean): AlertRule | undefined {
    const rule = this.rules.get(id);
    if (!rule) return undefined;
    rule.enabled = enabled;
    rule.updatedAt = new Date().toISOString();
    return rule;
  }

  /** Mark a rule as triggered (updates lastTriggeredAt + triggerCount). */
  markTriggered(id: string): void {
    const rule = this.rules.get(id);
    if (rule) {
      rule.lastTriggeredAt = new Date().toISOString();
      rule.triggerCount++;
    }
  }

  /** Check if a rule is in cooldown. */
  isInCooldown(id: string): boolean {
    const rule = this.rules.get(id);
    if (!rule || !rule.lastTriggeredAt || rule.cooldownMinutes === 0) return false;
    const cooldownEnd = new Date(rule.lastTriggeredAt).getTime() + rule.cooldownMinutes * 60_000;
    return Date.now() < cooldownEnd;
  }

  /** Get all enabled rules for a tenant. */
  getEnabledRules(tenantId: string): AlertRule[] {
    return Array.from(this.rules.values()).filter((r) => r.tenantId === tenantId && r.enabled);
  }

  /** Get total rule count for a tenant. */
  count(tenantId: string): number {
    return Array.from(this.rules.values()).filter((r) => r.tenantId === tenantId).length;
  }

  /** Clear all rules (for testing). */
  clear(): void {
    this.rules.clear();
  }
}
