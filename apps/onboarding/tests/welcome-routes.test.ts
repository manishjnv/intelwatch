import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { WizardStore } from '../src/services/wizard-store.js';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';
import { HealthChecker } from '../src/services/health-checker.js';
import { ProgressTracker } from '../src/services/progress-tracker.js';
import { DemoSeeder } from '../src/services/demo-seeder.js';
import { ChecklistPersistence } from '../src/services/checklist-persistence.js';
import { WelcomeDashboardService } from '../src/services/welcome-dashboard.js';
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

describe('Welcome Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const wizardStore = new WizardStore();
    const moduleReadiness = new ModuleReadinessChecker();
    const healthChecker = new HealthChecker();
    const progressTracker = new ProgressTracker(wizardStore, moduleReadiness, healthChecker);
    const demoSeeder = new DemoSeeder();
    const checklistPersistence = new ChecklistPersistence(wizardStore);
    const welcomeDashboard = new WelcomeDashboardService(wizardStore, progressTracker, demoSeeder);
    app = await buildApp({
      config: TEST_CONFIG,
      welcomeDeps: { welcomeDashboard, demoSeeder, checklistPersistence },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('GET /welcome — returns welcome dashboard', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/welcome',
      headers: { 'x-tenant-id': 'welcome-tenant' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.tenantId).toBe('welcome-tenant');
    expect(body.data.quickActions.length).toBeGreaterThan(0);
    expect(body.data.tips.length).toBeGreaterThan(0);
  });

  it('GET /welcome/tips — returns all tips', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/onboarding/welcome/tips' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(6);
  });

  it('GET /welcome/tips?category=getting_started — filters tips', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/welcome/tips?category=getting_started',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.every((t: { category: string }) => t.category === 'getting_started')).toBe(true);
  });

  it('POST /welcome/seed-demo — seeds demo data', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/seed-demo',
      headers: { 'x-tenant-id': 'demo-tenant' },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.seeded).toBe(true);
    expect(body.data.tag).toBe('DEMO');
    expect(body.data.counts.iocs).toBe(10);
  });

  it('POST /welcome/seed-demo — is idempotent', async () => {
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/seed-demo',
      headers: { 'x-tenant-id': 'idem-tenant' },
      payload: {},
    });
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/seed-demo',
      headers: { 'x-tenant-id': 'idem-tenant' },
      payload: {},
    });
    expect(res1.json().data.counts).toEqual(res2.json().data.counts);
  });

  it('GET /welcome/demo-status — returns seeded status', async () => {
    // Seed first
    await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/seed-demo',
      headers: { 'x-tenant-id': 'status-tenant' },
      payload: {},
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/welcome/demo-status',
      headers: { 'x-tenant-id': 'status-tenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.seeded).toBe(true);
  });

  it('GET /welcome/demo-status — not seeded for fresh tenant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/welcome/demo-status',
      headers: { 'x-tenant-id': 'fresh-tenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.seeded).toBe(false);
  });

  it('DELETE /welcome/demo-data — clears demo data', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/seed-demo',
      headers: { 'x-tenant-id': 'clear-tenant' },
      payload: {},
    });
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/onboarding/welcome/demo-data',
      headers: { 'x-tenant-id': 'clear-tenant' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('GET /welcome/demo-available — returns available counts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/onboarding/welcome/demo-available' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.iocs).toBe(10);
  });

  it('POST /welcome/tour-complete — marks tour complete', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/tour-complete',
      headers: { 'x-tenant-id': 'tour-tenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.completed).toBe(true);
  });

  it('GET /welcome/should-show — returns visibility status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/welcome/should-show',
      headers: { 'x-tenant-id': 'show-tenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.showWelcome).toBe(true);
  });

  it('POST /welcome/save-state — saves onboarding state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/save-state',
      headers: { 'x-tenant-id': 'save-tenant' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.version).toBe(1);
  });

  it('GET /welcome/saved-state — returns null for unsaved', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/welcome/saved-state',
      headers: { 'x-tenant-id': 'unsaved-tenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeNull();
  });

  it('GET /welcome/saved-state — returns saved state', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/save-state',
      headers: { 'x-tenant-id': 'saved-tenant' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/welcome/saved-state',
      headers: { 'x-tenant-id': 'saved-tenant' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).not.toBeNull();
    expect(res.json().data.version).toBe(1);
  });
});
