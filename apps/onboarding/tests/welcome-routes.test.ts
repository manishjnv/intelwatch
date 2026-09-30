import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { WizardStore } from '../src/services/wizard-store.js';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';
import { HealthChecker } from '../src/services/health-checker.js';
import { ProgressTracker } from '../src/services/progress-tracker.js';
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
    const checklistPersistence = new ChecklistPersistence(wizardStore);
    const welcomeDashboard = new WelcomeDashboardService(wizardStore, progressTracker);
    app = await buildApp({
      config: TEST_CONFIG,
      welcomeDeps: { welcomeDashboard, checklistPersistence },
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

  it('POST /welcome/seed-demo — returns 503 when RealSeeder is not wired', async () => {
    // welcomeDeps above has no realSeeder — route must reject, never fall back to fabricated data.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/seed-demo',
      headers: { 'x-tenant-id': 'demo-tenant' },
      payload: {},
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('SEEDER_UNAVAILABLE');
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
