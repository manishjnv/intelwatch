import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { PlanLimitsStore } from '../src/routes/plan-limits.js';

const TEST_CONFIG = {
  TI_PORT: 3017,
  TI_HOST: '0.0.0.0',
  TI_LOG_LEVEL: 'silent' as const,
  TI_CORS_ORIGINS: '*',
  TI_RATE_LIMIT_MAX: 1000,
  TI_RATE_LIMIT_WINDOW_MS: 60000,
  TI_JWT_SECRET: 'test-secret',
};

const ADMIN_HEADERS = { 'x-user-role': 'super_admin', 'x-user-id': 'admin-1' };
const USER_HEADERS = { 'x-user-role': 'analyst', 'x-user-id': 'user-1' };

describe('Plan Limits Routes', () => {
  let app: FastifyInstance;
  let store: PlanLimitsStore;

  beforeEach(async () => {
    store = new PlanLimitsStore();
    app = await buildApp({
      config: TEST_CONFIG,
      planLimitsDeps: { planLimitsStore: store },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /plans: returns 4 tiers, 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customization/plans', headers: ADMIN_HEADERS });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(4);
    expect(body.total).toBe(4);
  });

  it('GET /plans: empty DB → seeds defaults', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customization/plans', headers: ADMIN_HEADERS });
    const body = res.json();
    const planIds = body.data.map((p: { planId: string }) => p.planId);
    expect(planIds).toEqual(['free', 'starter', 'teams', 'enterprise']);
  });

  it('GET /plans: non-admin → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customization/plans', headers: USER_HEADERS });
    expect(res.statusCode).toBe(403);
  });

  it('PUT /plans/:planId: valid update → 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customization/plans/starter',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { maxPrivateFeeds: 15, dailyTokenBudget: 20_000 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.maxPrivateFeeds).toBe(15);
    expect(body.data.dailyTokenBudget).toBe(20_000);
    expect(body.data.planId).toBe('starter');
  });

  it('PUT /plans/:planId: invalid planId → 404', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customization/plans/platinum',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { maxPrivateFeeds: 100 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /plans/:planId: partial update (only maxPrivateFeeds) → 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customization/plans/teams',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { maxPrivateFeeds: 50 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.maxPrivateFeeds).toBe(50);
    expect(body.data.retentionDays).toBe(90);
    expect(body.data.aiEnabled).toBe(true);
  });

  it('PUT /plans/:planId: non-admin → 403', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customization/plans/starter',
      headers: { ...USER_HEADERS, 'content-type': 'application/json' },
      payload: { maxPrivateFeeds: 15 },
    });
    expect(res.statusCode).toBe(403);
  });
});
