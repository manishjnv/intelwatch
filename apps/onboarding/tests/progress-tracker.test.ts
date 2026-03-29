import { describe, it, expect, beforeEach } from 'vitest';
import { WizardStore } from '../src/services/wizard-store.js';
import { ModuleReadinessChecker } from '../src/services/module-readiness.js';
import { HealthChecker } from '../src/services/health-checker.js';
import { ProgressTracker } from '../src/services/progress-tracker.js';

describe('ProgressTracker', () => {
  let wizardStore: WizardStore;
  let moduleReadiness: ModuleReadinessChecker;
  let healthChecker: HealthChecker;
  let tracker: ProgressTracker;

  beforeEach(() => {
    wizardStore = new WizardStore();
    moduleReadiness = new ModuleReadinessChecker();
    healthChecker = new HealthChecker();
    tracker = new ProgressTracker(wizardStore, moduleReadiness, healthChecker);
  });

  describe('runReadinessChecks', () => {
    it('returns not_ready for fresh tenant', async () => {
      await wizardStore.getOrCreate('t1');
      const result = await tracker.runReadinessChecks('t1');
      expect(result.overall).toBe('not_ready');
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('returns 8 checks', async () => {
      await wizardStore.getOrCreate('t1');
      const result = await tracker.runReadinessChecks('t1');
      expect(result.checks).toHaveLength(8);
    });

    it('org_profile fails for fresh tenant', async () => {
      await wizardStore.getOrCreate('t1');
      const result = await tracker.runReadinessChecks('t1');
      const check = result.checks.find((c) => c.name === 'org_profile');
      expect(check?.passed).toBe(false);
    });

    it('org_profile passes after setting profile', async () => {
      await wizardStore.getOrCreate('t1');
      await wizardStore.setOrgProfile('t1', {
        orgName: 'ACME',
        industry: 'Finance',
        teamSize: '6-20',
        primaryUseCase: 'soc_operations',
        timezone: 'UTC',
      });
      const result = await tracker.runReadinessChecks('t1');
      const check = result.checks.find((c) => c.name === 'org_profile');
      expect(check?.passed).toBe(true);
    });

    it('feed_active fails with no data sources', async () => {
      await wizardStore.getOrCreate('t1');
      const result = await tracker.runReadinessChecks('t1');
      const check = result.checks.find((c) => c.name === 'feed_active');
      expect(check?.passed).toBe(false);
    });

    it('feed_active passes with connected data source', async () => {
      await wizardStore.getOrCreate('t1');
      await wizardStore.addDataSource('t1', {
        id: 'src-1',
        tenantId: 't1',
        name: 'Feed',
        type: 'rss_feed',
        url: 'https://feed.test',
        status: 'connected',
        lastTestedAt: new Date().toISOString(),
        errorMessage: null,
        createdAt: new Date().toISOString(),
      });
      const result = await tracker.runReadinessChecks('t1');
      const check = result.checks.find((c) => c.name === 'feed_active');
      expect(check?.passed).toBe(true);
    });

    it('pipeline_healthy check passes for deployed services', async () => {
      await wizardStore.getOrCreate('t1');
      const result = await tracker.runReadinessChecks('t1');
      const check = result.checks.find((c) => c.name === 'pipeline_healthy');
      expect(check?.passed).toBe(true);
    });

    it('modules_enabled passes with default modules (5 >= 3)', async () => {
      await wizardStore.getOrCreate('t1');
      const result = await tracker.runReadinessChecks('t1');
      const check = result.checks.find((c) => c.name === 'modules_enabled');
      expect(check?.passed).toBe(true);
    });

    it('team_invited is not required', async () => {
      await wizardStore.getOrCreate('t1');
      const result = await tracker.runReadinessChecks('t1');
      const check = result.checks.find((c) => c.name === 'team_invited');
      expect(check?.required).toBe(false);
    });

    it('score reflects number of passed checks', async () => {
      await wizardStore.getOrCreate('t1');
      const result = await tracker.runReadinessChecks('t1');
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(result.maxScore);
    });
  });

  describe('getStats', () => {
    it('returns initial stats', async () => {
      await wizardStore.getOrCreate('t1');
      const stats = await tracker.getStats('t1');
      expect(stats.feedsActive).toBe(0);
      expect(stats.iocsIngested).toBe(0);
      expect(stats.teamMembers).toBe(0);
      expect(stats.modulesEnabled).toBe(5);
    });

    it('reflects team invites', async () => {
      await wizardStore.getOrCreate('t1');
      await wizardStore.addTeamInvites('t1', [
        { email: 'a@test.com', role: 'analyst' },
        { email: 'b@test.com', role: 'analyst' },
      ]);
      const stats = await tracker.getStats('t1');
      expect(stats.teamMembers).toBe(2);
    });
  });

  describe('getCompletionPercent', () => {
    it('returns 0 for fresh tenant', async () => {
      expect(await tracker.getCompletionPercent('t1')).toBe(0);
    });

    it('increases as steps complete', async () => {
      await wizardStore.getOrCreate('t1');
      await wizardStore.completeStep('t1', 'welcome');
      expect(await tracker.getCompletionPercent('t1')).toBeGreaterThan(0);
    });
  });
});
