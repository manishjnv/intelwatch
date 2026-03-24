import { describe, it, expect, beforeEach } from 'vitest';
import { WizardStore } from '../src/services/wizard-store.js';

describe('WizardStore', () => {
  let store: WizardStore;

  beforeEach(() => {
    store = new WizardStore();
  });

  describe('getOrCreate', () => {
    it('creates a new wizard for a tenant', async () => {
      const wizard = await store.getOrCreate('tenant-1');
      expect(wizard.tenantId).toBe('tenant-1');
      expect(wizard.currentStep).toBe('welcome');
      expect(wizard.completionPercent).toBe(0);
      expect(wizard.orgProfile).toBeNull();
      expect(wizard.teamInvites).toEqual([]);
      expect(wizard.dataSources).toEqual([]);
      expect(wizard.completedAt).toBeNull();
    });

    it('returns existing wizard on second call', async () => {
      const first = await store.getOrCreate('tenant-1');
      const second = await store.getOrCreate('tenant-1');
      expect(first.id).toBe(second.id);
    });

    it('creates separate wizards for different tenants', async () => {
      const a = await store.getOrCreate('tenant-a');
      const b = await store.getOrCreate('tenant-b');
      expect(a.id).not.toBe(b.id);
    });

    it('initializes all 8 steps as pending', async () => {
      const wizard = await store.getOrCreate('tenant-1');
      expect(Object.keys(wizard.steps)).toHaveLength(8);
      expect(Object.values(wizard.steps).every((s) => s === 'pending')).toBe(true);
    });
  });

  describe('completeStep', () => {
    it('marks step as completed', async () => {
      await store.getOrCreate('t1');
      const wizard = await store.completeStep('t1', 'welcome');
      expect(wizard.steps.welcome).toBe('completed');
    });

    it('advances currentStep to next pending', async () => {
      await store.getOrCreate('t1');
      const wizard = await store.completeStep('t1', 'welcome');
      expect(wizard.currentStep).toBe('org_profile');
    });

    it('calculates completion percentage', async () => {
      await store.getOrCreate('t1');
      const wizard = await store.completeStep('t1', 'welcome');
      expect(wizard.completionPercent).toBe(13); // 1/8 = 12.5 → rounded to 13
    });

    it('sets completedAt when all steps done', async () => {
      await store.getOrCreate('t1');
      const steps = [
        'welcome', 'org_profile', 'team_invite', 'feed_activation',
        'integration_setup', 'dashboard_config', 'readiness_check', 'launch',
      ] as const;
      let wizard;
      for (const step of steps) {
        wizard = await store.completeStep('t1', step);
      }
      expect(wizard!.completionPercent).toBe(100);
      expect(wizard!.completedAt).not.toBeNull();
    });

    it('throws for nonexistent tenant', async () => {
      await expect(store.completeStep('nonexistent', 'welcome')).rejects.toThrow('No onboarding session found');
    });

    it('stores org profile data on welcome step', async () => {
      await store.getOrCreate('t1');
      const data = { orgName: 'ACME', industry: 'Finance', teamSize: '6-20', primaryUseCase: 'soc_operations', timezone: 'UTC' };
      const wizard = await store.completeStep('t1', 'welcome', data);
      expect(wizard.orgProfile).toEqual(data);
    });
  });

  describe('skipStep', () => {
    it('marks optional step as skipped', async () => {
      await store.getOrCreate('t1');
      const wizard = await store.skipStep('t1', 'team_invite');
      expect(wizard.steps.team_invite).toBe('skipped');
    });

    it('advances currentStep past skipped step', async () => {
      await store.getOrCreate('t1');
      await store.completeStep('t1', 'welcome');
      await store.completeStep('t1', 'org_profile');
      const wizard = await store.skipStep('t1', 'team_invite');
      expect(wizard.currentStep).toBe('feed_activation');
    });

    it('throws for required steps (welcome)', async () => {
      await store.getOrCreate('t1');
      await expect(store.skipStep('t1', 'welcome')).rejects.toThrow("cannot be skipped");
    });

    it('throws for required steps (org_profile)', async () => {
      await store.getOrCreate('t1');
      await expect(store.skipStep('t1', 'org_profile')).rejects.toThrow("cannot be skipped");
    });

    it('throws for required steps (readiness_check)', async () => {
      await store.getOrCreate('t1');
      await expect(store.skipStep('t1', 'readiness_check')).rejects.toThrow("cannot be skipped");
    });

    it('throws for required steps (launch)', async () => {
      await store.getOrCreate('t1');
      await expect(store.skipStep('t1', 'launch')).rejects.toThrow("cannot be skipped");
    });

    it('counts skipped steps toward completion', async () => {
      await store.getOrCreate('t1');
      const wizard = await store.skipStep('t1', 'team_invite');
      expect(wizard.completionPercent).toBe(13); // 1/8
    });
  });

  describe('setOrgProfile', () => {
    it('stores org profile', async () => {
      await store.getOrCreate('t1');
      const profile = { orgName: 'Corp', industry: 'Tech', teamSize: '1-5' as const, primaryUseCase: 'threat_intelligence' as const, timezone: 'EST' };
      const wizard = await store.setOrgProfile('t1', profile);
      expect(wizard.orgProfile).toEqual(profile);
    });

    it('throws for nonexistent tenant', async () => {
      const profile = { orgName: 'X', industry: 'Y', teamSize: '1-5' as const, primaryUseCase: 'compliance' as const, timezone: 'UTC' };
      await expect(store.setOrgProfile('nope', profile)).rejects.toThrow('No onboarding session found');
    });
  });

  describe('addTeamInvites', () => {
    it('adds invites to the wizard', async () => {
      await store.getOrCreate('t1');
      const invites = [{ email: 'a@test.com', role: 'analyst' as const }, { email: 'b@test.com', role: 'viewer' as const }];
      const wizard = await store.addTeamInvites('t1', invites);
      expect(wizard.teamInvites).toHaveLength(2);
    });

    it('appends to existing invites', async () => {
      await store.getOrCreate('t1');
      await store.addTeamInvites('t1', [{ email: 'a@test.com', role: 'analyst' as const }]);
      const wizard = await store.addTeamInvites('t1', [{ email: 'b@test.com', role: 'viewer' as const }]);
      expect(wizard.teamInvites).toHaveLength(2);
    });
  });

  describe('addDataSource', () => {
    it('adds a data source', async () => {
      await store.getOrCreate('t1');
      const source = {
        id: 'src-1', tenantId: 't1', name: 'CISA', type: 'rss_feed' as const,
        url: 'https://cisa.gov/feed', status: 'pending' as const,
        lastTestedAt: null, errorMessage: null, createdAt: new Date().toISOString(),
      };
      const wizard = await store.addDataSource('t1', source);
      expect(wizard.dataSources).toHaveLength(1);
      expect(wizard.dataSources[0].name).toBe('CISA');
    });
  });

  describe('updateDataSourceStatus', () => {
    it('updates status to connected', async () => {
      await store.getOrCreate('t1');
      const source = {
        id: 'src-1', tenantId: 't1', name: 'Feed', type: 'rss_feed' as const,
        url: 'https://feed.test', status: 'pending' as const,
        lastTestedAt: null, errorMessage: null, createdAt: new Date().toISOString(),
      };
      await store.addDataSource('t1', source);
      const updated = await store.updateDataSourceStatus('t1', 'src-1', 'connected');
      expect(updated.status).toBe('connected');
      expect(updated.lastTestedAt).not.toBeNull();
    });

    it('updates status with error message', async () => {
      await store.getOrCreate('t1');
      const source = {
        id: 'src-2', tenantId: 't1', name: 'Bad Feed', type: 'rest_api' as const,
        url: 'https://bad.test', status: 'pending' as const,
        lastTestedAt: null, errorMessage: null, createdAt: new Date().toISOString(),
      };
      await store.addDataSource('t1', source);
      const updated = await store.updateDataSourceStatus('t1', 'src-2', 'failed', 'Connection refused');
      expect(updated.status).toBe('failed');
      expect(updated.errorMessage).toBe('Connection refused');
    });

    it('throws for nonexistent source', async () => {
      await store.getOrCreate('t1');
      await expect(store.updateDataSourceStatus('t1', 'nope', 'connected')).rejects.toThrow('Data source');
    });
  });

  describe('reset', () => {
    it('resets wizard to initial state', async () => {
      await store.getOrCreate('t1');
      await store.completeStep('t1', 'welcome');
      await store.completeStep('t1', 'org_profile');
      const wizard = await store.reset('t1');
      expect(wizard.currentStep).toBe('welcome');
      expect(wizard.completionPercent).toBe(0);
      expect(wizard.orgProfile).toBeNull();
    });
  });

  describe('isComplete', () => {
    it('returns false for new tenant', async () => {
      await store.getOrCreate('t1');
      expect(store.isComplete('t1')).toBe(false);
    });

    it('returns true when all steps completed', async () => {
      await store.getOrCreate('t1');
      const steps = [
        'welcome', 'org_profile', 'team_invite', 'feed_activation',
        'integration_setup', 'dashboard_config', 'readiness_check', 'launch',
      ] as const;
      for (const step of steps) {
        await store.completeStep('t1', step);
      }
      expect(store.isComplete('t1')).toBe(true);
    });
  });

  describe('setDashboardPrefs', () => {
    it('stores dashboard preferences', async () => {
      await store.getOrCreate('t1');
      const prefs = { layout: 'compact' as const, defaultTimeRange: '30d' as const };
      const wizard = await store.setDashboardPrefs('t1', prefs);
      expect(wizard.dashboardPrefs).toEqual(prefs);
    });
  });
});
