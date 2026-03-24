import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WizardStore } from '../src/services/wizard-store.js';

describe('WizardStore — Redis Persistence (B2)', () => {
  // Mock Redis that behaves like a real key-value store
  function createMockRedis() {
    const store = new Map<string, { value: string; ttl: number }>();
    return {
      get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
      set: vi.fn(async (key: string, value: string, _ex: string, ttl: number) => {
        store.set(key, { value, ttl });
        return 'OK';
      }),
      del: vi.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
      _store: store,
    };
  }

  describe('in-memory mode (no Redis)', () => {
    let store: WizardStore;

    beforeEach(() => {
      store = new WizardStore(); // No Redis = test mode
    });

    it('creates wizard state on getOrCreate', async () => {
      const wizard = await store.getOrCreate('t1');
      expect(wizard.tenantId).toBe('t1');
      expect(wizard.currentStep).toBe('welcome');
      expect(wizard.completionPercent).toBe(0);
    });

    it('returns same wizard on subsequent calls', async () => {
      const w1 = await store.getOrCreate('t1');
      const w2 = await store.getOrCreate('t1');
      expect(w1.id).toBe(w2.id);
    });

    it('throws on get for unknown tenant', async () => {
      await expect(store.get('unknown')).rejects.toThrow('No onboarding session found');
    });

    it('completeStep advances wizard', async () => {
      await store.getOrCreate('t1');
      const wizard = await store.completeStep('t1', 'welcome');
      expect(wizard.steps.welcome).toBe('completed');
      expect(wizard.currentStep).not.toBe('welcome');
    });

    it('skipStep works for optional steps', async () => {
      await store.getOrCreate('t1');
      const wizard = await store.skipStep('t1', 'team_invite');
      expect(wizard.steps.team_invite).toBe('skipped');
    });

    it('skipStep rejects required steps', async () => {
      await store.getOrCreate('t1');
      await expect(store.skipStep('t1', 'welcome')).rejects.toThrow('cannot be skipped');
    });

    it('reset clears and recreates', async () => {
      await store.getOrCreate('t1');
      await store.completeStep('t1', 'welcome');
      const fresh = await store.reset('t1');
      expect(fresh.steps.welcome).toBe('pending');
      expect(fresh.completionPercent).toBe(0);
    });
  });

  describe('Redis-backed mode', () => {
    let store: WizardStore;
    let mockRedis: ReturnType<typeof createMockRedis>;

    beforeEach(() => {
      mockRedis = createMockRedis();
      store = new WizardStore(mockRedis as never);
    });

    it('persists wizard state to Redis on create', async () => {
      await store.getOrCreate('t1');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'etip:t1:wizard',
        expect.any(String),
        'EX',
        604800, // 7 days
      );
    });

    it('persists on completeStep', async () => {
      await store.getOrCreate('t1');
      mockRedis.set.mockClear();
      await store.completeStep('t1', 'welcome');
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('persists on skipStep', async () => {
      await store.getOrCreate('t1');
      mockRedis.set.mockClear();
      await store.skipStep('t1', 'team_invite');
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('persists on setOrgProfile', async () => {
      await store.getOrCreate('t1');
      mockRedis.set.mockClear();
      await store.setOrgProfile('t1', { orgName: 'Test', industry: 'tech', orgSize: 'small' } as never);
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('restores wizard from Redis when not in cache', async () => {
      // Seed Redis directly
      const wizardData = {
        id: 'redis-id',
        tenantId: 't1',
        currentStep: 'org_profile',
        steps: { welcome: 'completed', org_profile: 'pending' },
        completionPercent: 14,
        orgProfile: null,
        teamInvites: [],
        dataSources: [],
        dashboardPrefs: null,
        startedAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:01:00.000Z',
        completedAt: null,
      };
      mockRedis._store.set('etip:t1:wizard', {
        value: JSON.stringify(wizardData),
        ttl: 604800,
      });

      // New store instance (no cache) but same Redis
      const store2 = new WizardStore(mockRedis as never);
      const wizard = await store2.get('t1');
      expect(wizard.id).toBe('redis-id');
      expect(wizard.currentStep).toBe('org_profile');
    });

    it('getOrCreate restores from Redis before creating new', async () => {
      const wizardData = {
        id: 'existing',
        tenantId: 't1',
        currentStep: 'team_invite',
        steps: {},
        completionPercent: 28,
        orgProfile: null,
        teamInvites: [],
        dataSources: [],
        dashboardPrefs: null,
        startedAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
        completedAt: null,
      };
      mockRedis._store.set('etip:t1:wizard', {
        value: JSON.stringify(wizardData),
        ttl: 604800,
      });

      const store2 = new WizardStore(mockRedis as never);
      const wizard = await store2.getOrCreate('t1');
      expect(wizard.id).toBe('existing'); // Restored, not created new
    });

    it('reset deletes from Redis', async () => {
      await store.getOrCreate('t1');
      await store.reset('t1');
      expect(mockRedis.del).toHaveBeenCalledWith('etip:t1:wizard');
    });

    it('uses correct key pattern etip:{tenantId}:wizard', async () => {
      await store.getOrCreate('my-tenant');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'etip:my-tenant:wizard',
        expect.any(String),
        'EX',
        604800,
      );
    });

    it('persists on addDataSource', async () => {
      await store.getOrCreate('t1');
      mockRedis.set.mockClear();
      await store.addDataSource('t1', {
        id: 'ds1',
        tenantId: 't1',
        name: 'Test Source',
        type: 'siem',
        url: 'https://example.com',
        status: 'pending',
        lastTestedAt: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
      } as never);
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('persists on updateDataSourceStatus', async () => {
      await store.getOrCreate('t1');
      await store.addDataSource('t1', {
        id: 'ds1',
        tenantId: 't1',
        name: 'Test Source',
        type: 'siem',
        url: 'https://example.com',
        status: 'pending',
        lastTestedAt: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
      } as never);
      mockRedis.set.mockClear();
      await store.updateDataSourceStatus('t1', 'ds1', 'connected');
      expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    it('TTL is 7 days (604800 seconds)', async () => {
      await store.getOrCreate('t1');
      const setCall = mockRedis.set.mock.calls[0];
      expect(setCall[3]).toBe(604800);
    });
  });
});
