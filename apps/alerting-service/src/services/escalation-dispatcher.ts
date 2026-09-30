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

/**
 * Connects escalation policies to the alert lifecycle (Step 3 S155).
 * Escalation state (policyId/step/nextEscalationAt) lives on the alert row itself —
 * no in-process pending map — so it survives a restart and works across replicas
 * reading the same alert.
 * Runs on a periodic check interval.
 *
 * // ponytail: single alerting instance assumed; two instances could double-escalate
 * // the same due alert — add `SELECT ... FOR UPDATE SKIP LOCKED` if this service is ever scaled out.
 */
export class EscalationDispatcher {
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
    this.interval = setInterval(() => {
      this.checkEscalations().catch((err) => getLogger().error({ err }, 'Escalation check failed'));
    }, this.checkIntervalMs);
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
  async track(alertId: string, policyId: string, tenantId: string): Promise<void> {
    const policy = await this.deps.escalationStore.getById(policyId, tenantId);
    if (!policy || !policy.enabled || policy.steps.length === 0) return;

    const firstStep = policy.steps[0]!;
    await this.deps.alertStore.setEscalation(alertId, {
      escalationPolicyId: policyId,
      escalationStep: 0,
      nextEscalationAt: new Date(Date.now() + firstStep.delayMinutes * 60_000).toISOString(),
    });
  }

  /** Check all due escalations across tenants and execute any that are ready. */
  async checkEscalations(): Promise<number> {
    const logger = getLogger();
    const now = new Date();
    let escalated = 0;

    const due = await this.deps.alertStore.listDueEscalations(now);

    for (const alert of due) {
      if (alert.status === 'resolved' || alert.status === 'suppressed' || !alert.escalationPolicyId) {
        await this.deps.alertStore.setEscalation(alert.id, {
          escalationPolicyId: alert.escalationPolicyId,
          escalationStep: alert.escalationStep,
          nextEscalationAt: null,
        });
        continue;
      }

      // Scoped to the alert's tenant: a rule pointing at another tenant's policy never escalates
      const policy = await this.deps.escalationStore.getById(alert.escalationPolicyId, alert.tenantId);
      if (!policy || !policy.enabled) {
        await this.deps.alertStore.setEscalation(alert.id, {
          escalationPolicyId: alert.escalationPolicyId,
          escalationStep: alert.escalationStep,
          nextEscalationAt: null,
        });
        continue;
      }

      const step = policy.steps[alert.escalationStep];
      if (!step) {
        await this.handleRepeatOrStop(alert, policy);
        continue;
      }

      await this.executeStep(alert, policy, step.channelIds, step.notifyMessage);
      escalated++;

      const nextStepIdx = alert.escalationStep + 1;
      if (nextStepIdx < policy.steps.length) {
        await this.deps.alertStore.setEscalation(alert.id, {
          escalationPolicyId: policy.id,
          escalationStep: nextStepIdx,
          nextEscalationAt: new Date(now.getTime() + policy.steps[nextStepIdx]!.delayMinutes * 60_000).toISOString(),
        });
      } else {
        await this.handleRepeatOrStop(alert, policy);
      }
    }

    if (escalated > 0) logger.info({ escalated }, 'Escalation check completed');
    return escalated;
  }

  private async executeStep(
    alert: Alert,
    policy: EscalationPolicy,
    channelIds: string[],
    message?: string | null,
  ): Promise<void> {
    const logger = getLogger();
    const fromStatus = alert.status; // record the status BEFORE the escalation mutation

    try {
      await this.deps.alertStore.autoEscalate(alert);
    } catch (err) {
      logger.warn({ alertId: alert.id, err }, 'Could not escalate alert status');
    }

    await this.deps.alertHistory.record({
      tenantId: alert.tenantId,
      alertId: alert.id,
      action: 'auto_escalate',
      fromStatus,
      toStatus: 'escalated',
      actor: 'escalation-dispatcher',
      reason: `Policy "${policy.name}" step ${alert.escalationStep + 1}: ${message ?? 'auto-escalation'}`,
      metadata: { policyId: policy.id, step: alert.escalationStep + 1 },
    });

    const channels = await this.deps.channelStore.getByIds(channelIds, alert.tenantId);
    if (channels.length > 0) {
      const results = await this.deps.notifier.notifyAll(channels, alert);
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        logger.warn({ alertId: alert.id, failed }, 'Some escalation notifications failed');
      }
    }

    logger.info(
      { alertId: alert.id, policyId: policy.id, step: alert.escalationStep + 1 },
      'Escalation step executed',
    );
  }

  private async handleRepeatOrStop(alert: Alert, policy: EscalationPolicy): Promise<void> {
    if (policy.repeatAfterMinutes > 0) {
      await this.deps.alertStore.setEscalation(alert.id, {
        escalationPolicyId: policy.id,
        escalationStep: 0,
        nextEscalationAt: new Date(Date.now() + policy.repeatAfterMinutes * 60_000).toISOString(),
      });
    } else {
      await this.deps.alertStore.setEscalation(alert.id, {
        escalationPolicyId: policy.id,
        escalationStep: alert.escalationStep,
        nextEscalationAt: null,
      });
    }
  }
}
