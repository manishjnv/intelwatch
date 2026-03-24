import { describe, it, expect, beforeEach } from 'vitest';
import { EscalationDispatcher } from '../src/services/escalation-dispatcher.js';
import { AlertStore } from '../src/services/alert-store.js';
import { EscalationStore } from '../src/services/escalation-store.js';
import { ChannelStore } from '../src/services/channel-store.js';
import { Notifier } from '../src/services/notifier.js';
import { AlertHistory } from '../src/services/alert-history.js';

function makeDeps() {
  const alertStore = new AlertStore(100);
  const escalationStore = new EscalationStore();
  const channelStore = new ChannelStore();
  const notifier = new Notifier();
  const alertHistory = new AlertHistory();
  return { alertStore, escalationStore, channelStore, notifier, alertHistory };
}

describe('EscalationDispatcher', () => {
  let deps: ReturnType<typeof makeDeps>;
  let dispatcher: EscalationDispatcher;

  beforeEach(() => {
    deps = makeDeps();
    dispatcher = new EscalationDispatcher(deps, 100); // 100ms check interval for tests
  });

  it('tracks an alert for escalation', () => {
    const policy = deps.escalationStore.create({
      name: 'P1',
      tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0,
      enabled: true,
    });

    const alert = deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'critical',
      title: 'Test', description: 'test',
    });

    dispatcher.track(alert.id, policy.id);
    expect(dispatcher.trackedCount()).toBe(1);
  });

  it('does not track if policy does not exist', () => {
    dispatcher.track('alert-1', 'non-existent-policy');
    expect(dispatcher.trackedCount()).toBe(0);
  });

  it('does not track if policy is disabled', () => {
    const policy = deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0, enabled: false,
    });
    dispatcher.track('alert-1', policy.id);
    expect(dispatcher.trackedCount()).toBe(0);
  });

  it('untracks an alert', () => {
    const policy = deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0, enabled: true,
    });
    const alert = deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'high',
      title: 'Test', description: 'test',
    });
    dispatcher.track(alert.id, policy.id);
    dispatcher.untrack(alert.id);
    expect(dispatcher.trackedCount()).toBe(0);
  });

  it('escalates alert when step delay is 0', async () => {
    const channel = deps.channelStore.create({
      name: 'Email', tenantId: 'tenant-1',
      config: { type: 'email', email: { recipients: ['soc@example.com'] } },
      enabled: true,
    });

    const policy = deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: [channel.id] }],
      repeatAfterMinutes: 0, enabled: true,
    });

    const alert = deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'critical',
      title: 'Test', description: 'test',
    });

    dispatcher.track(alert.id, policy.id);
    const escalated = await dispatcher.checkEscalations();
    expect(escalated).toBe(1);

    const updated = deps.alertStore.getById(alert.id)!;
    expect(updated.status).toBe('escalated');
    expect(updated.escalationLevel).toBe(1);

    // History should be recorded
    const timeline = deps.alertHistory.getTimeline(alert.id);
    expect(timeline.length).toBe(1);
    expect(timeline[0].action).toBe('auto_escalate');
  });

  it('skips escalation if alert is resolved', async () => {
    const policy = deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0, enabled: true,
    });

    const alert = deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'high',
      title: 'Test', description: 'test',
    });
    deps.alertStore.resolve(alert.id, 'user-1');

    dispatcher.track(alert.id, policy.id);
    const escalated = await dispatcher.checkEscalations();
    expect(escalated).toBe(0);
    expect(dispatcher.trackedCount()).toBe(0);
  });

  it('advances through multiple steps', async () => {
    const policy = deps.escalationStore.create({
      name: 'Multi-step', tenantId: 'tenant-1',
      steps: [
        { delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] },
        { delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000002'] },
      ],
      repeatAfterMinutes: 0, enabled: true,
    });

    const alert = deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'critical',
      title: 'Test', description: 'test',
    });

    dispatcher.track(alert.id, policy.id);

    // Step 1
    await dispatcher.checkEscalations();
    expect(deps.alertStore.getById(alert.id)!.status).toBe('escalated');

    // Step 2
    await dispatcher.checkEscalations();

    // After all steps with no repeat, should be untracked
    expect(dispatcher.trackedCount()).toBe(0);
  });

  it('repeats policy when repeatAfterMinutes > 0', async () => {
    const policy = deps.escalationStore.create({
      name: 'Repeating', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 1, enabled: true,
    });

    const alert = deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'critical',
      title: 'Test', description: 'test',
    });

    dispatcher.track(alert.id, policy.id);
    await dispatcher.checkEscalations();

    // Should still be tracked (will repeat)
    expect(dispatcher.trackedCount()).toBe(1);
  });

  it('removes tracking if alert is deleted', async () => {
    const policy = deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0, enabled: true,
    });

    // Track a non-existent alert
    dispatcher.track('non-existent', policy.id);
    // Force the pending entry (normally track checks the policy, not the alert)
    await dispatcher.checkEscalations();
    expect(dispatcher.trackedCount()).toBe(0);
  });

  it('clears all pending escalations', () => {
    const policy = deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0, enabled: true,
    });
    const alert = deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'high',
      title: 'Test', description: 'test',
    });
    dispatcher.track(alert.id, policy.id);
    dispatcher.clear();
    expect(dispatcher.trackedCount()).toBe(0);
  });
});
