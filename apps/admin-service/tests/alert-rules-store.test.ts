import { describe, it, expect, beforeEach } from 'vitest';
import { AlertRulesStore } from '../src/services/alert-rules-store.js';

describe('AlertRulesStore', () => {
  let store: AlertRulesStore;

  beforeEach(() => {
    store = new AlertRulesStore();
  });

  describe('create', () => {
    it('creates an alert rule with defaults', () => {
      const rule = store.create({
        name: 'High CPU',
        metric: 'cpu',
        threshold: 90,
        operator: 'gt',
        severity: 'critical',
        notifyChannels: ['email'],
      });
      expect(rule.id).toBeTruthy();
      expect(rule.enabled).toBe(true);
      expect(rule.cooldownMs).toBeGreaterThan(0);
    });

    it('sets enabled=true by default', () => {
      const rule = store.create({ name: 'Mem alert', metric: 'memory', threshold: 80, operator: 'gt', severity: 'warning', notifyChannels: [] });
      expect(rule.enabled).toBe(true);
    });

    it('initializes default rules on construction', () => {
      const rules = store.list();
      expect(rules.length).toBeGreaterThan(0);
    });
  });

  describe('list', () => {
    it('returns all rules', () => {
      const initial = store.list().length;
      store.create({ name: 'New', metric: 'disk', threshold: 85, operator: 'gt', severity: 'warning', notifyChannels: [] });
      expect(store.list().length).toBe(initial + 1);
    });
  });

  describe('getById', () => {
    it('returns rule by id', () => {
      const rule = store.create({ name: 'Test', metric: 'queue_lag', threshold: 1000, operator: 'gt', severity: 'warning', notifyChannels: [] });
      expect(store.getById(rule.id)?.id).toBe(rule.id);
    });

    it('returns undefined for unknown id', () => {
      expect(store.getById('bad')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('updates threshold', () => {
      const rule = store.create({ name: 'CPU', metric: 'cpu', threshold: 80, operator: 'gt', severity: 'warning', notifyChannels: [] });
      const updated = store.update(rule.id, { threshold: 95 });
      expect(updated?.threshold).toBe(95);
    });

    it('can disable a rule', () => {
      const rule = store.create({ name: 'CPU', metric: 'cpu', threshold: 80, operator: 'gt', severity: 'warning', notifyChannels: [] });
      store.update(rule.id, { enabled: false });
      expect(store.getById(rule.id)?.enabled).toBe(false);
    });

    it('returns undefined for unknown id', () => {
      expect(store.update('bad', { threshold: 50 })).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('removes the rule', () => {
      const rule = store.create({ name: 'Del', metric: 'cpu', threshold: 80, operator: 'gt', severity: 'warning', notifyChannels: [] });
      expect(store.delete(rule.id)).toBe(true);
      expect(store.getById(rule.id)).toBeUndefined();
    });

    it('returns false for unknown id', () => {
      expect(store.delete('bad')).toBe(false);
    });
  });

  describe('evaluate', () => {
    it('returns triggered alerts when metric exceeds threshold', () => {
      store.create({ name: 'CPU Alert', metric: 'cpu', threshold: 50, operator: 'gt', severity: 'critical', notifyChannels: [] });
      const alerts = store.evaluate({ cpu: 80, memory: 40, disk: 30, queueLag: 0, errorRate: 0 });
      expect(alerts.some((a) => a.metric === 'cpu')).toBe(true);
    });

    it('returns no alerts when all metrics below threshold', () => {
      const alerts = store.evaluate({ cpu: 10, memory: 20, disk: 15, queueLag: 0, errorRate: 0 });
      // Default rules have high thresholds — with low metrics no critical alerts
      const critical = alerts.filter((a) => a.severity === 'critical');
      expect(critical.length).toBe(0);
    });
  });
});
