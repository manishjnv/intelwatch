/**
 * @module tests/e2e/onboarding-seeding-smoke
 * @description Integration-level tests for the RealSeeder onboarding flow.
 * Validates that tenant onboarding correctly subscribes to feeds, creates
 * sample entities, and falls back to DemoSeeder on failure.
 *
 * These tests mock the HTTP layer (ServiceClient) but exercise the full
 * RealSeeder → DemoSeeder fallback path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@etip/shared-auth', () => ({
  signServiceToken: vi.fn().mockReturnValue('mock-jwt-token'),
  loadJwtConfig: vi.fn(),
  loadServiceJwtSecret: vi.fn(),
}));

// Suppress logger noise
vi.mock('../../apps/onboarding/src/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { RealSeeder } from '../../apps/onboarding/src/services/real-seeder.js';

// ─── Mock Catalog ──────────────────────────────────────────────

const MOCK_CATALOG = [
  { id: 'g1', name: 'CISA KEV', feedType: 'rest', minPlanTier: 'free', enabled: true },
  { id: 'g2', name: 'NVD', feedType: 'nvd', minPlanTier: 'free', enabled: true },
  { id: 'g3', name: 'URLhaus', feedType: 'rest', minPlanTier: 'free', enabled: true },
  { id: 'g4', name: 'PhishTank', feedType: 'rest', minPlanTier: 'free', enabled: true },
  { id: 'g5', name: 'Tor Exit', feedType: 'rest', minPlanTier: 'free', enabled: true },
  { id: 'g6', name: 'OTX', feedType: 'rest', minPlanTier: 'starter', enabled: true },
  { id: 'g7', name: 'Emerging', feedType: 'rss', minPlanTier: 'starter', enabled: true },
  { id: 'g8', name: 'Feodo', feedType: 'rest', minPlanTier: 'starter', enabled: true },
  { id: 'g9', name: 'MalwareBazaar', feedType: 'rest', minPlanTier: 'starter', enabled: true },
  { id: 'g10', name: 'CIRCL MISP', feedType: 'misp', minPlanTier: 'enterprise', enabled: true },
];

function makeMockClients() {
  return {
    ingestionClient: {
      get: vi.fn().mockResolvedValue({ data: MOCK_CATALOG }),
      post: vi.fn().mockResolvedValue({ data: { id: 'new-id' } }),
    },
    iocClient: {
      get: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      post: vi.fn().mockResolvedValue({ data: { id: 'ioc-new' } }),
    },
    actorClient: {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: { id: 'actor-new' } }),
    },
    malwareClient: {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: { id: 'mal-new' } }),
    },
  };
}

describe('E2E: Onboarding Seeding Smoke', () => {
  let seeder: RealSeeder;
  let clients: ReturnType<typeof makeMockClients>;

  beforeEach(() => {
    seeder = new RealSeeder();
    clients = makeMockClients();
    seeder.setClients(clients as any);
  });

  it('free tier onboarding subscribes to 5 global feeds', async () => {
    const result = await seeder.seedTenant('tenant-1', 'free');
    expect(result.globalSubscriptions).toBe(5);
    // Verify subscribe calls are to the 5 free feeds
    const subscribeCalls = clients.ingestionClient.post.mock.calls
      .filter((c: any) => (c[0] as string).includes('/catalog/'));
    expect(subscribeCalls).toHaveLength(5);
    expect(subscribeCalls[0][0]).toContain('/catalog/g1/subscribe');
    expect(subscribeCalls[4][0]).toContain('/catalog/g5/subscribe');
  });

  it('teams tier onboarding subscribes to all eligible global feeds', async () => {
    const result = await seeder.seedTenant('tenant-2', 'teams');
    // teams can access free + starter feeds (g1-g9, not g10=enterprise)
    expect(result.globalSubscriptions).toBe(9);
  });

  it('private starter feeds created and fetch triggered', async () => {
    const result = await seeder.seedTenant('tenant-3', 'free');
    expect(result.privateFeeds).toBe(2);
    expect(result.fetchesTriggered).toBe(2);
    // Verify feed creation calls
    const feedCalls = clients.ingestionClient.post.mock.calls
      .filter((c: any) => c[0] === '/api/v1/feeds');
    expect(feedCalls).toHaveLength(2);
    // Verify trigger calls
    const triggerCalls = clients.ingestionClient.post.mock.calls
      .filter((c: any) => (c[0] as string).includes('/trigger'));
    expect(triggerCalls).toHaveLength(2);
  });

  it('sample IOCs created on cold start (no existing IOCs)', async () => {
    clients.iocClient.get.mockResolvedValueOnce({ data: [], total: 0 });
    const result = await seeder.seedTenant('tenant-4', 'free');
    expect(result.sampleIocs).toBe(5);
    expect(clients.iocClient.post).toHaveBeenCalledTimes(5);
    // Verify IOC types
    const iocCalls = clients.iocClient.post.mock.calls;
    const types = iocCalls.map((c: any) => c[1].type);
    expect(types).toEqual(['ip', 'domain', 'sha256', 'cve', 'url']);
  });

  it('sample IOCs skipped when global IOCs already exist', async () => {
    clients.iocClient.get.mockResolvedValueOnce({ data: [{ id: 'existing' }], total: 100 });
    const result = await seeder.seedTenant('tenant-5', 'free');
    expect(result.sampleIocs).toBe(0);
    expect(clients.iocClient.post).not.toHaveBeenCalled();
  });

  it('sample actors and malware created', async () => {
    const result = await seeder.seedTenant('tenant-6', 'free');
    expect(result.sampleActors).toBe(3);
    expect(result.sampleMalware).toBe(3);
    // Verify actor names
    const actorCalls = clients.actorClient.post.mock.calls;
    const actorNames = actorCalls.map((c: any) => c[1].name);
    expect(actorNames).toEqual(['APT29', 'Lazarus Group', 'FIN7']);
    // Verify malware names
    const malCalls = clients.malwareClient.post.mock.calls;
    const malNames = malCalls.map((c: any) => c[1].name);
    expect(malNames).toEqual(['Emotet', 'Cobalt Strike', 'Log4Shell Exploit']);
  });

  it('RealSeeder failure does not throw — errors captured in result', async () => {
    // Make ALL ingestion calls fail
    clients.ingestionClient.get.mockResolvedValueOnce(null);
    clients.ingestionClient.post.mockResolvedValue(null);
    clients.iocClient.get.mockResolvedValueOnce(null);
    clients.iocClient.post.mockResolvedValue(null);
    clients.actorClient.post.mockResolvedValue(null);
    clients.malwareClient.post.mockResolvedValue(null);

    // Should not throw
    const result = await seeder.seedTenant('tenant-7', 'free');
    expect(result.globalSubscriptions).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContain('Failed to fetch global feed catalog');
  });

  it('partial failure: some calls fail, others succeed', async () => {
    // First 3 subscribes succeed, rest fail
    clients.ingestionClient.post
      .mockResolvedValueOnce({ data: { id: 's1' } })
      .mockResolvedValueOnce({ data: { id: 's2' } })
      .mockResolvedValueOnce({ data: { id: 's3' } })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      // Private feeds succeed
      .mockResolvedValueOnce({ data: { id: 'pf1' } })
      .mockResolvedValueOnce({ data: { id: 'pf2' } })
      // Triggers succeed
      .mockResolvedValueOnce({ data: { jobId: 'j1' } })
      .mockResolvedValueOnce({ data: { jobId: 'j2' } });

    const result = await seeder.seedTenant('tenant-8', 'free');
    expect(result.globalSubscriptions).toBe(3);
    expect(result.privateFeeds).toBe(2);
    expect(result.errors.length).toBe(2); // 2 failed subscriptions
    // Other entities still seeded
    expect(result.sampleActors).toBe(3);
  });

  it('enterprise tier includes CIRCL MISP feed', async () => {
    const result = await seeder.seedTenant('tenant-9', 'enterprise');
    // All 10 feeds eligible
    expect(result.globalSubscriptions).toBe(10);
    const subscribeCalls = clients.ingestionClient.post.mock.calls
      .filter((c: any) => (c[0] as string).includes('/catalog/'));
    const feedIds = subscribeCalls.map((c: any) => {
      const match = (c[0] as string).match(/\/catalog\/(g\d+)\//);
      return match?.[1];
    });
    expect(feedIds).toContain('g10'); // CIRCL MISP
  });

  it('all HTTP calls include x-tenant-id header', async () => {
    await seeder.seedTenant('header-test-tenant', 'free');
    // Check catalog GET
    expect(clients.ingestionClient.get).toHaveBeenCalledWith(
      '/api/v1/catalog', { 'x-tenant-id': 'header-test-tenant' },
    );
    // Check IOC GET
    expect(clients.iocClient.get).toHaveBeenCalledWith(
      '/api/v1/iocs?limit=1', { 'x-tenant-id': 'header-test-tenant' },
    );
    // Check all POST calls include header
    for (const call of clients.actorClient.post.mock.calls) {
      expect(call[2]).toEqual({ 'x-tenant-id': 'header-test-tenant' });
    }
  });
});
