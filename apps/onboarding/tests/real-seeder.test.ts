import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealSeeder } from '../src/services/real-seeder.js';

vi.mock('../src/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@etip/shared-auth', () => ({
  signServiceToken: vi.fn().mockReturnValue('mock-jwt-token'),
  loadJwtConfig: vi.fn(),
  loadServiceJwtSecret: vi.fn(),
}));

// ─── Mock Catalog Data ─────────────────────────────────────────

const CATALOG_FEEDS = [
  { id: 'f1', name: 'CISA KEV', feedType: 'rest', minPlanTier: 'free', enabled: true },
  { id: 'f2', name: 'NVD', feedType: 'nvd', minPlanTier: 'free', enabled: true },
  { id: 'f3', name: 'URLhaus', feedType: 'rest', minPlanTier: 'free', enabled: true },
  { id: 'f4', name: 'PhishTank', feedType: 'rest', minPlanTier: 'free', enabled: true },
  { id: 'f5', name: 'Tor Exit', feedType: 'rest', minPlanTier: 'free', enabled: true },
  { id: 'f6', name: 'AlienVault OTX', feedType: 'rest', minPlanTier: 'starter', enabled: true },
  { id: 'f7', name: 'Emerging Threats', feedType: 'rss', minPlanTier: 'starter', enabled: true },
  { id: 'f8', name: 'Feodo Tracker', feedType: 'rest', minPlanTier: 'starter', enabled: true },
  { id: 'f9', name: 'MalwareBazaar', feedType: 'rest', minPlanTier: 'starter', enabled: true },
  { id: 'f10', name: 'CIRCL MISP', feedType: 'misp', minPlanTier: 'enterprise', enabled: true },
  { id: 'f11', name: 'Disabled Feed', feedType: 'rss', minPlanTier: 'free', enabled: false },
];

function makeMockClients() {
  return {
    ingestionClient: {
      get: vi.fn().mockResolvedValue({ data: CATALOG_FEEDS }),
      post: vi.fn().mockResolvedValue({ data: { id: 'new-feed-id' } }),
    },
    iocClient: {
      get: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      post: vi.fn().mockResolvedValue({ data: { id: 'ioc-1' } }),
    },
    actorClient: {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: { id: 'actor-1' } }),
    },
    malwareClient: {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: { id: 'malware-1' } }),
    },
  };
}

