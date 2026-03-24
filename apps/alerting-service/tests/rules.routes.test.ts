import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { RuleStore } from '../src/services/rule-store.js';
import { RuleEngine } from '../src/services/rule-engine.js';
import type { FastifyInstance } from 'fastify';

const validRule = {
  name: 'High IOC Rate',
  severity: 'critical',
  condition: {
    type: 'threshold',
    threshold: { metric: 'critical_iocs', operator: 'gt', value: 10, windowMinutes: 60 },
  },
};

describe('Rule routes', () => {
  let app: FastifyInstance;
  let ruleStore: RuleStore;
  let ruleEngine: RuleEngine;

  beforeAll(async () => {
    const config = loadConfig({});
    ruleStore = new RuleStore();
    ruleEngine = new RuleEngine();
    app = await buildApp({ config, ruleDeps: { ruleStore, ruleEngine } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    ruleStore.clear();
    ruleEngine.clear();
  });

  // ─── POST /api/v1/alerts/rules ─────────────────────────────────────

  it('POST creates a rule — 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/rules',
      payload: validRule,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.id).toBeDefined();
    expect(body.data.name).toBe('High IOC Rate');
    expect(body.data.enabled).toBe(true);
  });

  it('POST rejects invalid severity — 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/rules',
      payload: { ...validRule, severity: 'extreme' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects missing name — 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/rules',
      payload: { severity: 'high', condition: validRule.condition },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── GET /api/v1/alerts/rules ──────────────────────────────────────

  it('GET lists rules with pagination', async () => {
    ruleStore.create({ ...validRule, tenantId: 'default', enabled: true, cooldownMinutes: 15 } as any);
    ruleStore.create({ ...validRule, name: 'Rule 2', tenantId: 'default', enabled: true, cooldownMinutes: 15 } as any);

    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/rules?page=1&limit=1' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(1);
    expect(body.meta.total).toBe(2);
    expect(body.meta.totalPages).toBe(2);
  });

  it('GET filters by type', async () => {
    ruleStore.create({ ...validRule, tenantId: 'default', enabled: true, cooldownMinutes: 15 } as any);
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/rules?type=pattern' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(0);
  });

  // ─── GET /api/v1/alerts/rules/:id ──────────────────────────────────

  it('GET returns rule detail', async () => {
    const rule = ruleStore.create({ ...validRule, tenantId: 'default', enabled: true, cooldownMinutes: 15 } as any);
    const res = await app.inject({ method: 'GET', url: `/api/v1/alerts/rules/${rule.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(rule.id);
  });

  it('GET returns 404 for non-existent rule', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/rules/non-existent' });
    expect(res.statusCode).toBe(404);
  });

  // ─── PUT /api/v1/alerts/rules/:id ──────────────────────────────────

  it('PUT updates a rule', async () => {
    const rule = ruleStore.create({ ...validRule, tenantId: 'default', enabled: true, cooldownMinutes: 15 } as any);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/alerts/rules/${rule.id}`,
      payload: { name: 'Renamed Rule' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Renamed Rule');
  });

  it('PUT returns 404 for non-existent rule', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/alerts/rules/non-existent',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── DELETE /api/v1/alerts/rules/:id ───────────────────────────────

  it('DELETE removes a rule — 204', async () => {
    const rule = ruleStore.create({ ...validRule, tenantId: 'default', enabled: true, cooldownMinutes: 15 } as any);
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/alerts/rules/${rule.id}` });
    expect(res.statusCode).toBe(204);
    expect(ruleStore.getById(rule.id)).toBeUndefined();
  });

  it('DELETE returns 404 for non-existent rule', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/alerts/rules/non-existent' });
    expect(res.statusCode).toBe(404);
  });

  // ─── PUT /api/v1/alerts/rules/:id/toggle ───────────────────────────

  it('PUT toggle disables a rule', async () => {
    const rule = ruleStore.create({ ...validRule, tenantId: 'default', enabled: true, cooldownMinutes: 15 } as any);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/alerts/rules/${rule.id}/toggle`,
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.enabled).toBe(false);
  });

  it('PUT toggle rejects missing enabled field', async () => {
    const rule = ruleStore.create({ ...validRule, tenantId: 'default', enabled: true, cooldownMinutes: 15 } as any);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/alerts/rules/${rule.id}/toggle`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT toggle returns 404 for non-existent rule', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/alerts/rules/non-existent/toggle',
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── POST /api/v1/alerts/rules/:id/test ────────────────────────────

  it('POST test dry-runs a rule', async () => {
    const rule = ruleStore.create({ ...validRule, tenantId: 'default', enabled: true, cooldownMinutes: 15 } as any);
    const res = await app.inject({ method: 'POST', url: `/api/v1/alerts/rules/${rule.id}/test` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.ruleId).toBe(rule.id);
    expect(typeof body.data.wouldTrigger).toBe('boolean');
    expect(body.data.reason).toBeDefined();
  });

  it('POST test returns 404 for non-existent rule', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/alerts/rules/non-existent/test' });
    expect(res.statusCode).toBe(404);
  });
});
