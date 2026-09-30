/**
 * Proves the four alerting stores keep no state of their own (Step 3 S154):
 * data created through one app instance survives building a brand-new set of
 * stores + a brand-new app over the SAME repos (simulating a container restart
 * with a real Postgres — MemoryRepo here stands in for Postgres).
 */
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { RuleStore } from '../src/services/rule-store.js';
import { ChannelStore } from '../src/services/channel-store.js';
import { EscalationStore } from '../src/services/escalation-store.js';
import { MaintenanceStore } from '../src/services/maintenance-store.js';
import { RuleEngine } from '../src/services/rule-engine.js';
import { Notifier } from '../src/services/notifier.js';
import { MemoryRepo, MemoryAlertRepo, MemoryAlertHistoryRepo, MemoryAlertGroupRepo } from '../src/repository.js';
import { AlertStore, alertFingerprint } from '../src/services/alert-store.js';
import { AlertHistory } from '../src/services/alert-history.js';
import { AlertGroupStore } from '../src/services/alert-group-store.js';
import { EscalationDispatcher } from '../src/services/escalation-dispatcher.js';
import type { AlertRule } from '../src/services/rule-store.js';
import type { NotificationChannel } from '../src/services/channel-store.js';
import type { EscalationPolicy } from '../src/services/escalation-store.js';
import type { MaintenanceWindow } from '../src/services/maintenance-store.js';

