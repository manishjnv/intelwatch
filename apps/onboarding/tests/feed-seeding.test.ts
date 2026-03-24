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

  it('seeds 4 default OSINT feeds via ingestion service', async () => {
    const result = await seeder.seed('tenant-1', ['feeds']);
    expect(result.seeded).toBe(true);
    expect(result.counts.feeds).toBe(4);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    expect(post).toHaveBeenCalledTimes(4);
  });

  it('sends correct payload to ingestion service', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;

    // Check first call — AlienVault OTX
    expect(post).toHaveBeenCalledWith(
      '/api/v1/feeds',
      expect.objectContaining({
        tenantId: 'tenant-1',
        name: 'AlienVault OTX',
        url: 'https://otx.alienvault.com/api/v1/pulses/subscribed',
        type: 'json',
        schedule: '*/30 * * * *',
        enabled: true,
        tags: ['DEMO'],
      }),
    );
  });

  it('seeds all 4 feeds: OTX, URLhaus, CISA KEV, Feodo', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    const names = post.mock.calls.map((c: unknown[]) => (c[1] as { name: string }).name);
    expect(names).toEqual([
      'AlienVault OTX',
      'Abuse.ch URLhaus',
      'CISA KEV',
      'Feodo Tracker',
    ]);
  });

  it('includes feeds in default seed (all categories)', async () => {
    const result = await seeder.seed('tenant-1');
    expect(result.counts.feeds).toBe(4);
    expect(result.counts.iocs).toBe(10);
    expect(result.counts.actors).toBe(5);
  });

  it('counts partial failures for feeds', async () => {
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    post
      .mockResolvedValueOnce({ data: { id: '1' } })
      .mockResolvedValueOnce(null) // failure
      .mockResolvedValueOnce({ data: { id: '3' } })
      .mockResolvedValueOnce({ data: { id: '4' } });

    const result = await seeder.seed('tenant-1', ['feeds']);
    expect(result.counts.feeds).toBe(3); // 4 - 1 failure
  });

  it('falls back to static count without clients', async () => {
    const noClients = new DemoSeeder();
    const result = await noClients.seed('tenant-1', ['feeds']);
    expect(result.counts.feeds).toBe(4);
  });

  it('getAvailableDemoData includes feeds count', () => {
    const data = seeder.getAvailableDemoData();
    expect(data.feeds).toBe(4);
    expect(data.iocs).toBe(10);
  });

  it('feed seeding is idempotent per tenant', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    const result2 = await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    // Only called 4 times total (first seed), not 8
    expect(post).toHaveBeenCalledTimes(4);
    expect(result2.counts.feeds).toBe(4);
  });

  it('clearDemoData resets feed seeding', async () => {
    await seeder.seed('tenant-1', ['feeds']);
    seeder.clearDemoData('tenant-1');
    expect(seeder.isSeeded('tenant-1')).toBe(false);

    // Re-seed should call API again
    await seeder.seed('tenant-1', ['feeds']);
    const post = (clients.ingestionClient as unknown as { post: ReturnType<typeof vi.fn> }).post;
    expect(post).toHaveBeenCalledTimes(8); // 4 + 4
  });
});
