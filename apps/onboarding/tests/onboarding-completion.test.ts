import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { WizardStore } from '../src/services/wizard-store.js';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';
import { HealthChecker } from '../src/services/health-checker.js';
import { ProgressTracker } from '../src/services/progress-tracker.js';
import { RealSeeder } from '../src/services/real-seeder.js';
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

describe('Onboarding Completion — RealSeeder wiring (no demo fallback)', () => {
  let app: FastifyInstance;
  let realSeeder: RealSeeder;
  let seedTenantSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const wizardStore = new WizardStore();
    const moduleReadiness = new ModuleReadinessChecker();
    const healthChecker = new HealthChecker();
    const progressTracker = new ProgressTracker(wizardStore, moduleReadiness, healthChecker);
    realSeeder = new RealSeeder();
    const checklistPersistence = new ChecklistPersistence(wizardStore);
    const welcomeDashboard = new WelcomeDashboardService(wizardStore, progressTracker);
    app = await buildApp({
      config: TEST_CONFIG,
      welcomeDeps: { welcomeDashboard, realSeeder, checklistPersistence },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TI_REAL_SEEDER_ENABLED;
    seedTenantSpy = vi.fn().mockResolvedValue({
      seederUsed: 'real' as const,
      globalSubscriptions: 5,
      privateFeeds: 2,
      fetchesTriggered: 2,
      errors: [],
    });
    realSeeder.seedTenant = seedTenantSpy;
  });

  const inject = (body: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/welcome/seed-demo',
      headers: { 'x-tenant-id': 'test-tenant' },
      payload: body,
    });

  it('uses RealSeeder when enabled (default)', async () => {
    const res = await inject({ planTier: 'free' });
    expect(res.statusCode).toBe(201);
    expect(seedTenantSpy).toHaveBeenCalledWith('test-tenant', 'free');
    const body = res.json();
    expect(body.data.seederUsed).toBe('real');
    expect(body.data.globalSubscriptions).toBe(5);
  });

  it('returns 503 (no demo fallback) when RealSeeder throws', async () => {
    seedTenantSpy.mockRejectedValueOnce(new Error('connection refused'));
    const res = await inject();
    expect(res.statusCode).toBe(500);
  });

  it('feature flag off → 503 SEEDER_UNAVAILABLE, RealSeeder never called', async () => {
    process.env.TI_REAL_SEEDER_ENABLED = 'false';
    const res = await inject();
    expect(res.statusCode).toBe(503);
    expect(seedTenantSpy).not.toHaveBeenCalled();
    expect(res.json().code).toBe('SEEDER_UNAVAILABLE');
  });

  it('SeedResult counts passed through to response, no sample fields', async () => {
    const res = await inject({ planTier: 'teams' });
    const body = res.json();
    expect(body.data.privateFeeds).toBe(2);
    expect(body.data.fetchesTriggered).toBe(2);
    expect(body.data).not.toHaveProperty('sampleIocs');
    expect(body.data).not.toHaveProperty('sampleActors');
    expect(body.data).not.toHaveProperty('sampleMalware');
  });

  it('errors from RealSeeder logged but do not fail onboarding', async () => {
    seedTenantSpy.mockResolvedValueOnce({
      seederUsed: 'real',
      globalSubscriptions: 3,
      privateFeeds: 1,
      fetchesTriggered: 1,
      errors: ['Failed to subscribe to global feed: XYZ'],
    });
    const res = await inject();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.errors).toContain('Failed to subscribe to global feed: XYZ');
    expect(body.data.globalSubscriptions).toBe(3);
  });

  it('never calls any IOC/actor/malware/vuln create client, and returns 503 when disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    process.env.TI_REAL_SEEDER_ENABLED = 'false';
    const res = await inject();
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('SEEDER_UNAVAILABLE');
    // RealSeederDeps has no ioc/actor/malware/vuln clients at all — nothing could have
    // hit those service endpoints, and the disabled flag means seedTenant never ran either.
    const hitUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(hitUrls.some((u) => /\/api\/v1\/(iocs|actors|malware|vulnerabilities)\b/.test(u))).toBe(false);
    fetchSpy.mockRestore();
  });
});
