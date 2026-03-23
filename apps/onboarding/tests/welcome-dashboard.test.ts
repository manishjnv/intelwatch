import { describe, it, expect, beforeEach } from 'vitest';
import { WizardStore } from '../src/services/wizard-store.js';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';
import { HealthChecker } from '../src/services/health-checker.js';
import { ProgressTracker } from '../src/services/progress-tracker.js';
import { DemoSeeder } from '../src/services/demo-seeder.js';
import { WelcomeDashboardService } from '../src/services/welcome-dashboard.js';

describe('WelcomeDashboardService', () => {
  let wizardStore: WizardStore;
  let progressTracker: ProgressTracker;
  let demoSeeder: DemoSeeder;
  let welcome: WelcomeDashboardService;

  beforeEach(() => {
    wizardStore = new WizardStore();
    const moduleReadiness = new ModuleReadinessChecker();
    const healthChecker = new HealthChecker();
    progressTracker = new ProgressTracker(wizardStore, moduleReadiness, healthChecker);
    demoSeeder = new DemoSeeder();
    welcome = new WelcomeDashboardService(wizardStore, progressTracker, demoSeeder);
  });

  describe('getDashboard', () => {
    it('returns dashboard for new tenant', () => {
      const dashboard = welcome.getDashboard('t1');
      expect(dashboard.tenantId).toBe('t1');
      expect(dashboard.onboardingComplete).toBe(false);
      expect(dashboard.completionPercent).toBe(0);
      expect(dashboard.nextStep).toBe('welcome');
    });

    it('includes stats', () => {
      const dashboard = welcome.getDashboard('t1');
      expect(dashboard.stats).toBeDefined();
      expect(typeof dashboard.stats.feedsActive).toBe('number');
      expect(typeof dashboard.stats.teamMembers).toBe('number');
      expect(typeof dashboard.stats.modulesEnabled).toBe('number');
    });

    it('includes quick actions', () => {
      const dashboard = welcome.getDashboard('t1');
      expect(dashboard.quickActions.length).toBeGreaterThan(0);
      expect(dashboard.quickActions[0].id).toBeDefined();
      expect(dashboard.quickActions[0].title).toBeDefined();
    });

    it('includes guided tips', () => {
      const dashboard = welcome.getDashboard('t1');
      expect(dashboard.tips.length).toBeGreaterThan(0);
      expect(dashboard.tips[0].title).toBeDefined();
    });

    it('nextStep is null when onboarding complete', () => {
      wizardStore.getOrCreate('t1');
      const steps = [
        'welcome', 'org_profile', 'team_invite', 'feed_activation',
        'integration_setup', 'dashboard_config', 'readiness_check', 'launch',
      ] as const;
      for (const step of steps) {
        wizardStore.completeStep('t1', step);
      }
      const dashboard = welcome.getDashboard('t1');
      expect(dashboard.nextStep).toBeNull();
      expect(dashboard.onboardingComplete).toBe(true);
    });

    it('quick action add_feed is completed when feeds active', () => {
      wizardStore.getOrCreate('t1');
      wizardStore.addDataSource('t1', {
        id: 'src-1', tenantId: 't1', name: 'Feed', type: 'rss_feed',
        url: 'https://feed.test', status: 'connected',
        lastTestedAt: new Date().toISOString(), errorMessage: null,
        createdAt: new Date().toISOString(),
      });
      const dashboard = welcome.getDashboard('t1');
      const addFeed = dashboard.quickActions.find((a) => a.id === 'add_feed');
      expect(addFeed?.completed).toBe(true);
    });
  });

  describe('getTips', () => {
    it('returns all tips without filter', () => {
      const tips = welcome.getTips();
      expect(tips.length).toBe(6);
    });

    it('filters by category', () => {
      const tips = welcome.getTips('getting_started');
      expect(tips.every((t) => t.category === 'getting_started')).toBe(true);
    });

    it('returns empty for unknown category', () => {
      const tips = welcome.getTips('nonexistent');
      expect(tips).toHaveLength(0);
    });
  });

  describe('shouldShowWelcome', () => {
    it('returns true for incomplete onboarding', () => {
      wizardStore.getOrCreate('t1');
      expect(welcome.shouldShowWelcome('t1')).toBe(true);
    });

    it('returns false when onboarding complete', () => {
      wizardStore.getOrCreate('t1');
      const steps = [
        'welcome', 'org_profile', 'team_invite', 'feed_activation',
        'integration_setup', 'dashboard_config', 'readiness_check', 'launch',
      ] as const;
      for (const step of steps) {
        wizardStore.completeStep('t1', step);
      }
      expect(welcome.shouldShowWelcome('t1')).toBe(false);
    });
  });

  describe('markTourCompleted / isTourCompleted', () => {
    it('returns false by default', () => {
      expect(welcome.isTourCompleted('t1')).toBe(false);
    });

    it('returns true after marking', () => {
      welcome.markTourCompleted('t1');
      expect(welcome.isTourCompleted('t1')).toBe(true);
    });

    it('per-tenant isolation', () => {
      welcome.markTourCompleted('t1');
      expect(welcome.isTourCompleted('t1')).toBe(true);
      expect(welcome.isTourCompleted('t2')).toBe(false);
    });
  });
});
