import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { WizardStore } from '../src/services/wizard-store.js';
import { ChecklistPersistence } from '../src/services/checklist-persistence.js';
import type { FastifyInstance } from 'fastify';

const TEST_CONFIG = {
  TI_NODE_ENV: 'test' as const,
  TI_ONBOARDING_PORT: 0,
  TI_ONBOARDING_HOST: '127.0.0.1',
  TI_REDIS_URL: 'redis://localhost:6379/0',
  TI_JWT_SECRET: 'test-jwt-secret-min-32-chars-long!!!',
  TI_SERVICE_JWT_SECRET: 'test-service-secret!!',
  TI_CORS_ORIGINS: '*',
  TI_RATE_LIMIT_WINDOW_MS: 60000,
  TI_RATE_LIMIT_MAX: 1000,
  TI_LOG_LEVEL: 'silent',
};

describe('Wizard Routes', () => {
  let app: FastifyInstance;
  let wizardStore: WizardStore;

  beforeAll(async () => {
    wizardStore = new WizardStore();
    const checklistPersistence = new ChecklistPersistence(wizardStore);
    app = await buildApp({
      config: TEST_CONFIG,
      wizardDeps: { wizardStore, checklistPersistence },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('GET /wizard — returns wizard state for tenant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/wizard',
      headers: { 'x-tenant-id': 'test-tenant' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.tenantId).toBe('test-tenant');
    expect(body.data.currentStep).toBe('welcome');
  });

  it('POST /wizard/org-profile — sets org profile', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/org-profile',
      headers: { 'x-tenant-id': 'test-tenant' },
      payload: {
        orgName: 'ACME Corp',
        industry: 'Finance',
        teamSize: '6-20',
        primaryUseCase: 'soc_operations',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.orgProfile.orgName).toBe('ACME Corp');
  });

  it('POST /wizard/org-profile — validates input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/org-profile',
      headers: { 'x-tenant-id': 'test-tenant' },
      payload: { orgName: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /wizard/team-invite — adds team invites', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/team-invite',
      headers: { 'x-tenant-id': 'test-tenant' },
      payload: {
        invites: [
          { email: 'alice@acme.com', role: 'analyst' },
          { email: 'bob@acme.com', role: 'viewer' },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.teamInvites).toHaveLength(2);
  });

  it('POST /wizard/complete-step — completes a step', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/complete-step',
      headers: { 'x-tenant-id': 'step-tenant' },
    });
    // First, create the tenant
    await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/wizard',
      headers: { 'x-tenant-id': 'step-tenant' },
    });
    const completeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/complete-step',
      headers: { 'x-tenant-id': 'step-tenant' },
      payload: { step: 'welcome' },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().data.steps.welcome).toBe('completed');
  });

  it('POST /wizard/skip-step — skips optional step', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/wizard',
      headers: { 'x-tenant-id': 'skip-tenant' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/skip-step',
      headers: { 'x-tenant-id': 'skip-tenant' },
      payload: { step: 'team_invite' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.steps.team_invite).toBe('skipped');
  });

  it('POST /wizard/skip-step — rejects required step', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/wizard',
      headers: { 'x-tenant-id': 'skip-fail-tenant' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/skip-step',
      headers: { 'x-tenant-id': 'skip-fail-tenant' },
      payload: { step: 'welcome' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /wizard/dashboard-prefs — sets preferences', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/dashboard-prefs',
      headers: { 'x-tenant-id': 'test-tenant' },
      payload: { layout: 'compact', defaultTimeRange: '30d' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.dashboardPrefs.layout).toBe('compact');
  });

  it('POST /wizard/reset — resets wizard', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/reset',
      headers: { 'x-tenant-id': 'test-tenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.currentStep).toBe('welcome');
    expect(res.json().data.completionPercent).toBe(0);
  });

  it('tenant isolation — different tenants have separate state', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/wizard/org-profile',
      headers: { 'x-tenant-id': 'tenant-a' },
      payload: { orgName: 'Tenant A', industry: 'Tech', teamSize: '1-5', primaryUseCase: 'threat_intelligence' },
    });
    const resB = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/wizard',
      headers: { 'x-tenant-id': 'tenant-b' },
    });
    expect(resB.json().data.orgProfile).toBeNull();
  });
});
