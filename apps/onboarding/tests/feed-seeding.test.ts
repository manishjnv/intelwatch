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

  it('seeds 10 default OSINT feeds via ingestion service', async () => {
    const result = await seeder.seed('tenant-1', ['feeds']);
    expect(result.seeded).toBe(true);
    expect(result.counts.feeds).toBe(10);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    expect(post).toHaveBeenCalledTimes(10);
  });

  it('sends correct payload with feedType (not type) to ingestion service', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;

    // Check first call — AlienVault OTX
    expect(post).toHaveBeenCalledWith(
      '/api/v1/feeds',
      expect.objectContaining({
        tenantId: 'tenant-1',
        name: 'AlienVault OTX',
        url: 'https://otx.alienvault.com/api/v1/pulses/subscribed',
        feedType: 'rest_api',
        schedule: '0 */2 * * *',
        parseConfig: expect.objectContaining({ responseArrayPath: 'results' }),
        enabled: true,
        tags: ['DEMO'],
      }),
    );
  });

  it('seeds all 10 feeds with correct names', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    const names = post.mock.calls.map((c: unknown[]) => (c[1] as { name: string }).name);
    expect(names).toEqual([
      'AlienVault OTX',
      'Abuse.ch URLhaus',
      'CISA KEV',
      'Feodo Tracker',
      'MalwareBazaar Recent',
      'CISA Advisories RSS',
      'The Hacker News',
      'BleepingComputer',
      'US-CERT Alerts',
      'NVD Recent CVEs',
    ]);
  });

  it('includes feeds in default seed (all categories)', async () => {
    const result = await seeder.seed('tenant-1');
    expect(result.counts.feeds).toBe(10);
    expect(result.counts.iocs).toBe(10);
    expect(result.counts.actors).toBe(5);
  });

  it('counts partial failures for feeds', async () => {
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    // First 9 succeed, last fails
    for (let i = 0; i < 9; i++) post.mockResolvedValueOnce({ data: { id: `${i}` } });
    post.mockResolvedValueOnce(null);

    const result = await seeder.seed('tenant-1', ['feeds']);
    expect(result.counts.feeds).toBe(9);
  });

  it('falls back to static count without clients', async () => {
    const noClients = new DemoSeeder();
    const result = await noClients.seed('tenant-1', ['feeds']);
    expect(result.counts.feeds).toBe(10);
  });

  it('getAvailableDemoData includes feeds count', () => {
    const data = seeder.getAvailableDemoData();
    expect(data.feeds).toBe(10);
    expect(data.iocs).toBe(10);
  });

  it('feed seeding is idempotent per tenant', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    const result2 = await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    // Only called 10 times total (first seed), not 20
    expect(post).toHaveBeenCalledTimes(10);
    expect(result2.counts.feeds).toBe(10);
  });

  it('clearDemoData resets feed seeding', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    seeder.clearDemoData('tenant-1');
    expect(seeder.isSeeded('tenant-1')).toBe(false);

    // Re-seed should call API again
    await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    expect(post).toHaveBeenCalledTimes(20); // 10 + 10
  });
});
