import { describe, it, expect, vi } from 'vitest';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';
import { ChecklistPersistence } from '../src/services/checklist-persistence.js';
import { WelcomeDashboardService } from '../src/services/welcome-dashboard.js';
import { WizardStore } from '../src/services/wizard-store.js';
import { ProgressTracker } from '../src/services/progress-tracker.js';
import { HealthChecker } from '../src/services/health-checker.js';

vi.mock('../src/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

/** Tiny fake Redis: get/set/del over a Map, same shape as wizard-store's mock. */
function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store,
  };
}

describe('S159d Redis persistence — onboarding', () => {
  describe('ModuleReadinessChecker', () => {
    it('module enable survives a new instance on the same Redis', async () => {
      const redis = createMockRedis();
      const checkerA = new ModuleReadinessChecker(redis as never);
      await checkerA.enableModule('t1', 'threat-graph');

      const checkerB = new ModuleReadinessChecker(redis as never);
      const readiness = await checkerB.checkModule('t1', 'threat-graph');
      expect(readiness.enabled).toBe(true);
    });

    it('uses key etip:{tenantId}:modules', async () => {
      const redis = createMockRedis();
      const checker = new ModuleReadinessChecker(redis as never);
      await checker.checkAll('my-tenant');
      expect(redis._store.has('etip:my-tenant:modules')).toBe(true);
    });

    it('tenant isolation — tenant B sees none of tenant A state', async () => {
      const redis = createMockRedis();
      const checkerA = new ModuleReadinessChecker(redis as never);
      await checkerA.enableModule('tenant-a', 'threat-graph');

      const checkerB = new ModuleReadinessChecker(redis as never);
      const readiness = await checkerB.checkModule('tenant-b', 'threat-graph');
      expect(readiness.enabled).toBe(false);
    });
  });

  describe('ChecklistPersistence', () => {
    it('checklist snapshot survives a new instance', async () => {
      const redis = createMockRedis();
      const wizardStore = new WizardStore();
      await wizardStore.getOrCreate('t1');
      await wizardStore.completeStep('t1', 'welcome');

      const persistenceA = new ChecklistPersistence(wizardStore, redis as never);
      await persistenceA.save('t1');

      const persistenceB = new ChecklistPersistence(wizardStore, redis as never);
      const snapshot = await persistenceB.restore('t1');
      expect(snapshot.wizardState.steps.welcome).toBe('completed');
    });

    it('tenant isolation — tenant B has no saved state', async () => {
      const redis = createMockRedis();
      const wizardStore = new WizardStore();
      await wizardStore.getOrCreate('tenant-a');

      const persistenceA = new ChecklistPersistence(wizardStore, redis as never);
      await persistenceA.save('tenant-a');

      const persistenceB = new ChecklistPersistence(wizardStore, redis as never);
      expect(await persistenceB.hasSavedState('tenant-b')).toBe(false);
    });
  });

  describe('WelcomeDashboardService — tour-completed', () => {
    it('tour-completed survives a new instance', async () => {
      const redis = createMockRedis();
      const wizardStore = new WizardStore();
      const moduleReadiness = new ModuleReadinessChecker();
      const healthChecker = new HealthChecker();
      const progressTracker = new ProgressTracker(wizardStore, moduleReadiness, healthChecker);

      const welcomeA = new WelcomeDashboardService(wizardStore, progressTracker, redis as never);
      await welcomeA.markTourCompleted('t1');

      const welcomeB = new WelcomeDashboardService(wizardStore, progressTracker, redis as never);
      expect(await welcomeB.isTourCompleted('t1')).toBe(true);
    });

    it('tenant isolation — tenant B tour not completed', async () => {
      const redis = createMockRedis();
      const wizardStore = new WizardStore();
      const moduleReadiness = new ModuleReadinessChecker();
      const healthChecker = new HealthChecker();
      const progressTracker = new ProgressTracker(wizardStore, moduleReadiness, healthChecker);

      const welcomeA = new WelcomeDashboardService(wizardStore, progressTracker, redis as never);
      await welcomeA.markTourCompleted('tenant-a');

      const welcomeB = new WelcomeDashboardService(wizardStore, progressTracker, redis as never);
      expect(await welcomeB.isTourCompleted('tenant-b')).toBe(false);
    });
  });
});
