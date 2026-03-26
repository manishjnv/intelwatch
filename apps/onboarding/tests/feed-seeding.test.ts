import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DemoSeeder, type DemoSeederDeps } from '../src/services/demo-seeder.js';

vi.mock('../src/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function createMockClient() {
  return { post: vi.fn().mockResolvedValue({ data: { id: 'created-1' } }) };
}

function createMockClients(): DemoSeederDeps {
  return {
    iocClient: createMockClient() as unknown as DemoSeederDeps['iocClient'],
    actorClient: createMockClient() as unknown as DemoSeederDeps['actorClient'],
    malwareClient: createMockClient() as unknown as DemoSeederDeps['malwareClient'],
    vulnClient: createMockClient() as unknown as DemoSeederDeps['vulnClient'],
    ingestionClient: createMockClient() as unknown as DemoSeederDeps['ingestionClient'],
  };
}

describe('DemoSeeder — Feed Seeding (B2)', () => {
  let seeder: DemoSeeder;
  let clients: DemoSeederDeps;

  beforeEach(() => {
    seeder = new DemoSeeder();
    clients = createMockClients();
    seeder.setClients(clients);
  });

  it('seeds 3 free-tier default feeds via ingestion service', async () => {
    const result = await seeder.seed('tenant-1', ['feeds']);
    expect(result.seeded).toBe(true);
    expect(result.counts.feeds).toBe(3);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('sends correct payload with feedType to ingestion service', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;

    // Check first call — CISA Advisories RSS (first free-tier feed)
    expect(post).toHaveBeenCalledWith(
      '/api/v1/feeds',
      expect.objectContaining({
        tenantId: 'tenant-1',
        name: 'CISA Advisories RSS',
        feedType: 'rss',
        enabled: true,
        tags: ['DEMO'],
      }),
    );
  });

  it('seeds only free-tier feeds (3 feeds)', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    const names = post.mock.calls.map((c: unknown[]) => (c[1] as { name: string }).name);
    expect(names).toEqual([
      'CISA Advisories RSS',
      'The Hacker News',
      'NVD Recent CVEs',
    ]);
  });

  it('includes feeds in default seed (all categories)', async () => {
    const result = await seeder.seed('tenant-1');
    expect(result.counts.feeds).toBe(3); // free-tier default
    expect(result.counts.iocs).toBe(10);
    expect(result.counts.actors).toBe(5);
  });

  it('counts partial failures for feeds', async () => {
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    // First 2 succeed, last fails
    post.mockResolvedValueOnce({ data: { id: '0' } });
    post.mockResolvedValueOnce({ data: { id: '1' } });
    post.mockResolvedValueOnce(null);

    const result = await seeder.seed('tenant-1', ['feeds']);
    expect(result.counts.feeds).toBe(2);
  });

  it('falls back to free-tier static count without clients', async () => {
    const noClients = new DemoSeeder();
    const result = await noClients.seed('tenant-1', ['feeds']);
    expect(result.counts.feeds).toBe(3); // free-tier count
  });

  it('getAvailableDemoData includes total feeds and free-tier count', () => {
    const data = seeder.getAvailableDemoData();
    expect(data.feeds).toBe(10); // total available
    expect(data.feedsFreeTier).toBe(3); // free tier subset
    expect(data.iocs).toBe(10);
  });

  it('feed seeding is idempotent per tenant', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    const result2 = await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    // Only called 3 times total (first seed), not 6
    expect(post).toHaveBeenCalledTimes(3);
    expect(result2.counts.feeds).toBe(3);
  });

  it('clearDemoData resets feed seeding', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    seeder.clearDemoData('tenant-1');
    expect(seeder.isSeeded('tenant-1')).toBe(false);

    // Re-seed should call API again
    await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    expect(post).toHaveBeenCalledTimes(6); // 3 + 3
  });

  it('seedUpgradeFeeds seeds only non-free-tier feeds (7 feeds)', async () => {
    const upgradeCount = await seeder.seedUpgradeFeeds('tenant-1');
    expect(upgradeCount).toBe(7);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    expect(post).toHaveBeenCalledTimes(7);
  });

  it('getFreeTierFeedCount returns 3', () => {
    expect(DemoSeeder.getFreeTierFeedCount()).toBe(3);
  });
});
