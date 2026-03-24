import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine } from '../src/services/rule-engine.js';
import type { AlertRule } from '../src/services/rule-store.js';
import type { RuleCondition } from '../src/schemas/alert.js';

function makeRule(condition: RuleCondition): AlertRule {
  return {
    id: 'composite-rule',
    name: 'Composite Test',
    description: '',
    tenantId: 'tenant-1',
    severity: 'critical',
    condition,
    enabled: true,
    channelIds: [],
    escalationPolicyId: null,
    cooldownMinutes: 0,
    tags: [],
    lastTriggeredAt: null,
    triggerCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('Composite rules', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  describe('AND operator', () => {
    it('triggers when all sub-conditions are met', () => {
      // Push events for both threshold and absence conditions
      for (let i = 0; i < 10; i++) {
        engine.pushEvent({
          tenantId: 'tenant-1', eventType: 'ioc.created', metric: 'critical_iocs',
          value: 1, timestamp: new Date().toISOString(),
        });
      }
      // No feed.fetched events → absence triggers

      const rule = makeRule({
        type: 'composite',
        composite: {
          operator: 'and',
          conditions: [
            { type: 'threshold', threshold: { metric: 'critical_iocs', operator: 'gt', value: 5, windowMinutes: 60 } },
            { type: 'absence', absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 120 } },
          ],
        },
      });

      const result = engine.evaluate(rule);
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('AND');
    });

    it('does not trigger when only one sub-condition is met', () => {
      // Push threshold events
      for (let i = 0; i < 10; i++) {
        engine.pushEvent({
          tenantId: 'tenant-1', eventType: 'ioc.created', metric: 'critical_iocs',
          value: 1, timestamp: new Date().toISOString(),
        });
      }
      // Also push feed.fetched → absence NOT triggered
      engine.pushEvent({
        tenantId: 'tenant-1', eventType: 'feed.fetched', timestamp: new Date().toISOString(),
      });

      const rule = makeRule({
        type: 'composite',
        composite: {
          operator: 'and',
          conditions: [
            { type: 'threshold', threshold: { metric: 'critical_iocs', operator: 'gt', value: 5, windowMinutes: 60 } },
            { type: 'absence', absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 120 } },
          ],
        },
      });

      expect(engine.evaluate(rule).triggered).toBe(false);
    });
  });

  describe('OR operator', () => {
    it('triggers when at least one sub-condition is met', () => {
      // Push threshold events only
      for (let i = 0; i < 10; i++) {
        engine.pushEvent({
          tenantId: 'tenant-1', eventType: 'ioc.created', metric: 'critical_iocs',
          value: 1, timestamp: new Date().toISOString(),
        });
      }
      // Push feed.fetched → absence NOT triggered
      engine.pushEvent({
        tenantId: 'tenant-1', eventType: 'feed.fetched', timestamp: new Date().toISOString(),
      });

      const rule = makeRule({
        type: 'composite',
        composite: {
          operator: 'or',
          conditions: [
            { type: 'threshold', threshold: { metric: 'critical_iocs', operator: 'gt', value: 5, windowMinutes: 60 } },
            { type: 'absence', absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 120 } },
          ],
        },
      });

      const result = engine.evaluate(rule);
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('OR');
    });

    it('does not trigger when no sub-conditions are met', () => {
      // Push some events but not enough for threshold
      engine.pushEvent({
        tenantId: 'tenant-1', eventType: 'ioc.created', metric: 'critical_iocs',
        value: 1, timestamp: new Date().toISOString(),
      });
      // Push feed.fetched → absence NOT triggered
      engine.pushEvent({
        tenantId: 'tenant-1', eventType: 'feed.fetched', timestamp: new Date().toISOString(),
      });

      const rule = makeRule({
        type: 'composite',
        composite: {
          operator: 'or',
          conditions: [
            { type: 'threshold', threshold: { metric: 'critical_iocs', operator: 'gt', value: 5, windowMinutes: 60 } },
            { type: 'absence', absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 120 } },
          ],
        },
      });

      expect(engine.evaluate(rule).triggered).toBe(false);
    });
  });

  it('composite reason includes sub-condition details', () => {
    for (let i = 0; i < 10; i++) {
      engine.pushEvent({
        tenantId: 'tenant-1', eventType: 'ioc.created', metric: 'critical_iocs',
        value: 1, timestamp: new Date().toISOString(),
      });
    }

    const rule = makeRule({
      type: 'composite',
      composite: {
        operator: 'and',
        conditions: [
          { type: 'threshold', threshold: { metric: 'critical_iocs', operator: 'gt', value: 5, windowMinutes: 60 } },
          { type: 'absence', absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 120 } },
        ],
      },
    });

    const result = engine.evaluate(rule);
    expect(result.reason).toContain('critical_iocs');
    expect(result.reason).toContain('feed.fetched');
  });
});
