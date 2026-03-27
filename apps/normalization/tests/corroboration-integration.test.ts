import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractIocsFromText } from '../src/workers/global-normalize-worker.js';
import { SeverityVotingService, calculateVoteWeight } from '../src/services/severity-voting.js';
import { calculateCorroborationScore } from '../../../packages/shared-normalization/src/corroboration.js';
import { calculateBayesianConfidence } from '../../../packages/shared-normalization/src/bayesian-confidence.js';
import { calculateVelocityScore } from '../../../packages/shared-normalization/src/velocity-score.js';

function makePrisma() {
  return {
    globalIoc: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('GlobalNormalizeWorker — Corroboration Integration', () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
  });

  it('new IOC → corroboration score computed (single source)', () => {
    const iocs = extractIocsFromText('Malicious IP 192.168.100.50 detected');
    expect(iocs.length).toBeGreaterThan(0);

    // Single source corroboration
    const result = calculateCorroborationScore([{
      feedId: 'f1', feedName: 'Feed 1', admiraltySource: 'C', admiraltyCred: 3,
      feedReliability: 70, firstSeenByFeed: new Date(), lastSeenByFeed: new Date(),
    }]);
    expect(result.sourceCount).toBe(1);
    expect(result.score).toBeGreaterThan(0);
  });

  it('existing IOC from 2nd feed → corroboration increases', () => {
    const singleResult = calculateCorroborationScore([{
      feedId: 'f1', feedName: 'F1', admiraltySource: 'B', admiraltyCred: 2,
      feedReliability: 85, firstSeenByFeed: new Date(), lastSeenByFeed: new Date(),
    }]);

    const dualResult = calculateCorroborationScore([
      { feedId: 'f1', feedName: 'F1', admiraltySource: 'B', admiraltyCred: 2,
        feedReliability: 85, firstSeenByFeed: new Date(), lastSeenByFeed: new Date() },
      { feedId: 'f2', feedName: 'F2', admiraltySource: 'A', admiraltyCred: 1,
        feedReliability: 90, firstSeenByFeed: new Date(), lastSeenByFeed: new Date() },
    ]);

    expect(dualResult.score).toBeGreaterThan(singleResult.score);
    expect(dualResult.sourceCount).toBe(2);
  });

  it('severity vote cast with feed Admiralty Code', () => {
    expect(calculateVoteWeight('A', 1)).toBe(15);
    expect(calculateVoteWeight('B', 2)).toBe(12);
    expect(calculateVoteWeight('C', 3)).toBe(9);
    expect(calculateVoteWeight('F', 6)).toBe(0);
  });

  it('corroboration score fed into Bayesian confidence', () => {
    const lowCorrob = calculateBayesianConfidence({
      feedReliability: 50, corroboration: 10, aiScore: 50, daysSinceLastSeen: 0, iocType: 'ip',
    });
    const highCorrob = calculateBayesianConfidence({
      feedReliability: 50, corroboration: 90, aiScore: 50, daysSinceLastSeen: 0, iocType: 'ip',
    });
    expect(highCorrob.score).toBeGreaterThan(lowCorrob.score);
  });

  it('high corroboration → higher confidence than low corroboration', () => {
    const now = new Date();
    const lowResult = calculateCorroborationScore([
      { feedId: 'f1', feedName: 'F1', admiraltySource: 'D', admiraltyCred: 4,
        feedReliability: 30, firstSeenByFeed: now, lastSeenByFeed: now },
    ]);
    const highResult = calculateCorroborationScore([
      { feedId: 'f1', feedName: 'F1', admiraltySource: 'A', admiraltyCred: 1,
        feedReliability: 95, firstSeenByFeed: now, lastSeenByFeed: now },
      { feedId: 'f2', feedName: 'F2', admiraltySource: 'B', admiraltyCred: 2,
        feedReliability: 90, firstSeenByFeed: now, lastSeenByFeed: now },
      { feedId: 'f3', feedName: 'F3', admiraltySource: 'C', admiraltyCred: 3,
        feedReliability: 85, firstSeenByFeed: now, lastSeenByFeed: now },
    ]);
    expect(highResult.score).toBeGreaterThan(lowResult.score);
  });

  it('velocity score updated on sighting', () => {
    const now = new Date();
    const timestamps = Array.from({ length: 5 }, (_, i) => new Date(now.getTime() - i * 3600_000));
    const result = calculateVelocityScore({
      timestamps,
      feedSources: ['f1', 'f2', 'f3', 'f1', 'f2'],
      windowHours: 24,
    });
    expect(result.velocityScore).toBeGreaterThan(0);
    expect(result.sightingsInWindow).toBe(5);
  });

  it('A-source vote changes severity from D-source default', async () => {
    const svc = new SeverityVotingService(prisma);
    prisma.globalIoc.findUnique.mockResolvedValue({
      id: 'ioc-1',
      severityVotes: { low: { weight: 4, voters: ['f1'] } },
    });
    const result = await svc.castVote('ioc-1', {
      feedId: 'f2', severity: 'critical', admiraltySource: 'A', admiraltyCred: 1,
    });
    expect(result.currentSeverity).toBe('critical');
    expect(result.margin).toBeGreaterThan(0);
  });

  it('consensus severity updates GlobalIoc.severity', async () => {
    const svc = new SeverityVotingService(prisma);
    prisma.globalIoc.findUnique.mockResolvedValue({
      id: 'ioc-1',
      severityVotes: {},
    });
    await svc.castVote('ioc-1', {
      feedId: 'f1', severity: 'high', admiraltySource: 'B', admiraltyCred: 2,
    });
    expect(prisma.globalIoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'high' }),
      }),
    );
  });
});