describe('persistence survives a store/app rebuild over the same repos', () => {
  it('rules, channels, escalations and maintenance windows are readable from fresh stores', async () => {
    const tenantId = randomUUID();
    const config = loadConfig({});

    // Shared repos stand in for Postgres across the "restart".
    const ruleRepo = new MemoryRepo<AlertRule>();
    const channelRepo = new MemoryRepo<NotificationChannel>();
    const escalationRepo = new MemoryRepo<EscalationPolicy>();
    const maintenanceRepo = new MemoryRepo<MaintenanceWindow>();

    // ── App instance #1: create one of each entity ──────────────────
    const app1 = await buildApp({
      config,
      ruleDeps: { ruleStore: new RuleStore(ruleRepo), ruleEngine: new RuleEngine() },
      channelDeps: { channelStore: new ChannelStore(channelRepo), notifier: new Notifier() },
      escalationDeps: { escalationStore: new EscalationStore(escalationRepo) },
      maintenanceDeps: { maintenanceStore: new MaintenanceStore(maintenanceRepo) },
    });
    await app1.ready();

    const ruleRes = await app1.inject({
      method: 'POST', url: '/api/v1/alerts/rules',
      payload: {
        name: 'Restart Rule', tenantId, severity: 'high',
        condition: { type: 'threshold', threshold: { metric: 'x', operator: 'gt', value: 1, windowMinutes: 60 } },
      },
    });
    expect(ruleRes.statusCode).toBe(201);

    const channelRes = await app1.inject({
      method: 'POST', url: '/api/v1/alerts/channels',
      payload: { name: 'Restart Channel', tenantId, config: { type: 'email', email: { recipients: ['a@example.com'] } } },
    });
    expect(channelRes.statusCode).toBe(201);

    const escalationRes = await app1.inject({
      method: 'POST', url: '/api/v1/alerts/escalations',
      payload: { name: 'Restart Policy', tenantId, steps: [{ delayMinutes: 5, channelIds: [randomUUID()] }] },
    });
    expect(escalationRes.statusCode).toBe(201);

    const maintenanceRes = await app1.inject({
      method: 'POST', url: '/api/v1/alerts/maintenance-windows',
      payload: {
        name: 'Restart Window', tenantId,
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    });
    expect(maintenanceRes.statusCode).toBe(201);

    await app1.close();

    // ── App instance #2: brand-new stores, same repos ("restart") ───
    const app2 = await buildApp({
      config,
      ruleDeps: { ruleStore: new RuleStore(ruleRepo), ruleEngine: new RuleEngine() },
      channelDeps: { channelStore: new ChannelStore(channelRepo), notifier: new Notifier() },
      escalationDeps: { escalationStore: new EscalationStore(escalationRepo) },
      maintenanceDeps: { maintenanceStore: new MaintenanceStore(maintenanceRepo) },
    });
    await app2.ready();

    const rulesList = await app2.inject({ method: 'GET', url: `/api/v1/alerts/rules?tenantId=${tenantId}` });
    expect(rulesList.json().data.length).toBe(1);
    expect(rulesList.json().data[0].name).toBe('Restart Rule');

    const channelsList = await app2.inject({ method: 'GET', url: `/api/v1/alerts/channels?tenantId=${tenantId}` });
    expect(channelsList.json().data.length).toBe(1);
    expect(channelsList.json().data[0].name).toBe('Restart Channel');

    const escalationsList = await app2.inject({ method: 'GET', url: `/api/v1/alerts/escalations?tenantId=${tenantId}` });
    expect(escalationsList.json().data.length).toBe(1);
    expect(escalationsList.json().data[0].name).toBe('Restart Policy');

    const maintenanceList = await app2.inject({ method: 'GET', url: `/api/v1/alerts/maintenance-windows?tenantId=${tenantId}` });
    expect(maintenanceList.json().data.length).toBe(1);
    expect(maintenanceList.json().data[0].name).toBe('Restart Window');

    await app2.close();
  });

  it('alert, history entry and group created through store instances #1 are read back through NEW store instances #2 sharing the same memory repos', async () => {
    const tenantId = randomUUID();
    const alertRepo = new MemoryAlertRepo();
    const historyRepo = new MemoryAlertHistoryRepo();
    const groupRepo = new MemoryAlertGroupRepo();

    const alertStore1 = new AlertStore(alertRepo, 100, 5);
    const alertHistory1 = new AlertHistory(historyRepo);
    const alertGroupStore1 = new AlertGroupStore(groupRepo, 30);

    const alert = await alertStore1.create({
      ruleId: 'rule-1', ruleName: 'Restart Rule', tenantId, severity: 'high',
      title: 'Restart Alert', description: 'x',
    });
    await alertHistory1.record({
      tenantId, alertId: alert.id, action: 'created', fromStatus: null, toStatus: 'open', actor: 'system',
    });
    const { group } = await alertGroupStore1.addAlert({
      alertId: alert.id, ruleId: 'rule-1', tenantId, severity: 'high', title: alert.title,
    });

    // ── "restart": brand-new store instances over the SAME repos ──────
    const alertStore2 = new AlertStore(alertRepo, 100, 5);
    const alertHistory2 = new AlertHistory(historyRepo);
    const alertGroupStore2 = new AlertGroupStore(groupRepo, 30);

    const readAlert = await alertStore2.getById(alert.id);
    expect(readAlert?.title).toBe('Restart Alert');

    const timeline = await alertHistory2.getTimeline(alert.id);
    expect(timeline.length).toBe(1);
    expect(timeline[0].action).toBe('created');

    const readGroup = await alertGroupStore2.getById(group.id);
    expect(readGroup?.alertIds).toEqual([alert.id]);
  });

  it('dedup across two AlertStore instances sharing a repo produces one alert with dedupCount 2', async () => {
    const tenantId = randomUUID();
    const alertRepo = new MemoryAlertRepo();
    const alertStore1 = new AlertStore(alertRepo, 100, 5);
    const alertStore2 = new AlertStore(alertRepo, 100, 5);

    const fingerprint = alertFingerprint('rule-1', 'high', { ip: '1.2.3.4' });
    const alert = await alertStore1.create({
      ruleId: 'rule-1', ruleName: 'R', tenantId, severity: 'high', title: 'T', description: 'd',
      source: { ip: '1.2.3.4' }, fingerprint,
    });

    // A second "instance" sees the same fingerprint and records a duplicate instead of creating.
    const dup = await alertStore2.findDuplicate(tenantId, fingerprint);
    expect(dup?.id).toBe(alert.id);
    const updated = await alertStore2.recordDuplicate(dup!.id);
    expect(updated?.dedupCount).toBe(2);

    const readBack = await alertStore1.getById(alert.id);
    expect(readBack?.dedupCount).toBe(2);
  });

  it('escalation state (nextEscalationAt) survives a new dispatcher instance sharing the same alert repo', async () => {
    const tenantId = randomUUID();
    const alertRepo = new MemoryAlertRepo();
    const alertStore1 = new AlertStore(alertRepo, 100, 5);
    const escalationRepo = new MemoryRepo<EscalationPolicy>();
    const escalationStore = new EscalationStore(escalationRepo);
    const channelStore = new ChannelStore();
    const notifier = new Notifier();
    const alertHistory = new AlertHistory();

    const policy = await escalationStore.create({
      name: 'P1', tenantId, steps: [{ delayMinutes: 0, channelIds: [randomUUID()] }],
      repeatAfterMinutes: 0, enabled: true,
    });
    const alert = await alertStore1.create({
      ruleId: 'rule-1', ruleName: 'R', tenantId, severity: 'high', title: 'T', description: 'd',
    });

    const dispatcher1 = new EscalationDispatcher({ alertStore: alertStore1, escalationStore, channelStore, notifier, alertHistory });
    await dispatcher1.track(alert.id, policy.id, tenantId);

    // ── "restart": a brand-new AlertStore + dispatcher over the same alert repo ──
    const alertStore2 = new AlertStore(alertRepo, 100, 5);
    const dispatcher2 = new EscalationDispatcher({ alertStore: alertStore2, escalationStore, channelStore, notifier, alertHistory });

    const readAlert = await alertStore2.getById(alert.id);
    expect(readAlert?.nextEscalationAt).not.toBeNull();

    const escalated = await dispatcher2.checkEscalations();
    expect(escalated).toBe(1);
    expect((await alertStore2.getById(alert.id))?.status).toBe('escalated');
  });
});
