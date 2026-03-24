import { describe, it, expect, beforeEach } from 'vitest';
import { RuleEngine, type EvaluationEvent } from '../src/services/rule-engine.js';
import type { AlertRule } from '../src/services/rule-store.js';

function makeRule(overrides?: Partial<AlertRule>): AlertRule {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    description: '',
    tenantId: 'tenant-1',
    severity: 'high',
    condition: {
      type: 'threshold',
      threshold: { metric: 'critical_iocs', operator: 'gt', value: 5, windowMinutes: 60 },
    },
    enabled: true,
    channelIds: [],
    escalationPolicyId: null,
    cooldownMinutes: 15,
    tags: [],
    lastTriggeredAt: null,
    triggerCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<EvaluationEvent>): EvaluationEvent {
  return {
    tenantId: 'tenant-1',
    eventType: 'ioc.created',
    metric: 'critical_iocs',
    value: 1,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('RuleEngine', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  // ─── Threshold Rules ──────────────────────────────────────────────

  describe('threshold evaluation', () => {
    it('triggers when metric exceeds threshold', () => {
      for (let i = 0; i < 10; i++) engine.pushEvent(makeEvent({ value: 1 }));
      const rule = makeRule();
      const result = engine.evaluate(rule);
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('critical_iocs');
    });

    it('does not trigger when metric is below threshold', () => {
      for (let i = 0; i < 3; i++) engine.pushEvent(makeEvent({ value: 1 }));
      const rule = makeRule();
      const result = engine.evaluate(rule);
      expect(result.triggered).toBe(false);
    });

    it('supports gte operator', () => {
      for (let i = 0; i < 5; i++) engine.pushEvent(makeEvent({ value: 1 }));
      const rule = makeRule({
        condition: {
          type: 'threshold',
          threshold: { metric: 'critical_iocs', operator: 'gte', value: 5, windowMinutes: 60 },
        },
      });
      expect(engine.evaluate(rule).triggered).toBe(true);
    });

    it('supports lt operator', () => {
      engine.pushEvent(makeEvent({ value: 2 }));
      const rule = makeRule({
        condition: {
          type: 'threshold',
          threshold: { metric: 'critical_iocs', operator: 'lt', value: 5, windowMinutes: 60 },
        },
      });
      expect(engine.evaluate(rule).triggered).toBe(true);
    });

    it('supports lte operator', () => {
      for (let i = 0; i < 5; i++) engine.pushEvent(makeEvent({ value: 1 }));
      const rule = makeRule({
        condition: {
          type: 'threshold',
          threshold: { metric: 'critical_iocs', operator: 'lte', value: 5, windowMinutes: 60 },
        },
      });
      expect(engine.evaluate(rule).triggered).toBe(true);
    });

    it('supports eq operator', () => {
      for (let i = 0; i < 5; i++) engine.pushEvent(makeEvent({ value: 1 }));
      const rule = makeRule({
        condition: {
          type: 'threshold',
          threshold: { metric: 'critical_iocs', operator: 'eq', value: 5, windowMinutes: 60 },
        },
      });
      expect(engine.evaluate(rule).triggered).toBe(true);
    });

    it('ignores events outside window', () => {
      const oldTimestamp = new Date(Date.now() - 120 * 60_000).toISOString();
      for (let i = 0; i < 10; i++) engine.pushEvent(makeEvent({ value: 1, timestamp: oldTimestamp }));
      const rule = makeRule();
      expect(engine.evaluate(rule).triggered).toBe(false);
    });

    it('only counts matching metric events', () => {
      for (let i = 0; i < 10; i++) engine.pushEvent(makeEvent({ metric: 'other_metric', value: 1 }));
      const rule = makeRule();
      expect(engine.evaluate(rule).triggered).toBe(false);
    });
  });

  // ─── Pattern Rules ────────────────────────────────────────────────

  describe('pattern evaluation', () => {
    const patternRule = makeRule({
      id: 'pattern-rule',
      condition: {
        type: 'pattern',
        pattern: {
          eventType: 'ioc.created',
          field: 'actorName',
          pattern: 'APT.*',
          minOccurrences: 3,
          windowMinutes: 60,
        },
      },
    });

    it('triggers when pattern matches enough times', () => {
      for (let i = 0; i < 3; i++) {
        engine.pushEvent(makeEvent({
          eventType: 'ioc.created',
          field: 'actorName',
          fieldValue: `APT${28 + i}`,
        }));
      }
      expect(engine.evaluate(patternRule).triggered).toBe(true);
    });

    it('does not trigger when pattern matches too few times', () => {
      engine.pushEvent(makeEvent({
        eventType: 'ioc.created',
        field: 'actorName',
        fieldValue: 'APT28',
      }));
      expect(engine.evaluate(patternRule).triggered).toBe(false);
    });

    it('ignores events with non-matching eventType', () => {
      for (let i = 0; i < 5; i++) {
        engine.pushEvent(makeEvent({
          eventType: 'feed.fetched',
          field: 'actorName',
          fieldValue: 'APT28',
        }));
      }
      expect(engine.evaluate(patternRule).triggered).toBe(false);
    });

    it('ignores events with non-matching field', () => {
      for (let i = 0; i < 5; i++) {
        engine.pushEvent(makeEvent({
          eventType: 'ioc.created',
          field: 'otherField',
          fieldValue: 'APT28',
        }));
      }
      expect(engine.evaluate(patternRule).triggered).toBe(false);
    });
  });

  // ─── Anomaly Rules ────────────────────────────────────────────────

  describe('anomaly evaluation', () => {
    const anomalyRule = makeRule({
      id: 'anomaly-rule',
      condition: {
        type: 'anomaly',
        anomaly: { metric: 'ioc_rate', deviationMultiplier: 2, baselineWindowHours: 24 },
      },
    });

    it('does not trigger with insufficient data', () => {
      engine.pushEvent(makeEvent({ metric: 'ioc_rate', value: 5 }));
      expect(engine.evaluate(anomalyRule).triggered).toBe(false);
      expect(engine.evaluate(anomalyRule).reason).toContain('Insufficient data');
    });

    it('triggers when current value exceeds deviation', () => {
      // Baseline: low values
      const baseTimestamp = new Date(Date.now() - 2 * 3600_000).toISOString();
      for (let i = 0; i < 20; i++) {
        engine.pushEvent(makeEvent({ metric: 'ioc_rate', value: 5, timestamp: baseTimestamp }));
      }
      // Current: spike
      for (let i = 0; i < 10; i++) {
        engine.pushEvent(makeEvent({ metric: 'ioc_rate', value: 100 }));
      }
      const result = engine.evaluate(anomalyRule);
      expect(result.triggered).toBe(true);
      expect(result.reason).toContain('Anomaly');
    });

    it('does not trigger when values are normal', () => {
      for (let i = 0; i < 10; i++) {
        engine.pushEvent(makeEvent({ metric: 'ioc_rate', value: 5 }));
      }
      expect(engine.evaluate(anomalyRule).triggered).toBe(false);
    });
  });

  // ─── Absence Rules ────────────────────────────────────────────────

  describe('absence evaluation', () => {
    const absenceRule = makeRule({
      id: 'absence-rule',
      condition: {
        type: 'absence',
        absence: { eventType: 'feed.fetched', expectedIntervalMinutes: 120 },
      },
    });

    it('triggers when no events of type exist in window', () => {
      // Push only unrelated events
      engine.pushEvent(makeEvent({ eventType: 'ioc.created' }));
      expect(engine.evaluate(absenceRule).triggered).toBe(true);
      expect(engine.evaluate(absenceRule).reason).toContain('Absence');
    });

    it('does not trigger when events exist in window', () => {
      engine.pushEvent(makeEvent({ eventType: 'feed.fetched' }));
      expect(engine.evaluate(absenceRule).triggered).toBe(false);
    });
  });

  // ─── Buffer Management ────────────────────────────────────────────

  describe('buffer management', () => {
    it('reports buffer size', () => {
      engine.pushEvent(makeEvent());
      engine.pushEvent(makeEvent());
      expect(engine.getBufferSize('tenant-1')).toBe(2);
    });

    it('reports 0 for empty buffer', () => {
      expect(engine.getBufferSize('tenant-1')).toBe(0);
    });

    it('trims old events beyond max age', () => {
      const engine2 = new RuleEngine(10000, 1); // 1 hour max
      const oldTimestamp = new Date(Date.now() - 2 * 3600_000).toISOString();
      engine2.pushEvent(makeEvent({ timestamp: oldTimestamp }));
      engine2.pushEvent(makeEvent()); // This push triggers trim
      expect(engine2.getBufferSize('tenant-1')).toBe(1);
    });

    it('trims when buffer exceeds max count', () => {
      const engine2 = new RuleEngine(3, 168);
      for (let i = 0; i < 5; i++) engine2.pushEvent(makeEvent());
      expect(engine2.getBufferSize('tenant-1')).toBe(3);
    });

    it('clears all buffers', () => {
      engine.pushEvent(makeEvent());
      engine.clear();
      expect(engine.getBufferSize('tenant-1')).toBe(0);
    });
  });
});
