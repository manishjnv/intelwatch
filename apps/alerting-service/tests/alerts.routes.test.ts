import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AlertStore } from '../src/services/alert-store.js';
import { RuleStore } from '../src/services/rule-store.js';
import { AlertHistory } from '../src/services/alert-history.js';
import type { FastifyInstance } from 'fastify';

describe('Alert routes', () => {
  let app: FastifyInstance;
  let alertStore: AlertStore;
  let ruleStore: RuleStore;
  let alertHistory: AlertHistory;

  function createTestAlert() {
    return alertStore.create({
      ruleId: '00000000-0000-0000-0000-000000000001',
      ruleName: 'Test Rule',
      tenantId: 'default',
      severity: 'high',
      title: 'Test Alert',
      description: 'Something happened',
    });
  }

  beforeAll(async () => {
    const config = loadConfig({});
    alertStore = new AlertStore(100);
    ruleStore = new RuleStore();
    alertHistory = new AlertHistory();
    app = await buildApp({
      config,
      alertDeps: { alertStore, alertHistory },
      statsDeps: { alertStore, ruleStore },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    alertStore.clear();
    ruleStore.clear();
    alertHistory.clear();
  });

  // ─── GET /api/v1/alerts ────────────────────────────────────────────

  it('GET lists alerts with pagination', async () => {
    createTestAlert();
    createTestAlert();
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts?page=1&limit=1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(1);
    expect(body.meta.total).toBe(2);
  });

  it('GET filters by severity', async () => {
    createTestAlert();
    alertStore.create({
      ruleId: 'r2', ruleName: 'R2', tenantId: 'default', severity: 'low', title: 'Low', description: 'x',
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts?severity=high' });
    expect(res.json().data.length).toBe(1);
  });

  it('GET filters by status', async () => {
    const a = createTestAlert();
    createTestAlert();
    alertStore.acknowledge(a.id, 'user-1');
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts?status=acknowledged' });
    expect(res.json().data.length).toBe(1);
  });

  // ─── GET /api/v1/alerts/:id ────────────────────────────────────────

  it('GET returns alert detail', async () => {
    const alert = createTestAlert();
    const res = await app.inject({ method: 'GET', url: `/api/v1/alerts/${alert.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(alert.id);
  });

  it('GET returns 404 for non-existent alert', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/non-existent' });
    expect(res.statusCode).toBe(404);
  });

  // ─── POST /api/v1/alerts/:id/acknowledge ───────────────────────────

  it('POST acknowledges an alert', async () => {
    const alert = createTestAlert();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/acknowledge`,
      payload: { userId: 'analyst-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('acknowledged');
    expect(res.json().data.acknowledgedBy).toBe('analyst-1');
  });

  it('POST acknowledge uses system as default userId', async () => {
    const alert = createTestAlert();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/acknowledge`,
      payload: {},
    });
    expect(res.json().data.acknowledgedBy).toBe('system');
  });

  // ─── POST /api/v1/alerts/:id/resolve ───────────────────────────────

  it('POST resolves an alert', async () => {
    const alert = createTestAlert();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/resolve`,
      payload: { userId: 'analyst-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('resolved');
    expect(res.json().data.resolvedBy).toBe('analyst-1');
  });

  it('POST resolve on resolved alert returns 409', async () => {
    const alert = createTestAlert();
    alertStore.resolve(alert.id, 'user-1');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/resolve`,
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });

  // ─── POST /api/v1/alerts/:id/suppress ──────────────────────────────

  it('POST suppresses an alert', async () => {
    const alert = createTestAlert();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/suppress`,
      payload: { durationMinutes: 30, reason: 'false positive' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('suppressed');
    expect(res.json().data.suppressReason).toBe('false positive');
  });

  it('POST suppress with default duration', async () => {
    const alert = createTestAlert();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/suppress`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.suppressedUntil).toBeDefined();
  });

  // ─── POST /api/v1/alerts/:id/escalate ──────────────────────────────

  it('POST escalates an alert', async () => {
    const alert = createTestAlert();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/escalate`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('escalated');
    expect(res.json().data.escalationLevel).toBe(1);
  });

  // ─── POST /api/v1/alerts/bulk-acknowledge ──────────────────────────

  it('POST bulk acknowledges alerts', async () => {
    const a1 = createTestAlert();
    const a2 = createTestAlert();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/bulk-acknowledge',
      payload: { ids: [a1.id, a2.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.acknowledged).toBe(2);
  });

  it('POST bulk acknowledge with invalid IDs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/bulk-acknowledge',
      payload: { ids: ['not-a-uuid'] },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── POST /api/v1/alerts/bulk-resolve ──────────────────────────────

  it('POST bulk resolves alerts', async () => {
    const a1 = createTestAlert();
    const a2 = createTestAlert();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/bulk-resolve',
      payload: { ids: [a1.id, a2.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.resolved).toBe(2);
  });

  // ─── GET /api/v1/alerts/stats ──────────────────────────────────────

  it('GET returns alert stats', async () => {
    createTestAlert();
    createTestAlert();
    const a3 = createTestAlert();
    alertStore.resolve(a3.id, 'user-1');

    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.total).toBe(3);
    expect(body.data.open).toBe(2);
    expect(body.data.resolved).toBe(1);
    expect(body.data.bySeverity).toBeDefined();
    expect(body.data.ruleCount).toBe(0);
  });

  it('GET stats with empty data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.total).toBe(0);
  });

  // ─── GET /api/v1/alerts/:id/history ────────────────────────────────

  it('GET returns alert history timeline', async () => {
    const alert = createTestAlert();
    // Trigger an acknowledge to generate history
    await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/acknowledge`,
      payload: { userId: 'analyst-1' },
    });

    const res = await app.inject({ method: 'GET', url: `/api/v1/alerts/${alert.id}/history` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].action).toBe('acknowledge');
    expect(body.data[0].actor).toBe('analyst-1');
    expect(body.data[0].fromStatus).toBe('open');
    expect(body.data[0].toStatus).toBe('acknowledged');
  });

  it('GET returns empty history for new alert', async () => {
    const alert = createTestAlert();
    const res = await app.inject({ method: 'GET', url: `/api/v1/alerts/${alert.id}/history` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(0);
  });

  it('GET history returns 404 for non-existent alert', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/non-existent/history' });
    expect(res.statusCode).toBe(404);
  });

  it('history records multiple lifecycle transitions', async () => {
    const alert = createTestAlert();
    await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/acknowledge`,
      payload: { userId: 'analyst-1' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/alerts/${alert.id}/resolve`,
      payload: { userId: 'analyst-1' },
    });

    const res = await app.inject({ method: 'GET', url: `/api/v1/alerts/${alert.id}/history` });
    const timeline = res.json().data;
    expect(timeline.length).toBe(2);
    expect(timeline[0].action).toBe('acknowledge');
    expect(timeline[1].action).toBe('resolve');
  });
});
