import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { WizardStore } from '../src/services/wizard-store.js';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';
import { HealthChecker } from '../src/services/health-checker.js';
import { ProgressTracker } from '../src/services/progress-tracker.js';
import { DemoSeeder } from '../src/services/demo-seeder.js';
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

describe('Onboarding Completion — RealSeeder wiring', () => {
  let app: FastifyInstance;
  let demoSeeder: DemoSeeder;
  let realSeeder: RealSeeder;
  let seedTenantSpy: ReturnType<typeof vi.fn>;
  let demoSeedSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const wizardStore = new WizardStore();
    const moduleReadiness = new ModuleReadinessChecker();
    const healthChecker = new HealthChecker();
    const progressTracker = new ProgressTracker(wizardStore, moduleReadiness, healthChecker);
    demoSeeder = new DemoSeeder();
    realSeeder = new RealSeeder();
    const checklistPersistence = new ChecklistPersistence(wizardStore);
    const welcomeDashboard = new WelcomeDashboardService(wizardStore, progressTracker, demoSeeder);
    app = await buildApp({
      config: TEST_CONFIG,
      welcomeDeps: { welcomeDashboard, demoSeeder, realSeeder, checklistPersistence },
    });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.TI_REAL_SEEDER_ENABLED;
    // Spy on both seeders
    seedTenantSpy = vi.fn().mockResolvedValue({
      seederUsed: 'real' as const,
      globalSubscriptions: 5,
      privateFeeds: 2,
      fetchesTriggered: 2,
      sampleIocs: 5,
      sampleActors: 3,
      sampleMalware: 3,
      errors: [],
    });
    realSeeder.seedTenant = seedTenantSpy;

    demoSeedSpy = vi.fn().mockResolvedValue({
      seeded: true,
      counts: { iocs: 10, actors: 5, malware: 5, vulnerabilities: 5, feeds: 3, alerts: 0 },
      tag: 'DEMO' as const,
    });
    demoSeeder.seed = demoSeedSpy;
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

  it('falls back to DemoSeeder on RealSeeder failure', async () => {
    seedTenantSpy.mockRejectedValueOnce(new Error('connection refused'));
    const res = await inject();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.seederUsed).toBe('demo');
    expect(demoSeedSpy).toHaveBeenCalled();
  });

  it('returns seederUsed=real on success', async () => {
    const res = await inject({ planTier: 'starter' });
    const body = res.json();
    expect(body.data.seederUsed).toBe('real');
  });

  it('returns seederUsed=demo on fallback', async () => {
    seedTenantSpy.mockRejectedValueOnce(new Error('timeout'));
    const res = await inject();
    const body = res.json();
    expect(body.data.seederUsed).toBe('demo');
  });

  it('feature flag off → uses DemoSeeder directly', async () => {
    process.env.TI_REAL_SEEDER_ENABLED = 'false';
    const res = await inject();
    expect(res.statusCode).toBe(201);
    expect(seedTenantSpy).not.toHaveBeenCalled();
    expect(demoSeedSpy).toHaveBeenCalled();
    const body = res.json();
    expect(body.data.seederUsed).toBe('demo');
  });

  it('SeedResult counts passed through to response', async () => {
    const res = await inject({ planTier: 'teams' });
    const body = res.json();
    expect(body.data.privateFeeds).toBe(2);
    expect(body.data.fetchesTriggered).toBe(2);
    expect(body.data.sampleIocs).toBe(5);
    expect(body.data.sampleActors).toBe(3);
    expect(body.data.sampleMalware).toBe(3);
  });

  it('errors from RealSeeder logged but do not fail onboarding', async () => {
    seedTenantSpy.mockResolvedValueOnce({
      seederUsed: 'real',
      globalSubscriptions: 3,
      privateFeeds: 1,
      fetchesTriggered: 1,
      sampleIocs: 0,
      sampleActors: 0,
      sampleMalware: 0,
      errors: ['Failed to subscribe to global feed: XYZ', 'Failed to seed IOC: 1.2.3.4'],
    });
    const res = await inject();
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.errors).toContain('Failed to subscribe to global feed: XYZ');
    expect(body.data.globalSubscriptions).toBe(3);
  });

  it('existing DemoSeeder behavior unchanged when used as fallback', async () => {
    seedTenantSpy.mockRejectedValueOnce(new Error('fail'));
    const res = await inject();
    const body = res.json();
    // DemoSeeder shape preserved
    expect(body.data.seeded).toBe(true);
    expect(body.data.tag).toBe('DEMO');
    expect(body.data.counts.iocs).toBe(10);
  });
});
