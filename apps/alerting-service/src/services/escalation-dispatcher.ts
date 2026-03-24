import type { Alert, AlertStore } from './alert-store.js';
import type { EscalationStore, EscalationPolicy } from './escalation-store.js';
import type { ChannelStore } from './channel-store.js';
import type { Notifier } from './notifier.js';
import type { AlertHistory } from './alert-history.js';
import { getLogger } from '../logger.js';

export interface EscalationDispatcherDeps {
  alertStore: AlertStore;
  escalationStore: EscalationStore;
  channelStore: ChannelStore;
  notifier: Notifier;
  alertHistory: AlertHistory;
}

interface PendingEscalation {
  alertId: string;
  policyId: string;
  currentStep: number;
  nextEscalationAt: number;
}

/**
 * Connects escalation policies to the alert lifecycle.
 * Tracks open/escalated alerts with policies and auto-escalates after step delays.
 * Runs on a periodic check interval.
 */
export class EscalationDispatcher {
  private pending = new Map<string, PendingEscalation>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly deps: EscalationDispatcherDeps;
  private readonly checkIntervalMs: number;

  constructor(deps: EscalationDispatcherDeps, checkIntervalMs: number = 30_000) {
    this.deps = deps;
    this.checkIntervalMs = checkIntervalMs;
  }

  /** Start the periodic escalation check. */
  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => { void this.checkEscalations(); }, this.checkIntervalMs);
    getLogger().info('Escalation dispatcher started');
  }

  /** Stop the periodic check. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /** Register an alert for escalation tracking. Called when an alert is created with an escalation policy. */
  track(alertId: string, policyId: string): void {
    const policy = this.deps.escalationStore.getById(policyId);
    if (!policy || !policy.enabled || policy.steps.length === 0) return;

    const firstStep = policy.steps[0];
    this.pending.set(alertId, {
      alertId,
      policyId,
      currentStep: 0,
      nextEscalationAt: Date.now() + firstStep.delayMinutes * 60_000,
    });
  }

  /** Remove an alert from escalation tracking (e.g., when resolved). */
  untrack(alertId: string): void {
    this.pending.delete(alertId);
  }

  /** Check all pending escalations and execute any that are due. */
  async checkEscalations(): Promise<number> {
    const logger = getLogger();
    const now = Date.now();
    let escalated = 0;

    for (const [alertId, pending] of this.pending) {
      if (now < pending.nextEscalationAt) continue;

      const alert = this.deps.alertStore.getById(alertId);
      if (!alert) {
        this.pending.delete(alertId);
        continue;
      }

      // Skip if already resolved or suppressed
      if (alert.status === 'resolved' || alert.status === 'suppressed') {
        this.pending.delete(alertId);
        continue;
      }

      const policy = this.deps.escalationStore.getById(pending.policyId);
      if (!policy || !policy.enabled) {
        this.pending.delete(alertId);
        continue;
      }

      const step = policy.steps[pending.currentStep];
      if (!step) {
        this.handleRepeatOrStop(pending, policy);
        continue;
      }

      // Execute escalation step
      await this.executeStep(alert, policy, pending, step.channelIds, step.notifyMessage);
      escalated++;

      // Advance to next step
      const nextStep = pending.currentStep + 1;
      if (nextStep < policy.steps.length) {
        pending.currentStep = nextStep;
        pending.nextEscalationAt = now + policy.steps[nextStep].delayMinutes * 60_000;
      } else {
        this.handleRepeatOrStop(pending, policy);
      }
    }

    if (escalated > 0) logger.info({ escalated }, 'Escalation check completed');
    return escalated;
  }

  private async executeStep(
    alert: Alert,
    policy: EscalationPolicy,
    pending: PendingEscalation,
    channelIds: string[],
    message?: string | null,
  ): Promise<void> {
    const logger = getLogger();

    // Escalate the alert status
    try {
      if (alert.status === 'open' || alert.status === 'acknowledged' || alert.status === 'escalated') {
        // Only transition if valid
        if (alert.status !== 'escalated') {
          this.deps.alertStore.escalate(alert.id);
        } else {
          // Already escalated — increment level manually
          alert.escalationLevel++;
          alert.escalatedAt = new Date().toISOString();
          alert.updatedAt = new Date().toISOString();
        }
      }
    } catch (err) {
      logger.warn({ alertId: alert.id, err }, 'Could not escalate alert status');
    }

    // Record in history
    this.deps.alertHistory.record({
      alertId: alert.id,
      action: 'auto_escalate',
      fromStatus: alert.status,
      toStatus: 'escalated',
      actor: 'escalation-dispatcher',
      reason: `Policy "${policy.name}" step ${pending.currentStep + 1}: ${message ?? 'auto-escalation'}`,
      metadata: { policyId: policy.id, step: pending.currentStep + 1 },
    });

    // Send notifications to step channels
    const channels = this.deps.channelStore.getByIds(channelIds);
    if (channels.length > 0) {
      const results = await this.deps.notifier.notifyAll(channels, alert);
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        logger.warn({ alertId: alert.id, failed }, 'Some escalation notifications failed');
      }
    }

    logger.info(
      { alertId: alert.id, policyId: policy.id, step: pending.currentStep + 1, level: alert.escalationLevel },
      'Escalation step executed',
    );
  }

  private handleRepeatOrStop(pending: PendingEscalation, policy: EscalationPolicy): void {
    if (policy.repeatAfterMinutes > 0) {
      // Reset to step 0 and schedule repeat
      pending.currentStep = 0;
      pending.nextEscalationAt = Date.now() + policy.repeatAfterMinutes * 60_000;
    } else {
      this.pending.delete(pending.alertId);
    }
  }

  /** Get count of alerts being tracked for escalation. */
  trackedCount(): number {
    return this.pending.size;
  }

  /** Clear all pending escalations (for testing). */
  clear(): void {
    this.pending.clear();
  }
}
