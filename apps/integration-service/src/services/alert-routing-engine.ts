import { randomUUID } from 'crypto';
import type {
  RoutingRule,
  CreateRoutingRuleInput,
  UpdateRoutingRuleInput,
  RoutingCondition,
  RoutingAction,
  DryRunResult,
  TriggerEvent,
} from '../schemas/integration.js';

/**
 * P2 #15: Rule-based alert routing engine.
 * Evaluates conditions against incoming events and routes
 * to configured integrations. Supports CRUD, priority ordering,
 * and dry-run simulation.
 */
export class AlertRoutingEngine {
  private rules = new Map<string, RoutingRule>();

  // ─── Rule CRUD ──────────────────────────────────────────────

  /** Create a new routing rule. */
  createRule(tenantId: string, input: CreateRoutingRuleInput): RoutingRule {
    const now = new Date().toISOString();
    const rule: RoutingRule = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      description: input.description ?? '',
      enabled: input.enabled ?? true,
      priority: input.priority ?? 100,
      conditions: input.conditions,
      conditionLogic: input.conditionLogic ?? 'AND',
      actions: input.actions,
      triggerEvents: input.triggerEvents,
      matchCount: 0,
      lastMatchedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rules.set(rule.id, rule);
    return rule;
  }

  /** Get a rule by ID, filtered by tenant. */
  getRule(id: string, tenantId: string): RoutingRule | undefined {
    const rule = this.rules.get(id);
    if (!rule || rule.tenantId !== tenantId) return undefined;
    return rule;
  }

  /** List rules for a tenant, sorted by priority (ascending). */
  listRules(
    tenantId: string,
    opts: { enabled?: boolean; page: number; limit: number },
  ): { data: RoutingRule[]; total: number } {
    let items = Array.from(this.rules.values()).filter(
      (r) => r.tenantId === tenantId,
    );
    if (opts.enabled !== undefined) {
      items = items.filter((r) => r.enabled === opts.enabled);
    }
    items.sort((a, b) => a.priority - b.priority);
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Update a rule. */
  updateRule(
    id: string,
    tenantId: string,
    input: UpdateRoutingRuleInput,
  ): RoutingRule | undefined {
    const existing = this.getRule(id, tenantId);
    if (!existing) return undefined;

    const updated: RoutingRule = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.conditions !== undefined && { conditions: input.conditions }),
      ...(input.conditionLogic !== undefined && { conditionLogic: input.conditionLogic }),
      ...(input.actions !== undefined && { actions: input.actions }),
      ...(input.triggerEvents !== undefined && { triggerEvents: input.triggerEvents }),
      updatedAt: new Date().toISOString(),
    };
    this.rules.set(id, updated);
    return updated;
  }

  /** Delete a rule. */
  deleteRule(id: string, tenantId: string): boolean {
    const existing = this.getRule(id, tenantId);
    if (!existing) return false;
    this.rules.delete(id);
    return true;
  }

  /** Reorder rules by setting new priorities. */
  reorderRules(
    tenantId: string,
    ordering: Array<{ ruleId: string; priority: number }>,
  ): RoutingRule[] {
    const updated: RoutingRule[] = [];
    for (const { ruleId, priority } of ordering) {
      const rule = this.getRule(ruleId, tenantId);
      if (rule) {
        rule.priority = priority;
        rule.updatedAt = new Date().toISOString();
        updated.push(rule);
      }
    }
    return updated.sort((a, b) => a.priority - b.priority);
  }

  // ─── Evaluation ─────────────────────────────────────────────

  /**
   * Evaluate all enabled rules for a tenant against an event payload.
   * Returns matching rules and their actions, in priority order.
   */
  evaluate(
    tenantId: string,
    event: TriggerEvent,
    payload: Record<string, unknown>,
  ): Array<{ rule: RoutingRule; actions: RoutingAction[] }> {
    const matches: Array<{ rule: RoutingRule; actions: RoutingAction[] }> = [];

    const { data: rules } = this.listRules(tenantId, { enabled: true, page: 1, limit: 500 });

    for (const rule of rules) {
      // Check if this rule handles this event type
      if (!rule.triggerEvents.includes(event)) continue;

      // Evaluate conditions
      const conditionResults = rule.conditions.map((c) =>
        this.evaluateCondition(c, payload),
      );

      const matched = rule.conditionLogic === 'AND'
        ? conditionResults.every((r) => r)
        : conditionResults.some((r) => r);

      if (matched) {
        rule.matchCount++;
        rule.lastMatchedAt = new Date().toISOString();
        matches.push({ rule, actions: rule.actions });
      }
    }

    return matches;
  }

  /**
   * Dry-run a rule against a test payload.
   * Returns detailed condition evaluation results without executing actions.
   */
  dryRun(
    ruleId: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ): DryRunResult | null {
    const rule = this.getRule(ruleId, tenantId);
    if (!rule) return null;

    const conditionResults = rule.conditions.map((c) => {
      const actual = this.getNestedValue(payload, c.field);
      const passed = this.evaluateCondition(c, payload);
      return {
        field: c.field,
        operator: c.operator,
        expected: c.value,
        actual,
        passed,
      };
    });

    const matched = rule.conditionLogic === 'AND'
      ? conditionResults.every((r) => r.passed)
      : conditionResults.some((r) => r.passed);

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matched,
      conditionResults,
      actionsWouldExecute: matched ? rule.actions : [],
    };
  }

  // ─── Condition Evaluation ───────────────────────────────────

  /** Evaluate a single condition against a payload. */
  private evaluateCondition(
    condition: RoutingCondition,
    payload: Record<string, unknown>,
  ): boolean {
    const actual = this.getNestedValue(payload, condition.field);
    const expected = condition.value;

    switch (condition.operator) {
      case 'equals':
        return String(actual) === String(expected);
      case 'not_equals':
        return String(actual) !== String(expected);
      case 'contains':
        return typeof actual === 'string' && actual.includes(String(expected));
      case 'greater_than':
        return Number(actual) > Number(expected);
      case 'less_than':
        return Number(actual) < Number(expected);
      case 'in':
        if (Array.isArray(expected)) {
          return expected.includes(String(actual));
        }
        return false;
      case 'not_in':
        if (Array.isArray(expected)) {
          return !expected.includes(String(actual));
        }
        return true;
      default:
        return false;
    }
  }

  /** Get a nested value from an object using dot notation. */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
