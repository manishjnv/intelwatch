import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EscalationDispatcher } from '../src/services/escalation-dispatcher.js';
import { AlertStore } from '../src/services/alert-store.js';
import { EscalationStore } from '../src/services/escalation-store.js';
import { ChannelStore } from '../src/services/channel-store.js';
import { Notifier } from '../src/services/notifier.js';
import { AlertHistory } from '../src/services/alert-history.js';

function makeDeps() {
  const alertStore = new AlertStore(undefined, 100);
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

  it('tracks an alert for escalation — sets policy/step/nextEscalationAt on the alert', async () => {
    const policy = await deps.escalationStore.create({
      name: 'P1',
      tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0,
      enabled: true,
    });

    const alert = await deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'critical',
      title: 'Test', description: 'test',
    });

    await dispatcher.track(alert.id, policy.id, 'tenant-1');
    const updated = await deps.alertStore.getById(alert.id);
    expect(updated!.escalationPolicyId).toBe(policy.id);
    expect(updated!.nextEscalationAt).not.toBeNull();
  });

  it('does not track if a policy owned by another tenant is passed', async () => {
    const policy = await deps.escalationStore.create({
      name: 'Other tenant', tenantId: 'tenant-2',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0, enabled: true,
    });
    const alert = await deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'critical',
      title: 'Test', description: 'test',
    });
    // track() looks the policy up scoped to the alert's own tenant
    await dispatcher.track(alert.id, policy.id, 'tenant-1');
    const updated = await deps.alertStore.getById(alert.id);
    expect(updated!.nextEscalationAt).toBeNull();
  });

  it('does not track if policy does not exist', async () => {
    const alert = await deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'high',
      title: 'Test', description: 'test',
    });
    await dispatcher.track(alert.id, 'non-existent-policy', 'tenant-1');
    const updated = await deps.alertStore.getById(alert.id);
    expect(updated!.nextEscalationAt).toBeNull();
  });

  it('does not track if policy is disabled', async () => {
    const policy = await deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0, enabled: false,
    });
    const alert = await deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'high',
      title: 'Test', description: 'test',
    });
    await dispatcher.track(alert.id, policy.id, 'tenant-1');
    const updated = await deps.alertStore.getById(alert.id);
    expect(updated!.nextEscalationAt).toBeNull();
  });

  it('acknowledging an alert clears its escalation schedule', async () => {
    const policy = await deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0, enabled: true,
    });
    const alert = await deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'high',
      title: 'Test', description: 'test',
    });
    await dispatcher.track(alert.id, policy.id, 'tenant-1');
    await deps.alertStore.acknowledge(alert.id, 'user-1');
    const updated = await deps.alertStore.getById(alert.id);
    expect(updated!.nextEscalationAt).toBeNull();
  });

  it('escalates alert when step delay is 0', async () => {
    const channel = await deps.channelStore.create({
      name: 'Email', tenantId: 'tenant-1',
      config: { type: 'email', email: { recipients: ['soc@example.com'] } },
      enabled: true,
    });

    const policy = await deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: [channel.id] }],
      repeatAfterMinutes: 0, enabled: true,
    });

    const alert = await deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'critical',
      title: 'Test', description: 'test',
    });

    await dispatcher.track(alert.id, policy.id, 'tenant-1');
    const escalated = await dispatcher.checkEscalations();
    expect(escalated).toBe(1);

    const updated = await deps.alertStore.getById(alert.id);
    expect(updated!.status).toBe('escalated');
    expect(updated!.escalationLevel).toBe(1);

    // History should be recorded with fromStatus = the status BEFORE escalation ('open')
    const timeline = await deps.alertHistory.getTimeline(alert.id);
    expect(timeline.length).toBe(1);
    expect(timeline[0].action).toBe('auto_escalate');
    expect(timeline[0].fromStatus).toBe('open');
  });

  it('skips escalation if alert is resolved', async () => {
    const policy = await deps.escalationStore.create({
      name: 'P1', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 0, enabled: true,
    });

    const alert = await deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'high',
      title: 'Test', description: 'test',
    });

    await dispatcher.track(alert.id, policy.id, 'tenant-1');
    await deps.alertStore.resolve(alert.id, 'user-1'); // resolve() also clears nextEscalationAt
    const escalated = await dispatcher.checkEscalations();
    expect(escalated).toBe(0);
  });

  it('advances through multiple steps then stops (no repeat)', async () => {
    const policy = await deps.escalationStore.create({
      name: 'Multi-step', tenantId: 'tenant-1',
      steps: [
        { delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] },
        { delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000002'] },
      ],
      repeatAfterMinutes: 0, enabled: true,
    });

    const alert = await deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'critical',
      title: 'Test', description: 'test',
    });

    await dispatcher.track(alert.id, policy.id, 'tenant-1');

    // Step 1
    await dispatcher.checkEscalations();
    expect((await deps.alertStore.getById(alert.id))!.status).toBe('escalated');

    // Step 2
    await dispatcher.checkEscalations();

    // After all steps with no repeat, nextEscalationAt clears
    const after = await deps.alertStore.getById(alert.id);
    expect(after!.nextEscalationAt).toBeNull();
  });

  it('repeats policy when repeatAfterMinutes > 0', async () => {
    const policy = await deps.escalationStore.create({
      name: 'Repeating', tenantId: 'tenant-1',
      steps: [{ delayMinutes: 0, channelIds: ['00000000-0000-0000-0000-000000000001'] }],
      repeatAfterMinutes: 1, enabled: true,
    });

    const alert = await deps.alertStore.create({
      ruleId: 'rule-1', ruleName: 'R1', tenantId: 'tenant-1', severity: 'critical',
      title: 'Test', description: 'test',
    });

    await dispatcher.track(alert.id, policy.id, 'tenant-1');
    await dispatcher.checkEscalations();

    // Should still have a scheduled nextEscalationAt (will repeat)
    const after = await deps.alertStore.getById(alert.id);
    expect(after!.nextEscalationAt).not.toBeNull();
    expect(after!.escalationStep).toBe(0);
  });

  it('start() schedules checkEscalations and a rejection inside the interval does not crash', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(dispatcher, 'checkEscalations').mockRejectedValue(new Error('boom'));
    dispatcher.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(spy).toHaveBeenCalled();
    dispatcher.stop();
    vi.useRealTimers();
  });
});
