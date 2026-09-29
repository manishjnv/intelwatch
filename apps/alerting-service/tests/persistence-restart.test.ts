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
import { MemoryRepo } from '../src/repository.js';
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
});
