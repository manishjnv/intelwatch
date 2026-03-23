import { describe, it, expect, beforeEach } from 'vitest';
import { AlertRoutingEngine } from '../src/services/alert-routing-engine.js';
import type { CreateRoutingRuleInput } from '../src/schemas/integration.js';

const TENANT = 'tenant-routing';

const makeRuleInput = (overrides: Partial<CreateRoutingRuleInput> = {}): CreateRoutingRuleInput => ({
  name: 'Critical Malware → Splunk + Jira',
  description: 'Route critical malware alerts to Splunk and create Jira ticket',
  enabled: true,
  priority: 10,
  conditions: [
    { field: 'severity', operator: 'equals', value: 'critical' },
    { field: 'type', operator: 'equals', value: 'malware' },
  ],
  conditionLogic: 'AND',
  actions: [
    { type: 'route_to_siem', integrationId: '00000000-0000-0000-0000-000000000001', config: {} },
    { type: 'create_ticket', integrationId: '00000000-0000-0000-0000-000000000002', config: {} },
  ],
  triggerEvents: ['alert.created'],
  ...overrides,
});

describe('AlertRoutingEngine', () => {
  let engine: AlertRoutingEngine;

  beforeEach(() => {
    engine = new AlertRoutingEngine();
  });

  // ─── CRUD ───────────────────────────────────────────────────

  it('creates a routing rule', () => {
    const rule = engine.createRule(TENANT, makeRuleInput());
    expect(rule.id).toBeDefined();
    expect(rule.name).toBe('Critical Malware → Splunk + Jira');
    expect(rule.conditions).toHaveLength(2);
    expect(rule.actions).toHaveLength(2);
    expect(rule.matchCount).toBe(0);
  });

  it('gets a rule by ID and tenant', () => {
    const rule = engine.createRule(TENANT, makeRuleInput());
    expect(engine.getRule(rule.id, TENANT)).toEqual(rule);
  });

  it('returns undefined for wrong tenant', () => {
    const rule = engine.createRule(TENANT, makeRuleInput());
    expect(engine.getRule(rule.id, 'other')).toBeUndefined();
  });

  it('lists rules sorted by priority', () => {
    engine.createRule(TENANT, makeRuleInput({ priority: 50, name: 'Low priority' }));
    engine.createRule(TENANT, makeRuleInput({ priority: 10, name: 'High priority' }));
    engine.createRule(TENANT, makeRuleInput({ priority: 30, name: 'Mid priority' }));

    const result = engine.listRules(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(3);
    expect(result.data[0]!.name).toBe('High priority');
    expect(result.data[2]!.name).toBe('Low priority');
  });

  it('filters by enabled', () => {
    engine.createRule(TENANT, makeRuleInput({ enabled: true }));
    engine.createRule(TENANT, makeRuleInput({ name: 'Disabled', enabled: false }));

    const result = engine.listRules(TENANT, { enabled: true, page: 1, limit: 50 });
    expect(result.total).toBe(1);
  });

  it('updates a rule', () => {
    const rule = engine.createRule(TENANT, makeRuleInput());
    const updated = engine.updateRule(rule.id, TENANT, {
      name: 'Updated Rule',
      priority: 5,
    });
    expect(updated?.name).toBe('Updated Rule');
    expect(updated?.priority).toBe(5);
  });

  it('deletes a rule', () => {
    const rule = engine.createRule(TENANT, makeRuleInput());
    expect(engine.deleteRule(rule.id, TENANT)).toBe(true);
    expect(engine.getRule(rule.id, TENANT)).toBeUndefined();
  });

  // ─── Reorder ────────────────────────────────────────────────

  it('reorders rules', () => {
    const r1 = engine.createRule(TENANT, makeRuleInput({ name: 'A', priority: 10 }));
    const r2 = engine.createRule(TENANT, makeRuleInput({ name: 'B', priority: 20 }));

    const reordered = engine.reorderRules(TENANT, [
      { ruleId: r1.id, priority: 100 },
      { ruleId: r2.id, priority: 1 },
    ]);
    expect(reordered[0]!.name).toBe('B'); // B now has priority 1
    expect(reordered[1]!.name).toBe('A'); // A now has priority 100
  });

  // ─── Evaluation ─────────────────────────────────────────────

  it('evaluates matching rule with AND logic', () => {
    engine.createRule(TENANT, makeRuleInput());
    const matches = engine.evaluate(TENANT, 'alert.created', {
      severity: 'critical',
      type: 'malware',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.actions).toHaveLength(2);
  });

  it('does not match when AND condition fails', () => {
    engine.createRule(TENANT, makeRuleInput());
    const matches = engine.evaluate(TENANT, 'alert.created', {
      severity: 'low',     // fails
      type: 'malware',     // passes
    });
    expect(matches).toHaveLength(0);
  });

  it('matches with OR logic when one condition passes', () => {
    engine.createRule(TENANT, makeRuleInput({ conditionLogic: 'OR' }));
    const matches = engine.evaluate(TENANT, 'alert.created', {
      severity: 'low',     // fails
      type: 'malware',     // passes
    });
    expect(matches).toHaveLength(1);
  });

  it('skips rules for non-matching trigger events', () => {
    engine.createRule(TENANT, makeRuleInput({ triggerEvents: ['ioc.created'] }));
    const matches = engine.evaluate(TENANT, 'alert.created', {
      severity: 'critical',
      type: 'malware',
    });
    expect(matches).toHaveLength(0);
  });

  it('skips disabled rules', () => {
    engine.createRule(TENANT, makeRuleInput({ enabled: false }));
    const matches = engine.evaluate(TENANT, 'alert.created', {
      severity: 'critical',
      type: 'malware',
    });
    expect(matches).toHaveLength(0);
  });

  it('increments matchCount on match', () => {
    const rule = engine.createRule(TENANT, makeRuleInput());
    engine.evaluate(TENANT, 'alert.created', { severity: 'critical', type: 'malware' });
    engine.evaluate(TENANT, 'alert.created', { severity: 'critical', type: 'malware' });

    const updated = engine.getRule(rule.id, TENANT);
    expect(updated?.matchCount).toBe(2);
    expect(updated?.lastMatchedAt).toBeDefined();
  });

  // ─── Condition Operators ────────────────────────────────────

  it('evaluates contains operator', () => {
    engine.createRule(TENANT, makeRuleInput({
      conditions: [{ field: 'description', operator: 'contains', value: 'ransomware' }],
    }));
    const matches = engine.evaluate(TENANT, 'alert.created', {
      description: 'Detected ransomware activity',
    });
    expect(matches).toHaveLength(1);
  });

  it('evaluates greater_than operator', () => {
    engine.createRule(TENANT, makeRuleInput({
      conditions: [{ field: 'confidence', operator: 'greater_than', value: 80 }],
    }));
    const m1 = engine.evaluate(TENANT, 'alert.created', { confidence: 95 });
    expect(m1).toHaveLength(1);
    const m2 = engine.evaluate(TENANT, 'alert.created', { confidence: 50 });
    expect(m2).toHaveLength(0);
  });

  it('evaluates in operator', () => {
    engine.createRule(TENANT, makeRuleInput({
      conditions: [{ field: 'severity', operator: 'in', value: ['critical', 'high'] }],
    }));
    expect(engine.evaluate(TENANT, 'alert.created', { severity: 'critical' })).toHaveLength(1);
    expect(engine.evaluate(TENANT, 'alert.created', { severity: 'low' })).toHaveLength(0);
  });

  it('evaluates not_equals operator', () => {
    engine.createRule(TENANT, makeRuleInput({
      conditions: [{ field: 'severity', operator: 'not_equals', value: 'info' }],
    }));
    expect(engine.evaluate(TENANT, 'alert.created', { severity: 'critical' })).toHaveLength(1);
    expect(engine.evaluate(TENANT, 'alert.created', { severity: 'info' })).toHaveLength(0);
  });

  // ─── Dry Run ────────────────────────────────────────────────

  it('dry-runs a rule with full condition results', () => {
    const rule = engine.createRule(TENANT, makeRuleInput());
    const result = engine.dryRun(rule.id, TENANT, {
      severity: 'critical',
      type: 'malware',
    });

    expect(result).toBeDefined();
    expect(result!.matched).toBe(true);
    expect(result!.conditionResults).toHaveLength(2);
    expect(result!.conditionResults[0]!.passed).toBe(true);
    expect(result!.conditionResults[0]!.actual).toBe('critical');
    expect(result!.actionsWouldExecute).toHaveLength(2);
  });

  it('dry-run shows failed conditions', () => {
    const rule = engine.createRule(TENANT, makeRuleInput());
    const result = engine.dryRun(rule.id, TENANT, {
      severity: 'low',
      type: 'malware',
    });

    expect(result!.matched).toBe(false);
    expect(result!.conditionResults[0]!.passed).toBe(false);
    expect(result!.conditionResults[0]!.actual).toBe('low');
    expect(result!.conditionResults[0]!.expected).toBe('critical');
    expect(result!.actionsWouldExecute).toHaveLength(0); // No actions when not matched
  });

  it('returns null dry-run for nonexistent rule', () => {
    expect(engine.dryRun('no-such', TENANT, {})).toBeNull();
  });

  // ─── Nested field access ────────────────────────────────────

  it('evaluates nested field paths', () => {
    engine.createRule(TENANT, makeRuleInput({
      conditions: [{ field: 'alert.severity', operator: 'equals', value: 'critical' }],
    }));
    const matches = engine.evaluate(TENANT, 'alert.created', {
      alert: { severity: 'critical' },
    });
    expect(matches).toHaveLength(1);
  });
});