describe('RealSeeder', () => {
  let seeder: RealSeeder;
  let mockClients: ReturnType<typeof makeMockClients>;

  beforeEach(() => {
    seeder = new RealSeeder();
    mockClients = makeMockClients();
    seeder.setClients(mockClients as any);
  });

  describe('seedTenant — global subscriptions', () => {
    it('free tier subscribes to max 5 global feeds', async () => {
      const result = await seeder.seedTenant('t1', 'free');
      expect(result.globalSubscriptions).toBe(5);
      // Should only call subscribe for 5 free-tier feeds (f1-f5 are free, f6-f9 are starter+)
      const subscribeCalls = mockClients.ingestionClient.post.mock.calls
        .filter((c: any) => (c[0] as string).includes('/catalog/'));
      expect(subscribeCalls).toHaveLength(5);
    });

    it('starter tier subscribes to up to 10 global feeds', async () => {
      const result = await seeder.seedTenant('t1', 'starter');
      expect(result.globalSubscriptions).toBe(9); // 5 free + 4 starter, f10 is enterprise, f11 disabled
    });

    it('teams tier subscribes to all eligible global feeds', async () => {
      const result = await seeder.seedTenant('t1', 'teams');
      // All enabled feeds where tier <= teams: f1-f9 (9 feeds, f10=enterprise excluded, f11=disabled)
      expect(result.globalSubscriptions).toBe(9);
    });

    it('enterprise tier subscribes to all feeds including enterprise', async () => {
      const result = await seeder.seedTenant('t1', 'enterprise');
      // f1-f10 all eligible (f11 disabled)
      expect(result.globalSubscriptions).toBe(10);
    });

    it('failed catalog fetch records error and returns 0 subscriptions', async () => {
      mockClients.ingestionClient.get.mockResolvedValueOnce(null);
      const result = await seeder.seedTenant('t1', 'free');
      expect(result.globalSubscriptions).toBe(0);
      expect(result.errors).toContain('Failed to fetch global feed catalog');
    });
  });

  describe('seedTenant — private feeds', () => {
    it('creates 2 private starter feeds', async () => {
      const result = await seeder.seedTenant('t1', 'free');
      expect(result.privateFeeds).toBe(2);
      const feedCalls = mockClients.ingestionClient.post.mock.calls
        .filter((c: any) => c[0] === '/api/v1/feeds');
      expect(feedCalls).toHaveLength(2);
      expect(feedCalls[0][1]).toMatchObject({ name: 'My RSS Feed - The Hacker News', feedType: 'rss' });
      expect(feedCalls[1][1]).toMatchObject({ name: 'My RSS Feed - BleepingComputer', feedType: 'rss' });
    });

    it('triggers initial fetch for each private feed', async () => {
      const result = await seeder.seedTenant('t1', 'free');
      expect(result.fetchesTriggered).toBe(2);
      const triggerCalls = mockClients.ingestionClient.post.mock.calls
        .filter((c: any) => (c[0] as string).includes('/trigger'));
      expect(triggerCalls).toHaveLength(2);
    });
  });

  describe('seedTenant — sample IOCs', () => {
    it('creates 5 sample IOCs when no global IOCs exist', async () => {
      mockClients.iocClient.get.mockResolvedValueOnce({ data: [], total: 0 });
      const result = await seeder.seedTenant('t1', 'free');
      expect(result.sampleIocs).toBe(5);
      expect(mockClients.iocClient.post).toHaveBeenCalledTimes(5);
    });

    it('skips IOC seeding when global IOCs already present', async () => {
      mockClients.iocClient.get.mockResolvedValueOnce({ data: [{ id: 'existing' }], total: 100 });
      const result = await seeder.seedTenant('t1', 'free');
      expect(result.sampleIocs).toBe(0);
      expect(mockClients.iocClient.post).not.toHaveBeenCalled();
    });
  });

  describe('seedTenant — sample actors and malware', () => {
    it('creates 3 sample actors', async () => {
      const result = await seeder.seedTenant('t1', 'free');
      expect(result.sampleActors).toBe(3);
      expect(mockClients.actorClient.post).toHaveBeenCalledTimes(3);
    });

    it('creates 3 sample malware entries', async () => {
      const result = await seeder.seedTenant('t1', 'free');
      expect(result.sampleMalware).toBe(3);
      expect(mockClients.malwareClient.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('seedTenant — headers', () => {
    it('all HTTP calls include x-tenant-id header', async () => {
      await seeder.seedTenant('tenant-abc', 'free');
      // Check catalog GET
      expect(mockClients.ingestionClient.get).toHaveBeenCalledWith(
        '/api/v1/catalog', { 'x-tenant-id': 'tenant-abc' },
      );
      // Check IOC GET
      expect(mockClients.iocClient.get).toHaveBeenCalledWith(
        '/api/v1/iocs?limit=1', { 'x-tenant-id': 'tenant-abc' },
      );
      // Check actor POST
      expect(mockClients.actorClient.post).toHaveBeenCalledWith(
        '/api/v1/actors',
        expect.objectContaining({ name: 'APT29' }),
        { 'x-tenant-id': 'tenant-abc' },
      );
    });
  });

  describe('seedTenant — partial failure', () => {
    it('captures errors from individual failures without throwing', async () => {
      // Make some actor calls fail
      mockClients.actorClient.post
        .mockResolvedValueOnce({ data: { id: 'a1' } })
        .mockResolvedValueOnce(null) // fails
        .mockResolvedValueOnce({ data: { id: 'a3' } });
      const result = await seeder.seedTenant('t1', 'free');
      expect(result.sampleActors).toBe(2);
      expect(result.errors).toContain('Failed to seed actor: Lazarus Group');
      // Other seeding still completed
      expect(result.privateFeeds).toBe(2);
    });

    it('returns combined SeedResult with all counts', async () => {
      const result = await seeder.seedTenant('t1', 'starter');
      expect(result.seederUsed).toBe('real');
      expect(typeof result.globalSubscriptions).toBe('number');
      expect(typeof result.privateFeeds).toBe('number');
      expect(typeof result.fetchesTriggered).toBe('number');
      expect(typeof result.sampleIocs).toBe('number');
      expect(typeof result.sampleActors).toBe('number');
      expect(typeof result.sampleMalware).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('seedTenant — no clients', () => {
    it('returns error when no clients configured', async () => {
      const bare = new RealSeeder();
      const result = await bare.seedTenant('t1', 'free');
      expect(result.errors).toContain('No service clients configured');
      expect(result.globalSubscriptions).toBe(0);
    });
  });
});
