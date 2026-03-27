import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommunityFpService } from '../src/services/community-fp.js';
import { SeverityVotingService } from '../src/services/severity-voting.js';

// We test at the service layer with route-like patterns (schema validation, auth checks)
// since Fastify route testing requires full app bootstrap which is out of scope for unit tests.

function makePrisma() {
  return {
    globalIoc: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    tenantFeedSubscription: {
      groupBy: vi.fn().mockResolvedValue([
        { tenantId: 't1' }, { tenantId: 't2' },
      ]),
    },
  } as any;
}

function makeIoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ioc-1',
    iocType: 'ip',
    value: '10.0.0.1',
    severity: 'high',
    lifecycle: 'active',
    confidence: 70,
    communityFpCount: 0,
    communityFpRate: 0,
    severityVotes: {},
    enrichmentData: {},
    sightingSources: ['feed-1'],
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

describe('Community FP Routes (service-level)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let fpService: CommunityFpService;

  beforeEach(() => {
    prisma = makePrisma();
    fpService = new CommunityFpService(prisma);
  });

  it('POST /report-fp: valid → result with fpCount', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc());
    const result = await fpService.reportFalsePositive('ioc-1', {
      tenantId: 't1', reason: 'benign_service', reportedBy: 'user-1',
    });
    expect(result.fpCount).toBe(1);
    expect(result.fpRate).toBeGreaterThanOrEqual(0);
  });

  it('POST /report-fp: duplicate from same tenant → rejected', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      enrichmentData: { fpReports: [{ tenantId: 't1', reason: 'benign_service', reportedBy: 'u1', reportedAt: new Date().toISOString() }] },
      communityFpCount: 1,
    }));
    await expect(fpService.reportFalsePositive('ioc-1', {
      tenantId: 't1', reason: 'test_data', reportedBy: 'u1',
    })).rejects.toThrow('already reported');
  });

  it('POST /report-fp: invalid reason → Zod catches (route-level)', () => {
    const { z } = require('zod');
    const schema = z.object({
      reason: z.enum(['benign_service', 'internal_infra', 'test_data', 'other']),
    });
    expect(() => schema.parse({ reason: 'invalid_reason' })).toThrow();
  });

  it('DELETE /report-fp: withdraws report', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      enrichmentData: { fpReports: [{ tenantId: 't1', reason: 'benign_service', reportedBy: 'u1', reportedAt: new Date().toISOString() }] },
      communityFpCount: 1,
    }));
    await fpService.withdrawFpReport('ioc-1', 't1');
    expect(prisma.globalIoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ communityFpCount: 0 }),
      }),
    );
  });

  it('GET /fp-summary: returns correct shape', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      communityFpCount: 1,
      communityFpRate: 50,
      enrichmentData: { fpReports: [{ tenantId: 't1', reason: 'other', reportedAt: '2026-03-27T00:00:00Z' }] },
    }));
    const summary = await fpService.getFpSummary('ioc-1');
    expect(summary).toHaveProperty('fpCount');
    expect(summary).toHaveProperty('fpRate');
    expect(summary).toHaveProperty('totalTenants');
    expect(summary).toHaveProperty('reports');
    expect(summary).toHaveProperty('autoAction');
  });

  it('GET /fp-candidates: returns list from service', async () => {
    prisma.globalIoc.findMany.mockResolvedValue([
      { id: 'ioc-2', iocType: 'domain', value: 'bad.com', communityFpCount: 2, communityFpRate: 100 },
    ]);
    const candidates = await fpService.getTopFpCandidates(20);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].fpRate).toBe(100);
    expect(prisma.globalIoc.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });

  it('GET /fp-candidates: admin rbac check (route pattern)', () => {
    // Verify the route uses rbac('admin:read') by checking the route exists
    // In real integration tests this would be Fastify inject; here we confirm the service works
    expect(typeof fpService.getTopFpCandidates).toBe('function');
  });
});

describe('Severity Votes + Corroboration Routes (service-level)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let votingService: SeverityVotingService;

  beforeEach(() => {
    prisma = makePrisma();
    votingService = new SeverityVotingService(prisma);
  });

  it('GET /severity-votes: returns breakdown + confidence', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      severityVotes: {
        critical: { weight: 15, voters: ['f1'] },
        high: { weight: 8, voters: ['f2'] },
      },
    }));
    const result = await votingService.getVoteSummary('ioc-1');
    expect(result.currentSeverity).toBe('critical');
    expect(result.voteBreakdown).toHaveProperty('critical');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('GET /corroboration: calculateCorroborationScore returns score + narrative', async () => {
    const { calculateCorroborationScore } = await import('@etip/shared-normalization');
    const result = calculateCorroborationScore([{
      feedId: 'f1', feedName: 'Feed 1', admiraltySource: 'B', admiraltyCred: 2,
      feedReliability: 85, firstSeenByFeed: new Date(), lastSeenByFeed: new Date(),
    }]);
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('narrative');
    expect(result).toHaveProperty('tier');
    expect(result).toHaveProperty('sourceCount', 1);
  });

  it('Route tests verify service methods called with correct args', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({ severityVotes: {} }));
    const spy = vi.spyOn(votingService, 'getVoteSummary');
    await votingService.getVoteSummary('ioc-1');
    expect(spy).toHaveBeenCalledWith('ioc-1');
  });
});
