import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunityFpService } from '../src/services/community-fp.js';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    globalIoc: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    tenantFeedSubscription: {
      groupBy: vi.fn().mockResolvedValue([
        { tenantId: 't1' }, { tenantId: 't2' }, { tenantId: 't3' }, { tenantId: 't4' },
      ]),
    },
    ...overrides,
  } as any;
}

function makeIoc(fpReports: unknown[] = [], fpCount = 0, extra: Record<string, unknown> = {}) {
  return {
    id: 'ioc-1',
    iocType: 'ip',
    value: '1.2.3.4',
    severity: 'high',
    lifecycle: 'active',
    confidence: 80,
    communityFpCount: fpCount,
    communityFpRate: 0,
    enrichmentData: { fpReports },
    ...extra,
  };
}

describe('CommunityFpService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CommunityFpService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CommunityFpService(prisma);
  });

  it('reportFalsePositive: increments communityFpCount', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc());
    const result = await service.reportFalsePositive('ioc-1', {
      tenantId: 't1', reason: 'benign_service', reportedBy: 'user1',
    });
    expect(result.fpCount).toBe(1);
    expect(prisma.globalIoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ communityFpCount: 1 }),
      }),
    );
  });

  it('reportFalsePositive: calculates fpRate correctly', async () => {
    // 4 tenants total, 1 report → 25%
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc());
    const result = await service.reportFalsePositive('ioc-1', {
      tenantId: 't1', reason: 'internal_infra', reportedBy: 'user1',
    });
    expect(result.fpRate).toBe(25); // 1/4 * 100
  });

  it('reportFalsePositive: duplicate from same tenant → rejected 409', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc([
      { tenantId: 't1', reason: 'benign_service', reportedBy: 'user1', reportedAt: new Date().toISOString() },
    ], 1));
    await expect(service.reportFalsePositive('ioc-1', {
      tenantId: 't1', reason: 'test_data', reportedBy: 'user1',
    })).rejects.toThrow('already reported');
  });

  it('reportFalsePositive: fpRate > 50% → auto-downgrades severity', async () => {
    // 4 tenants, 1 already reported + 1 new = 2/4 = 50% → NOT above 50%, need 3/4
    // Use 3 tenants: 1 reported + 1 new = 2/3 = 67% → > 50% but not > 75%
    prisma.tenantFeedSubscription.groupBy.mockResolvedValue([
      { tenantId: 't1' }, { tenantId: 't2' }, { tenantId: 't3' },
    ]);
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc([
      { tenantId: 't1', reason: 'benign_service', reportedBy: 'u1', reportedAt: new Date().toISOString() },
    ], 1));
    const result = await service.reportFalsePositive('ioc-1', {
      tenantId: 't2', reason: 'benign_service', reportedBy: 'u2',
    });
    // 2/3 = 67% → > 50% → downgraded (but not > 75%)
    expect(result.autoAction).toBe('downgraded');
    expect(prisma.globalIoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'info' }),
      }),
    );
  });

  it('reportFalsePositive: fpRate > 75% → marks lifecycle false_positive', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc([
      { tenantId: 't1', reason: 'test_data', reportedBy: 'u1', reportedAt: new Date().toISOString() },
      { tenantId: 't2', reason: 'test_data', reportedBy: 'u2', reportedAt: new Date().toISOString() },
    ], 2));
    const result = await service.reportFalsePositive('ioc-1', {
      tenantId: 't3', reason: 'test_data', reportedBy: 'u3',
    });
    expect(result.fpRate).toBe(75);
    expect(prisma.globalIoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lifecycle: 'false_positive' }),
      }),
    );
  });

  it('reportFalsePositive: confidence reduced (-5 per report, cap -30)', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc([], 0, { confidence: 80 }));
    await service.reportFalsePositive('ioc-1', {
      tenantId: 't1', reason: 'other', reportedBy: 'u1',
    });
    // 1 report → confidence = 80 - 5 = 75
    expect(prisma.globalIoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ confidence: 75 }),
      }),
    );
  });

  it('withdrawFpReport: decrements count and recalculates rate', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc([
      { tenantId: 't1', reason: 'benign_service', reportedBy: 'u1', reportedAt: new Date().toISOString() },
      { tenantId: 't2', reason: 'benign_service', reportedBy: 'u2', reportedAt: new Date().toISOString() },
    ], 2));
    await service.withdrawFpReport('ioc-1', 't1');
    expect(prisma.globalIoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          communityFpCount: 1,
          communityFpRate: 25, // 1/4 * 100
        }),
      }),
    );
  });

  it('getFpSummary: returns correct counts and reports', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc([
      { tenantId: 't1', reason: 'benign_service', reportedBy: 'u1', reportedAt: '2026-03-01T00:00:00Z' },
    ], 1, { communityFpRate: 25 }));
    const summary = await service.getFpSummary('ioc-1');
    expect(summary.fpCount).toBe(1);
    expect(summary.totalTenants).toBe(4);
    expect(summary.reports).toHaveLength(1);
    expect(summary.reports[0].tenantId).toBe('t1');
  });

  it('getTopFpCandidates: ordered by fpRate DESC', async () => {
    prisma.globalIoc.findMany.mockResolvedValue([
      { id: 'ioc-2', iocType: 'domain', value: 'example.com', communityFpCount: 3, communityFpRate: 75 },
      { id: 'ioc-1', iocType: 'ip', value: '1.2.3.4', communityFpCount: 1, communityFpRate: 25 },
    ]);
    const candidates = await service.getTopFpCandidates(10);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].fpRate).toBe(75);
    expect(candidates[1].fpRate).toBe(25);
  });

  it('getTopFpCandidates: excludes already-marked FPs', async () => {
    prisma.globalIoc.findMany.mockResolvedValue([]);
    await service.getTopFpCandidates(10);
    expect(prisma.globalIoc.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          lifecycle: { not: 'false_positive' },
        }),
      }),
    );
  });
});
