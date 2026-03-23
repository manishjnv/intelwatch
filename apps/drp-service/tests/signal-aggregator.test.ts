import { describe, it, expect, beforeEach } from 'vitest';
import { SignalAggregator } from '../src/services/signal-aggregator.js';
import { DRPStore } from '../src/schemas/store.js';

describe('DRP Service — P0#2 Signal Aggregator', () => {
  let store: DRPStore;
  let aggregator: SignalAggregator;
  const tenantId = 'tenant-1';

  beforeEach(() => {
    store = new DRPStore();
    aggregator = new SignalAggregator(store);
  });

  // P2.1 recordSignal returns a signal ID
  it('P2.1 recordSignal returns a signal ID', () => {
    const id = aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'breach_severity',
      rawValue: 0.8,
      considered: true,
      reason: 'Critical breach detected',
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  // P2.2 recorded signals are stored
  it('P2.2 recorded signals are stored in the store', () => {
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'breach_severity',
      rawValue: 0.8,
      considered: true,
      reason: 'Critical breach',
    });
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'exposed_count',
      rawValue: 0.5,
      considered: true,
      reason: '500k exposed',
    });

    const signals = store.getTenantSignals(tenantId);
    expect(signals.length).toBe(2);
    expect(signals[0]!.signalType).toBe('breach_severity');
    expect(signals[1]!.signalType).toBe('exposed_count');
  });

  // P2.3 linkSignalToAlert updates the signal
  it('P2.3 linkSignalToAlert updates the signal alertId', () => {
    const id = aggregator.recordSignal(tenantId, 'temp-alert', {
      signalType: 'service_risk',
      rawValue: 0.9,
      considered: true,
      reason: 'Telnet exposed',
    });

    aggregator.linkSignalToAlert(tenantId, id, 'real-alert-42');

    const signals = store.getTenantSignals(tenantId);
    const updated = signals.find((s) => s.id === id);
    expect(updated).toBeDefined();
    expect(updated!.alertId).toBe('real-alert-42');
  });

  // P2.4 incrementSignalFires updates stats
  it('P2.4 recording a signal increments totalFires in stats', () => {
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'breach_severity',
      rawValue: 0.8,
      considered: true,
      reason: 'Test',
    });
    aggregator.recordSignal(tenantId, 'alert-2', {
      signalType: 'breach_severity',
      rawValue: 0.6,
      considered: true,
      reason: 'Test 2',
    });

    const stat = aggregator.getSignalStat(tenantId, 'breach_severity');
    expect(stat).toBeDefined();
    expect(stat!.totalFires).toBe(2);
  });

  // P2.5 recordFeedback updates TP count
  it('P2.5 recordFeedback updates TP count', () => {
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'breach_severity',
      rawValue: 0.8,
      considered: true,
      reason: 'Breach detected',
    });

    aggregator.recordFeedback(tenantId, 'alert-1', 'true_positive');

    const stat = aggregator.getSignalStat(tenantId, 'breach_severity');
    expect(stat).toBeDefined();
    expect(stat!.tpCount).toBe(1);
    expect(stat!.fpCount).toBe(0);
  });

  // P2.6 recordFeedback updates FP count
  it('P2.6 recordFeedback updates FP count', () => {
    aggregator.recordSignal(tenantId, 'alert-2', {
      signalType: 'exposed_count',
      rawValue: 0.3,
      considered: true,
      reason: 'Small leak',
    });

    aggregator.recordFeedback(tenantId, 'alert-2', 'false_positive');

    const stat = aggregator.getSignalStat(tenantId, 'exposed_count');
    expect(stat).toBeDefined();
    expect(stat!.fpCount).toBe(1);
    expect(stat!.tpCount).toBe(0);
  });

  // P2.7 success rate computed correctly
  it('P2.7 success rate computed correctly', () => {
    // Record 3 signals for same alert, then give TP feedback
    aggregator.recordSignal(tenantId, 'alert-A', {
      signalType: 'keyword_density',
      rawValue: 0.7,
      considered: true,
      reason: 'Keywords found',
    });

    // Give TP then FP feedback to different alerts
    aggregator.recordFeedback(tenantId, 'alert-A', 'true_positive');

    // Record another for same type on different alert and give FP
    aggregator.recordSignal(tenantId, 'alert-B', {
      signalType: 'keyword_density',
      rawValue: 0.4,
      considered: true,
      reason: 'Weak match',
    });
    aggregator.recordFeedback(tenantId, 'alert-B', 'false_positive');

    const stat = aggregator.getSignalStat(tenantId, 'keyword_density');
    expect(stat).toBeDefined();
    expect(stat!.tpCount).toBe(1);
    expect(stat!.fpCount).toBe(1);
    // successRate = 1 / (1 + 1) = 0.5
    expect(stat!.successRate).toBe(0.5);
  });

  // P2.8 getSignalStats returns all tracked types
  it('P2.8 getSignalStats returns all tracked types', () => {
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'breach_severity',
      rawValue: 0.8,
      considered: true,
      reason: 'Test',
    });
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'exposed_count',
      rawValue: 0.5,
      considered: true,
      reason: 'Test',
    });
    aggregator.recordSignal(tenantId, 'alert-2', {
      signalType: 'service_risk',
      rawValue: 0.9,
      considered: true,
      reason: 'Test',
    });

    const stats = aggregator.getSignalStats(tenantId);
    expect(stats.length).toBe(3);

    const types = stats.map((s) => s.signalType);
    expect(types).toContain('breach_severity');
    expect(types).toContain('exposed_count');
    expect(types).toContain('service_risk');
  });

  // P2.9 getSignalStat returns specific type
  it('P2.9 getSignalStat returns specific type', () => {
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'breach_severity',
      rawValue: 0.8,
      considered: true,
      reason: 'Breach found',
    });
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'exposed_count',
      rawValue: 0.5,
      considered: true,
      reason: 'Count check',
    });

    const stat = aggregator.getSignalStat(tenantId, 'breach_severity');
    expect(stat).toBeDefined();
    expect(stat!.signalType).toBe('breach_severity');
    expect(stat!.totalFires).toBe(1);

    // Non-existent type returns undefined
    const missing = aggregator.getSignalStat(tenantId, 'nonexistent_type');
    expect(missing).toBeUndefined();
  });

  // P2.10 getSignalsForAlert filters by alertId
  it('P2.10 getSignalsForAlert filters by alertId', () => {
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'breach_severity',
      rawValue: 0.8,
      considered: true,
      reason: 'Alert 1 signal',
    });
    aggregator.recordSignal(tenantId, 'alert-1', {
      signalType: 'exposed_count',
      rawValue: 0.5,
      considered: true,
      reason: 'Alert 1 signal 2',
    });
    aggregator.recordSignal(tenantId, 'alert-2', {
      signalType: 'service_risk',
      rawValue: 0.9,
      considered: true,
      reason: 'Alert 2 signal',
    });

    const alert1Signals = aggregator.getSignalsForAlert(tenantId, 'alert-1');
    expect(alert1Signals.length).toBe(2);
    expect(alert1Signals.every((s) => s.alertId === 'alert-1')).toBe(true);

    const alert2Signals = aggregator.getSignalsForAlert(tenantId, 'alert-2');
    expect(alert2Signals.length).toBe(1);
    expect(alert2Signals[0]!.alertId).toBe('alert-2');
  });

  // P2.11 multiple signals for same alert all get feedback
  it('P2.11 multiple signals for same alert all get feedback applied', () => {
    aggregator.recordSignal(tenantId, 'alert-X', {
      signalType: 'breach_severity',
      rawValue: 0.9,
      considered: true,
      reason: 'Signal A',
    });
    aggregator.recordSignal(tenantId, 'alert-X', {
      signalType: 'password_included',
      rawValue: 0.85,
      considered: true,
      reason: 'Signal B',
    });
    aggregator.recordSignal(tenantId, 'alert-X', {
      signalType: 'breach_recency',
      rawValue: 0.7,
      considered: true,
      reason: 'Signal C',
    });

    aggregator.recordFeedback(tenantId, 'alert-X', 'true_positive');

    // All three signal types should have their TP count incremented
    const severityStat = aggregator.getSignalStat(tenantId, 'breach_severity');
    const passwordStat = aggregator.getSignalStat(tenantId, 'password_included');
    const recencyStat = aggregator.getSignalStat(tenantId, 'breach_recency');

    expect(severityStat!.tpCount).toBe(1);
    expect(passwordStat!.tpCount).toBe(1);
    expect(recencyStat!.tpCount).toBe(1);
  });

  // P2.12 stats sorted by totalFires descending
  it('P2.12 stats sorted by totalFires descending', () => {
    // Fire breach_severity 3 times
    for (let i = 0; i < 3; i++) {
      aggregator.recordSignal(tenantId, `alert-${i}`, {
        signalType: 'breach_severity',
        rawValue: 0.8,
        considered: true,
        reason: 'Test',
      });
    }
    // Fire exposed_count 1 time
    aggregator.recordSignal(tenantId, 'alert-e', {
      signalType: 'exposed_count',
      rawValue: 0.5,
      considered: true,
      reason: 'Test',
    });
    // Fire service_risk 2 times
    aggregator.recordSignal(tenantId, 'alert-s1', {
      signalType: 'service_risk',
      rawValue: 0.9,
      considered: true,
      reason: 'Test',
    });
    aggregator.recordSignal(tenantId, 'alert-s2', {
      signalType: 'service_risk',
      rawValue: 0.7,
      considered: true,
      reason: 'Test',
    });

    const stats = aggregator.getSignalStats(tenantId);
    expect(stats.length).toBe(3);
    expect(stats[0]!.signalType).toBe('breach_severity');
    expect(stats[0]!.totalFires).toBe(3);
    expect(stats[1]!.signalType).toBe('service_risk');
    expect(stats[1]!.totalFires).toBe(2);
    expect(stats[2]!.signalType).toBe('exposed_count');
    expect(stats[2]!.totalFires).toBe(1);
  });
});
