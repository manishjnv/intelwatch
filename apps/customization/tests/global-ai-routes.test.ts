import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { GlobalAiStore, RECOMMENDED_MODELS } from '../src/services/global-ai-store.js';
import { CostPredictor } from '../src/services/cost-predictor.js';

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

describe('Global AI Routes', () => {
  let app: FastifyInstance;
  let store: GlobalAiStore;

  beforeEach(async () => {
    store = new GlobalAiStore();
    app = await buildApp({
      config: TEST_CONFIG,
      globalAiDeps: {
        globalAiStore: store,
        costPredictor: new CostPredictor(),
        featureEnabled: true,
      },
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ── GET /ai/global ──────────────────────────────────────────────

  it('GET /ai/global: returns config + recommendations + cost, 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customization/ai/global', headers: ADMIN_HEADERS });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.config).toBeDefined();
    expect(body.data.recommendations).toBeDefined();
    expect(body.data.costEstimate).toBeDefined();
    expect(body.data.config.length).toBe(Object.keys(RECOMMENDED_MODELS).length);
  });

  it('GET /ai/global: feature flag off → 503', async () => {
    const offApp = await buildApp({
      config: TEST_CONFIG,
      globalAiDeps: { globalAiStore: store, costPredictor: new CostPredictor(), featureEnabled: false },
    });
    const res = await offApp.inject({ method: 'GET', url: '/api/v1/customization/ai/global', headers: ADMIN_HEADERS });
    expect(res.statusCode).toBe(503);
    await offApp.close();
  });

  it('GET /ai/global: non-admin → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customization/ai/global', headers: USER_HEADERS });
    expect(res.statusCode).toBe(403);
  });

  // ── PUT /ai/global/:category/:subtask ───────────────────────────

  it('PUT /ai/global/:category/:subtask: valid → 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customization/ai/global/news_feed/classification',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { model: 'opus' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.updated.model).toBe('opus');
    expect(body.data.costEstimate).toBeDefined();
  });

  it('PUT /ai/global/:category/:subtask: invalid model → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customization/ai/global/news_feed/classification',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { model: 'gpt4' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /ai/global/:category/:subtask: invalid subtask → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customization/ai/global/bogus/nonexistent',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { model: 'haiku' },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── POST /ai/global/apply-plan ──────────────────────────────────

  it('POST /ai/global/apply-plan: tier=teams → bulk sets recommended', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customization/ai/global/apply-plan',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { tier: 'teams' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.config.length).toBe(Object.keys(RECOMMENDED_MODELS).length);
    expect(body.data.costEstimate).toBeDefined();
  });

  it('POST /ai/global/apply-plan: invalid tier → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customization/ai/global/apply-plan',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { tier: 'platinum' },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── GET /ai/global/cost-estimate ────────────────────────────────

  it('GET /ai/global/cost-estimate: returns current vs proposed', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customization/ai/global/cost-estimate?changes=news_feed.classification:opus',
      headers: ADMIN_HEADERS,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.current).toBeDefined();
    expect(body.data.proposed).toBeDefined();
    expect(body.data.delta).toBeDefined();
  });

  it('GET /ai/global/cost-estimate: no changes param → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customization/ai/global/cost-estimate',
      headers: ADMIN_HEADERS,
    });
    expect(res.statusCode).toBe(400);
  });

  // ── GET/PUT /ai/global/confidence-model ─────────────────────────

  it('GET /ai/global/confidence-model: returns current model', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customization/ai/global/confidence-model',
      headers: ADMIN_HEADERS,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(['linear', 'bayesian']).toContain(body.data.model);
  });

  it('PUT /ai/global/confidence-model: valid → 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customization/ai/global/confidence-model',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { model: 'bayesian' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('PUT /ai/global/confidence-model: invalid model → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/customization/ai/global/confidence-model',
      headers: { ...ADMIN_HEADERS, 'content-type': 'application/json' },
      payload: { model: 'random_forest' },
    });
    expect(res.statusCode).toBe(400);
  });
});
