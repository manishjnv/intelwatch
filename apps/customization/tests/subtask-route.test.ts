/**
 * Tests for PUT /api/v1/ai/subtasks/:subtask
 * Verifies the G1b fix — individual CTI subtask model assignment.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { AiModelStore } from '../src/services/ai-model-store.js';
import { PlanTierService } from '../src/services/plan-tiers.js';
import { AuditTrail } from '../src/services/audit-trail.js';
import { ConfigVersioning } from '../src/services/config-versioning.js';

const TEST_CONFIG = {
  TI_NODE_ENV: 'test' as const,
  TI_CUSTOMIZATION_PORT: 0,
  TI_CUSTOMIZATION_HOST: '127.0.0.1',
  TI_REDIS_URL: 'redis://localhost:6379/0',
  TI_JWT_SECRET: 'test-jwt-secret-min-32-chars-long!!',
  TI_SERVICE_JWT_SECRET: 'test-service-secret!!',
  TI_CORS_ORIGINS: 'http://localhost:3002',
  TI_RATE_LIMIT_WINDOW_MS: 60000,
  TI_RATE_LIMIT_MAX: 1000,
  TI_LOG_LEVEL: 'silent',
};

const BASE = '/api/v1/customization/ai';
const TENANT = 'tenant-g1';

describe('PUT /ai/subtasks/:subtask — G1b', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const auditTrail = new AuditTrail();
    const versioning = new ConfigVersioning();
    const aiModelStore = new AiModelStore(auditTrail, versioning);
    const planTierService = new PlanTierService();
    app = await buildApp({
      config: TEST_CONFIG,
      aiModelDeps: { aiModelStore, planTierService },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('returns 200 and updated mapping when valid subtask + model', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/subtasks/summarization`,
      headers: { 'x-tenant-id': TENANT, 'x-user-id': 'admin-1' },
      payload: { model: 'haiku' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.subtask).toBe('summarization');
    expect(body.data.model).toBe('haiku');
    expect(body.data.tenantId).toBe(TENANT);
  });

  it('change is reflected in GET /ai/subtasks', async () => {
    // First, set deduplication to opus
    await app.inject({
      method: 'PUT',
      url: `${BASE}/subtasks/deduplication`,
      headers: { 'x-tenant-id': TENANT, 'x-user-id': 'admin-1' },
      payload: { model: 'opus' },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: `${BASE}/subtasks`,
      headers: { 'x-tenant-id': TENANT },
    });
    expect(listRes.statusCode).toBe(200);
    const mappings = listRes.json().data as Array<{ subtask: string; model: string }>;
    const dedup = mappings.find((m) => m.subtask === 'deduplication');
    expect(dedup?.model).toBe('opus');
  });

  it('accepts optional fallbackModel in body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/subtasks/ioc_extraction`,
      headers: { 'x-tenant-id': TENANT, 'x-user-id': 'admin-1' },
      payload: { model: 'sonnet', fallbackModel: 'haiku' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.model).toBe('sonnet');
    expect(body.data.fallbackModel).toBe('haiku');
  });

  it('returns 400 for unknown subtask', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/subtasks/nonexistent_subtask`,
      headers: { 'x-tenant-id': TENANT, 'x-user-id': 'admin-1' },
      payload: { model: 'haiku' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid model name', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/subtasks/summarization`,
      headers: { 'x-tenant-id': TENANT, 'x-user-id': 'admin-1' },
      payload: { model: 'gpt-4' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when body is missing model', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/subtasks/summarization`,
      headers: { 'x-tenant-id': TENANT, 'x-user-id': 'admin-1' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('isolates subtask models between tenants', async () => {
    await app.inject({
      method: 'PUT',
      url: `${BASE}/subtasks/classification`,
      headers: { 'x-tenant-id': 'tenant-A', 'x-user-id': 'admin' },
      payload: { model: 'opus' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/subtasks`,
      headers: { 'x-tenant-id': 'tenant-B' },
    });
    const mappings = res.json().data as Array<{ subtask: string; model: string }>;
    const classification = mappings.find((m) => m.subtask === 'classification');
    // tenant-B should NOT see tenant-A's opus setting
    expect(classification?.model).not.toBe('opus');
  });
});
