import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeverityVotingService, calculateVoteWeight } from '../src/services/severity-voting.js';

function makePrisma() {
  return {
    globalIoc: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

function makeIoc(severityVotes: Record<string, { weight: number; voters: string[] }> = {}) {
  return {
    id: 'ioc-1',
    severity: 'medium',
    severityVotes,
  };
}

describe('SeverityVotingService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: SeverityVotingService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SeverityVotingService(prisma);
  });

  it('castVote: first vote → severity set to that vote', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc());
    const result = await service.castVote('ioc-1', {
      feedId: 'f1', severity: 'high', admiraltySource: 'B', admiraltyCred: 2,
    });
    expect(result.currentSeverity).toBe('high');
    expect(result.totalVotes).toBe(1);
    expect(prisma.globalIoc.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ioc-1' } }),
    );
  });

  it('castVote: A-source critical overrides previous D-source low', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      low: { weight: 4, voters: ['f2', 'f3'] }, // 2 D-sources: weight 2 each
    }));
    const result = await service.castVote('ioc-1', {
      feedId: 'f1', severity: 'critical', admiraltySource: 'A', admiraltyCred: 1,
    });
    // A1 = 15, vs low = 4 → critical wins
    expect(result.currentSeverity).toBe('critical');
  });

  it('castVote: 3 C-source high outweighs 1 A-source medium', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      medium: { weight: 15, voters: ['f1'] }, // A1 = 15
      high: { weight: 18, voters: ['f2', 'f3'] }, // 2 C3 = 9 each = 18
    }));
    const result = await service.castVote('ioc-1', {
      feedId: 'f4', severity: 'high', admiraltySource: 'C', admiraltyCred: 3,
    });
    // high = 18 + 9 = 27 vs medium = 15
    expect(result.currentSeverity).toBe('high');
  });

  it('castVote: duplicate vote from same feed → idempotent', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      high: { weight: 12, voters: ['f1'] },
    }));
    const result = await service.castVote('ioc-1', {
      feedId: 'f1', severity: 'high', admiraltySource: 'B', admiraltyCred: 2,
    });
    // Same feed, same severity → no change
    expect(result.totalVotes).toBe(1);
    expect(result.voteBreakdown.high.weight).toBe(12);
    // Idempotent: update should NOT be called again
    expect(prisma.globalIoc.update).not.toHaveBeenCalled();
  });

  it('castVote: returns correct voteBreakdown', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      critical: { weight: 15, voters: ['f1'] },
      high: { weight: 8, voters: ['f2'] },
    }));
    const result = await service.castVote('ioc-1', {
      feedId: 'f3', severity: 'high', admiraltySource: 'C', admiraltyCred: 3,
    });
    expect(result.voteBreakdown).toHaveProperty('critical');
    expect(result.voteBreakdown).toHaveProperty('high');
    expect(result.voteBreakdown.critical.voterCount).toBe(1);
    expect(result.voteBreakdown.high.voterCount).toBe(2);
  });

  it('castVote: confidence high when clear winner, low when tied', async () => {
    // Clear winner
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      critical: { weight: 30, voters: ['f1', 'f2'] },
      low: { weight: 2, voters: ['f3'] },
    }));
    const clear = await service.castVote('ioc-1', {
      feedId: 'f4', severity: 'critical', admiraltySource: 'C', admiraltyCred: 3,
    });
    expect(clear.confidence).toBeGreaterThan(70);

    // Near-tied
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      critical: { weight: 10, voters: ['f1'] },
      high: { weight: 9, voters: ['f2'] },
    }));
    const tied = await service.castVote('ioc-1', {
      feedId: 'f3', severity: 'low', admiraltySource: 'F', admiraltyCred: 6,
    });
    expect(tied.confidence).toBeLessThan(clear.confidence);
  });

  it('castVote: margin reflects gap between 1st and 2nd', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      critical: { weight: 20, voters: ['f1'] },
      high: { weight: 8, voters: ['f2'] },
    }));
    const result = await service.castVote('ioc-1', {
      feedId: 'f3', severity: 'medium', admiraltySource: 'D', admiraltyCred: 4,
    });
    expect(result.margin).toBeGreaterThan(0);
  });

  it('getVoteSummary: returns current state without modifying', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc({
      high: { weight: 12, voters: ['f1'] },
    }));
    const result = await service.getVoteSummary('ioc-1');
    expect(result.currentSeverity).toBe('high');
    expect(prisma.globalIoc.update).not.toHaveBeenCalled();
  });

  it('bulkCastVotes: processes multiple IOCs', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc());
    const result = await service.bulkCastVotes([
      { globalIocId: 'ioc-1', feedId: 'f1', severity: 'high', admiraltySource: 'A', admiraltyCred: 1 },
      { globalIocId: 'ioc-1', feedId: 'f2', severity: 'critical', admiraltySource: 'B', admiraltyCred: 2 },
    ]);
    expect(result.processed).toBe(2);
    expect(result.updated).toBe(2);
  });

  it('bulkCastVotes: groups by globalIocId correctly', async () => {
    prisma.globalIoc.findUnique.mockResolvedValue(makeIoc());
    const result = await service.bulkCastVotes([
      { globalIocId: 'ioc-1', feedId: 'f1', severity: 'high', admiraltySource: 'C', admiraltyCred: 3 },
      { globalIocId: 'ioc-2', feedId: 'f2', severity: 'low', admiraltySource: 'D', admiraltyCred: 4 },
    ]);
    expect(result.processed).toBe(2);
    expect(prisma.globalIoc.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('calculateVoteWeight', () => {
  it('A1=15, C3=9, F6=0', () => {
    expect(calculateVoteWeight('A', 1)).toBe(15);
    expect(calculateVoteWeight('C', 3)).toBe(9);
    expect(calculateVoteWeight('F', 6)).toBe(0);
  });

  it('B2=12', () => {
    expect(calculateVoteWeight('B', 2)).toBe(12);
  });
});
