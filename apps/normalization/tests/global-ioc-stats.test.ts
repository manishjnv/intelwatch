import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalIocStatsService } from '../src/services/global-ioc-stats.js';

function mockPrisma(iocs: any[] = []) {
  return {
    globalIoc: {
      findMany: vi.fn().mockResolvedValue(iocs),
      count: vi.fn().mockResolvedValue(0),
    },
  } as any;
}

const sampleIocs = [
  { id: '1', iocType: 'ip', severity: 'critical', lifecycle: 'active', stixConfidenceTier: 'High', confidence: 90, enrichmentQuality: 80, warninglistMatch: null, normalizedValue: '1.2.3.4', crossFeedCorroboration: 3, sightingSources: ['f1', 'f2', 'f3'] },
  { id: '2', iocType: 'ip', severity: 'high', lifecycle: 'active', stixConfidenceTier: 'High', confidence: 75, enrichmentQuality: 60, warninglistMatch: null, normalizedValue: '5.6.7.8', crossFeedCorroboration: 2, sightingSources: ['f1', 'f2'] },
  { id: '3', iocType: 'domain', severity: 'medium', lifecycle: 'new', stixConfidenceTier: 'Med', confidence: 55, enrichmentQuality: 0, warninglistMatch: null, normalizedValue: 'evil.com', crossFeedCorroboration: 1, sightingSources: ['f1'] },
  { id: '4', iocType: 'ip', severity: 'info', lifecycle: 'aging', stixConfidenceTier: 'Low', confidence: 20, enrichmentQuality: 0, warninglistMatch: 'IANA Reserved', normalizedValue: '192.168.1.1', crossFeedCorroboration: 1, sightingSources: ['f1'] },
  { id: '5', iocType: 'cve', severity: 'critical', lifecycle: 'active', stixConfidenceTier: 'High', confidence: 95, enrichmentQuality: 90, warninglistMatch: null, normalizedValue: 'CVE-2024-1234', crossFeedCorroboration: 4, sightingSources: ['f1', 'f2', 'f3', 'f4'] },
];

describe('GlobalIocStatsService', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let service: GlobalIocStatsService;

  beforeEach(() => {
    prisma = mockPrisma(sampleIocs);
    prisma.globalIoc.count.mockResolvedValue(2);
    service = new GlobalIocStatsService(prisma);
  });

  it('getGlobalStats: returns correct shape with all fields', async () => {
    const stats = await service.getGlobalStats();
    expect(stats).toHaveProperty('totalIocs');
    expect(stats).toHaveProperty('byType');
    expect(stats).toHaveProperty('bySeverity');
    expect(stats).toHaveProperty('byLifecycle');
    expect(stats).toHaveProperty('byStixTier');
    expect(stats).toHaveProperty('warninglistFiltered');
    expect(stats).toHaveProperty('avgConfidence');
    expect(stats).toHaveProperty('avgEnrichmentQuality');
    expect(stats).toHaveProperty('last24h');
    expect(stats.totalIocs).toBe(5);
  });

  it('getGlobalStats: byType counts correct', async () => {
    const stats = await service.getGlobalStats();
    expect(stats.byType['ip']).toBe(3);
    expect(stats.byType['domain']).toBe(1);
    expect(stats.byType['cve']).toBe(1);
  });

  it('getGlobalStats: excludes warninglist-matched from avgConfidence', async () => {
    const stats = await service.getGlobalStats();
    // Non-warninglist IOCs: 90, 75, 55, 95 → avg = 315/4 = 79 (rounded)
    expect(stats.avgConfidence).toBe(79);
    expect(stats.warninglistFiltered).toBe(1);
  });

  it('getTopIocs: ordered by confidence DESC', async () => {
    prisma.globalIoc.findMany.mockResolvedValue([
      { ...sampleIocs[4], confidence: 95 },
      { ...sampleIocs[0], confidence: 90 },
    ]);
    const top = await service.getTopIocs(2);
    expect(top).toHaveLength(2);
    expect(prisma.globalIoc.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { warninglistMatch: null },
        orderBy: [{ confidence: 'desc' }, { crossFeedCorroboration: 'desc' }],
        take: 2,
      }),
    );
  });

  it('getCorroborationLeaders: ordered by crossFeedCorroboration DESC', async () => {
    prisma.globalIoc.findMany.mockResolvedValue([
      sampleIocs[4], // corroboration 4
      sampleIocs[0], // corroboration 3
    ]);
    const leaders = await service.getCorroborationLeaders(2);
    expect(leaders).toHaveLength(2);
    expect(leaders[0].sightingCount).toBe(4);
    expect(leaders[0].feedSources).toEqual(['f1', 'f2', 'f3', 'f4']);
    expect(leaders[1].sightingCount).toBe(3);
  });
});
