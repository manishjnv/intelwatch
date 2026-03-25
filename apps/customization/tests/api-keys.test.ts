/**
 * Tests for BYOK Anthropic API key endpoints
 * GET/PUT/DELETE /api/v1/customization/api-keys/anthropic
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { AiModelStore } from '../src/services/ai-model-store.js';
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

const BASE = '/api/v1/customization/api-keys';
const TENANT_A = 'tenant-byok-a';
const TENANT_B = 'tenant-byok-b';
/** 23-char key: first 10 = "sk-ant-api", last 4 = "LONG" */
const VALID_KEY = 'sk-ant-api123key5678LONG';

describe('BYOK Anthropic API key endpoints', () => {
  let app: FastifyInstance;
  let aiModelStore: AiModelStore;

  beforeAll(async () => {
    const auditTrail = new AuditTrail();
    const versioning = new ConfigVersioning();
    aiModelStore = new AiModelStore(auditTrail, versioning);
    app = await buildApp({
      config: TEST_CONFIG,
      aiModelDeps: { aiModelStore },
      apiKeyDeps: { aiModelStore },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('GET with no key → hasKey: false, maskedKey: null', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/anthropic`,
      headers: { 'x-tenant-id': TENANT_A },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.hasKey).toBe(false);
    expect(data.maskedKey).toBeNull();
    expect(data.tenantId).toBe(TENANT_A);
  });

  it('PUT valid key → hasKey: true, maskedKey shows correct mask', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/anthropic`,
      headers: { 'x-tenant-id': TENANT_A },
      payload: { apiKey: VALID_KEY },
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.hasKey).toBe(true);
    expect(data.maskedKey).toBe('sk-ant-api...LONG');
    expect(data.tenantId).toBe(TENANT_A);
  });

  it('PUT invalid key (no sk-ant- prefix) → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/anthropic`,
      headers: { 'x-tenant-id': TENANT_A },
      payload: { apiKey: 'openai-sk-prod-not-anthropic-key' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE removes key → GET returns hasKey: false', async () => {
    // Ensure key is present first
    await app.inject({
      method: 'PUT',
      url: `${BASE}/anthropic`,
      headers: { 'x-tenant-id': TENANT_A },
      payload: { apiKey: VALID_KEY },
    });
    const del = await app.inject({
      method: 'DELETE',
      url: `${BASE}/anthropic`,
      headers: { 'x-tenant-id': TENANT_A },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().data.hasKey).toBe(false);
    expect(del.json().data.maskedKey).toBeNull();

    const get = await app.inject({
      method: 'GET',
      url: `${BASE}/anthropic`,
      headers: { 'x-tenant-id': TENANT_A },
    });
    expect(get.json().data.hasKey).toBe(false);
  });

  it('key shorter than 14 chars → maskedKey "***"', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `${BASE}/anthropic`,
      headers: { 'x-tenant-id': TENANT_A },
      payload: { apiKey: 'sk-ant-abc' }, // 10 chars < 14
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.maskedKey).toBe('***');
  });

  it('tenant isolation — key for tenant A not visible to tenant B', async () => {
    await app.inject({
      method: 'PUT',
      url: `${BASE}/anthropic`,
      headers: { 'x-tenant-id': TENANT_A },
      payload: { apiKey: VALID_KEY },
    });
    const res = await app.inject({
      method: 'GET',
      url: `${BASE}/anthropic`,
      headers: { 'x-tenant-id': TENANT_B },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.hasKey).toBe(false);
    expect(res.json().data.maskedKey).toBeNull();
  });
});
