import { randomUUID } from 'node:crypto';
import type { DRPStore } from '../schemas/store.js';
import type { DetectionSignal, SignalStats } from '../schemas/drp.js';

/**
 * #2 Signal Success Rate Tracking.
 *
 * Logs every detection signal and tracks TP/FP feedback per signal type.
 * Enables identification of unreliable signals for de-weighting over time.
 */
export class SignalAggregator {
  private readonly store: DRPStore;

  constructor(store: DRPStore) {
    this.store = store;
  }

  /** Record a new detection signal and return its ID. */
  recordSignal(
    tenantId: string,
    alertId: string,
    input: {
      signalType: string;
      rawValue: number;
      considered: boolean;
      reason: string;
    },
  ): string {
    const signal: DetectionSignal = {
      id: randomUUID(),
      tenantId,
      alertId,
      signalType: input.signalType,
      rawValue: input.rawValue,
      considered: input.considered,
      reason: input.reason,
      detectedAt: new Date().toISOString(),
    };

    this.store.addSignal(tenantId, signal);
    this.incrementSignalFires(tenantId, input.signalType);
    return signal.id;
  }

  /** Link a signal to an alert after alert creation. */
  linkSignalToAlert(tenantId: string, signalId: string, alertId: string): void {
    const signals = this.store.getTenantSignals(tenantId);
    const signal = signals.find((s) => s.id === signalId);
    if (signal) {
      signal.alertId = alertId;
    }
  }

  /** Record TP/FP feedback for a specific alert's signals. */
  recordFeedback(
    tenantId: string,
    alertId: string,
    verdict: 'true_positive' | 'false_positive',
  ): void {
    const signals = this.store.getTenantSignals(tenantId);
    const alertSignals = signals.filter((s) => s.alertId === alertId);
    const statsMap = this.store.getTenantSignalStats(tenantId);

    for (const sig of alertSignals) {
      const stats = this.getOrCreateStats(statsMap, sig.signalType);
      if (verdict === 'true_positive') {
        stats.tpCount++;
      } else {
        stats.fpCount++;
      }
      stats.successRate = stats.tpCount / (stats.tpCount + stats.fpCount);
      stats.lastUpdated = new Date().toISOString();
    }
  }

  /** Get success rates for all signal types. */
  getSignalStats(tenantId: string): SignalStats[] {
    const statsMap = this.store.getTenantSignalStats(tenantId);
    return Array.from(statsMap.values()).sort((a, b) => b.totalFires - a.totalFires);
  }

  /** Get stats for a specific signal type. */
  getSignalStat(tenantId: string, signalType: string): SignalStats | undefined {
    return this.store.getTenantSignalStats(tenantId).get(signalType);
  }

  /** Get signals for a specific alert. */
  getSignalsForAlert(tenantId: string, alertId: string): DetectionSignal[] {
    return this.store.getTenantSignals(tenantId).filter((s) => s.alertId === alertId);
  }

  /** Increment fire count for a signal type. */
  private incrementSignalFires(tenantId: string, signalType: string): void {
    const statsMap = this.store.getTenantSignalStats(tenantId);
    const stats = this.getOrCreateStats(statsMap, signalType);
    stats.totalFires++;
    stats.lastUpdated = new Date().toISOString();
  }

  /** Get or create stats entry for a signal type. */
  private getOrCreateStats(statsMap: Map<string, SignalStats>, signalType: string): SignalStats {
    let stats = statsMap.get(signalType);
    if (!stats) {
      stats = {
        signalType,
        totalFires: 0,
        tpCount: 0,
        fpCount: 0,
        successRate: 0,
        lastUpdated: new Date().toISOString(),
      };
      statsMap.set(signalType, stats);
    }
    return stats;
  }
}
