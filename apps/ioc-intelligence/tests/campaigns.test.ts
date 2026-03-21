import { describe, it, expect, vi } from 'vitest';
import { CampaignDetector } from '../src/campaigns.js';

function mockPrisma(iocs: unknown[]) {
  return {
    ioc: {
      findMany: vi.fn().mockResolvedValue(iocs),
    },
  };
}

const now = new Date('2026-03-21');

function makeIoc(overrides: Record<string, unknown> = {}) {
  return {
    id: `ioc-${Math.random().toString(36).slice(2, 8)}`,
    iocType: 'ip', normalizedValue: '1.2.3.4', confidence: 75,
    severity: 'medium', feedSourceId: 'feed-1',
    threatActors: [] as string[], malwareFamilies: [] as string[],
    firstSeen: now, lastSeen: now,
    ...overrides,
  };
}

describe('C3: Campaign Co-occurrence Detection', () => {
  it('detects campaign cluster from shared threat actor across 2+ feeds', async () => {
    const iocs = [
      makeIoc({ id: 'a', feedSourceId: 'feed-1', threatActors: ['APT28'] }),
      makeIoc({ id: 'b', feedSourceId: 'feed-2', threatActors: ['APT28'] }),
      makeIoc({ id: 'c', feedSourceId: 'feed-3', threatActors: ['APT28'] }),
    ];
    const prisma = mockPrisma(iocs);
    const detector = new CampaignDetector(prisma as never);
    const result = await detector.detectCampaigns('tenant-1', 2, 20);
    expect(result).toHaveLength(1);
    expect(result[0].sharedSignal).toBe('threat_actor');
    expect(result[0].sharedValue).toBe('apt28');
    expect(result[0].feedCount).toBe(3);
    expect(result[0].iocCount).toBe(3);
  });

  it('detects campaign from shared malware family', async () => {
    const iocs = [
      makeIoc({ id: 'a', feedSourceId: 'feed-1', malwareFamilies: ['Cobalt Strike'] }),
      makeIoc({ id: 'b', feedSourceId: 'feed-2', malwareFamilies: ['Cobalt Strike'] }),
      makeIoc({ id: 'c', feedSourceId: 'feed-2', malwareFamilies: ['Cobalt Strike'] }),
    ];
    const prisma = mockPrisma(iocs);
    const detector = new CampaignDetector(prisma as never);
    const result = await detector.detectCampaigns('tenant-1', 2, 20);
    expect(result).toHaveLength(1);
    expect(result[0].sharedSignal).toBe('malware_family');
    expect(result[0].sharedValue).toBe('cobalt strike');
  });

  it('filters out clusters with fewer than minFeeds feeds', async () => {
    const iocs = [
      makeIoc({ id: 'a', feedSourceId: 'feed-1', threatActors: ['Lazarus'] }),
      makeIoc({ id: 'b', feedSourceId: 'feed-1', threatActors: ['Lazarus'] }),
      makeIoc({ id: 'c', feedSourceId: 'feed-1', threatActors: ['Lazarus'] }),
    ];
    const prisma = mockPrisma(iocs);
    const detector = new CampaignDetector(prisma as never);
    const result = await detector.detectCampaigns('tenant-1', 2, 20);
    expect(result).toHaveLength(0); // all from same feed, doesn't meet minFeeds=2
  });

  it('filters out clusters with fewer than 3 IOCs', async () => {
    const iocs = [
      makeIoc({ id: 'a', feedSourceId: 'feed-1', threatActors: ['APT29'] }),
      makeIoc({ id: 'b', feedSourceId: 'feed-2', threatActors: ['APT29'] }),
    ];
    const prisma = mockPrisma(iocs);
    const detector = new CampaignDetector(prisma as never);
    const result = await detector.detectCampaigns('tenant-1', 2, 20);
    expect(result).toHaveLength(0); // only 2 IOCs
  });

  it('returns empty array when no candidates exist', async () => {
    const prisma = mockPrisma([]);
    const detector = new CampaignDetector(prisma as never);
    const result = await detector.detectCampaigns('tenant-1');
    expect(result).toEqual([]);
  });

  it('sorts clusters by IOC count descending', async () => {
    const iocs = [
      // APT28 cluster: 4 IOCs
      makeIoc({ feedSourceId: 'f1', threatActors: ['APT28'] }),
      makeIoc({ feedSourceId: 'f2', threatActors: ['APT28'] }),
      makeIoc({ feedSourceId: 'f3', threatActors: ['APT28'] }),
      makeIoc({ feedSourceId: 'f4', threatActors: ['APT28'] }),
      // Lazarus cluster: 3 IOCs
      makeIoc({ feedSourceId: 'f1', threatActors: ['Lazarus'] }),
      makeIoc({ feedSourceId: 'f2', threatActors: ['Lazarus'] }),
      makeIoc({ feedSourceId: 'f3', threatActors: ['Lazarus'] }),
    ];
    const prisma = mockPrisma(iocs);
    const detector = new CampaignDetector(prisma as never);
    const result = await detector.detectCampaigns('tenant-1', 2, 20);
    expect(result).toHaveLength(2);
    expect(result[0].iocCount).toBeGreaterThanOrEqual(result[1].iocCount);
  });
});
