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

describe('DemoSeeder — Real API Calls (B1)', () => {
  let seeder: DemoSeeder;
  let clients: DemoSeederDeps;

  beforeEach(() => {
    seeder = new DemoSeeder();
    clients = createMockClients();
    seeder.setClients(clients);
  });

  it('calls IOC service for each demo IOC', async () => {
    const result = await seeder.seed('tenant-1', ['iocs']);
    expect(result.seeded).toBe(true);
    expect(result.counts.iocs).toBe(10); // 10 demo IOCs
    expect((clients.iocClient as unknown as { post: ReturnType<typeof vi.fn> }).post).toHaveBeenCalledTimes(10);
    expect((clients.iocClient as unknown as { post: ReturnType<typeof vi.fn> }).post).toHaveBeenCalledWith(
      '/api/v1/iocs',
      expect.objectContaining({ tenantId: 'tenant-1', tags: ['DEMO'] }),
    );
  });

  it('calls actor service for each demo actor', async () => {
    const result = await seeder.seed('tenant-1', ['actors']);
    expect(result.counts.actors).toBe(5);
    expect((clients.actorClient as unknown as { post: ReturnType<typeof vi.fn> }).post).toHaveBeenCalledTimes(5);
  });

  it('calls malware service for each demo malware', async () => {
    const result = await seeder.seed('tenant-1', ['malware']);
    expect(result.counts.malware).toBe(5);
  });

  it('calls vuln service for each demo vulnerability', async () => {
    const result = await seeder.seed('tenant-1', ['vulnerabilities']);
    expect(result.counts.vulnerabilities).toBe(5);
  });

  it('seeds all categories by default', async () => {
    const result = await seeder.seed('tenant-1');
    expect(result.counts.iocs).toBe(10);
    expect(result.counts.actors).toBe(5);
    expect(result.counts.malware).toBe(5);
    expect(result.counts.vulnerabilities).toBe(5);
    expect(result.counts.feeds).toBe(10);
    expect(result.tag).toBe('DEMO');
  });

  it('is idempotent — second call returns cached result', async () => {
    await seeder.seed('tenant-1');
    const result2 = await seeder.seed('tenant-1');
    // Should not have called APIs again
    expect((clients.iocClient as unknown as { post: ReturnType<typeof vi.fn> }).post).toHaveBeenCalledTimes(10);
    expect(result2.seeded).toBe(true);
  });

  it('counts partial failures (null response = skipped)', async () => {
    (clients.iocClient as unknown as { post: ReturnType<typeof vi.fn> }).post
      .mockResolvedValueOnce({ data: { id: '1' } })
      .mockResolvedValueOnce(null) // failure
      .mockResolvedValue({ data: { id: '3' } });

    const result = await seeder.seed('tenant-1', ['iocs']);
    expect(result.counts.iocs).toBe(9); // 10 - 1 failure
  });

  it('falls back to static counts without service clients', async () => {
    const noClients = new DemoSeeder();
    // Don't call setClients
    const result = await noClients.seed('tenant-1', ['iocs']);
    expect(result.counts.iocs).toBe(10); // fallback count
  });

  it('clearDemoData allows re-seeding', async () => {
    await seeder.seed('tenant-1');
    seeder.clearDemoData('tenant-1');
    expect(seeder.isSeeded('tenant-1')).toBe(false);
  });
});
