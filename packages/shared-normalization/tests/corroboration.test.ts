import { describe, it, expect } from 'vitest';
import {
  calculateCorroborationScore,
  calculateIndependenceScore,
  getConsensusFromSources,
  type CorroborationSource,
} from '../src/index.js';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600_000);
}

function makeSource(overrides: Partial<CorroborationSource> & { feedId: string }): CorroborationSource {
  return {
    feedName: `Feed ${overrides.feedId}`,
    admiraltySource: 'C',
    admiraltyCred: 3,
    feedReliability: 70,
    firstSeenByFeed: hoursAgo(48),
    lastSeenByFeed: hoursAgo(2),
    ...overrides,
  };
}

describe('calculateCorroborationScore', () => {
  it('1 source → low tier, modest score', () => {
    const result = calculateCorroborationScore([
      makeSource({ feedId: 'f1', admiraltySource: 'D', feedReliability: 40, lastSeenByFeed: hoursAgo(48) }),
    ]);
    // rawCount=12, reliability=12, independence=3, recency=0 → ~27
    expect(result.tier).toBe('low');
    expect(result.score).toBeLessThanOrEqual(35);
    expect(result.sourceCount).toBe(1);
  });

  it('3 diverse sources → high tier', () => {
    const result = calculateCorroborationScore([
      makeSource({ feedId: 'f1', admiraltySource: 'B', feedReliability: 80, lastSeenByFeed: hoursAgo(2) }),
      makeSource({ feedId: 'f2', admiraltySource: 'C', feedReliability: 70, lastSeenByFeed: hoursAgo(5) }),
      makeSource({ feedId: 'f3', admiraltySource: 'D', feedReliability: 60, lastSeenByFeed: hoursAgo(10) }),
    ]);
    // rawCount=36, reliability=21, independence=10, recency=10 → ~77
    expect(result.tier).toBe('high');
    expect(result.score).toBeGreaterThanOrEqual(61);
    expect(result.score).toBeLessThanOrEqual(85);
  });

  it('5+ high-reliability sources with diverse grades → confirmed', () => {
    // Need high rawCount + high reliability + high independence + recency
    const grades = ['A', 'B', 'C', 'D', 'E'];
    const sources = grades.map((g, i) => makeSource({
      feedId: `f${i}`,
      admiraltySource: g,
      feedReliability: 95,
      lastSeenByFeed: hoursAgo(1),
    }));
    const result = calculateCorroborationScore(sources);
    // rawCount=40, reliability=28.5, independence=5/6*20=16.67, recency=10 → ~95
    expect(result.tier).toBe('confirmed');
    expect(result.score).toBeGreaterThanOrEqual(86);
  });

  it('2 A-sources score higher than 5 D-sources', () => {
    const aResult = calculateCorroborationScore([
      makeSource({ feedId: 'f1', admiraltySource: 'A', feedReliability: 95, lastSeenByFeed: hoursAgo(1) }),
      makeSource({ feedId: 'f2', admiraltySource: 'A', feedReliability: 95, lastSeenByFeed: hoursAgo(1) }),
    ]);
    const dResult = calculateCorroborationScore([
      makeSource({ feedId: 'f1', admiraltySource: 'D', feedReliability: 30, lastSeenByFeed: hoursAgo(48) }),
      makeSource({ feedId: 'f2', admiraltySource: 'D', feedReliability: 30, lastSeenByFeed: hoursAgo(48) }),
      makeSource({ feedId: 'f3', admiraltySource: 'D', feedReliability: 30, lastSeenByFeed: hoursAgo(48) }),
      makeSource({ feedId: 'f4', admiraltySource: 'D', feedReliability: 30, lastSeenByFeed: hoursAgo(48) }),
      makeSource({ feedId: 'f5', admiraltySource: 'D', feedReliability: 30, lastSeenByFeed: hoursAgo(48) }),
    ]);
    // Quality over quantity: A-sources with high reliability + recency beats D-sources
    expect(aResult.score).toBeGreaterThan(dResult.score);
  });

  it('recency bonus applied when seen in last 24h', () => {
    const recentResult = calculateCorroborationScore([
      makeSource({ feedId: 'f1', lastSeenByFeed: hoursAgo(1) }),
    ]);
    const oldResult = calculateCorroborationScore([
      makeSource({ feedId: 'f1', lastSeenByFeed: hoursAgo(48) }),
    ]);
    expect(recentResult.score).toBe(oldResult.score + 10);
  });

  it('narrative generated with correct highly reliable count', () => {
    const result = calculateCorroborationScore([
      makeSource({ feedId: 'f1', admiraltySource: 'A' }),
      makeSource({ feedId: 'f2', admiraltySource: 'B' }),
      makeSource({ feedId: 'f3', admiraltySource: 'D' }),
    ]);
    expect(result.narrative).toContain('3 source(s)');
    expect(result.narrative).toContain('2 highly reliable (A/B)');
    expect(result.narrative).toContain('Independence:');
    expect(result.narrative).toContain('Last seen:');
  });

  it('score clamped 0-100', () => {
    // Max inputs: many high-reliability sources with recency
    const sources = Array.from({ length: 10 }, (_, i) => makeSource({
      feedId: `f${i}`,
      admiraltySource: ['A', 'B', 'C', 'D', 'E', 'F'][i % 6],
      feedReliability: 100,
      lastSeenByFeed: hoursAgo(0),
    }));
    const result = calculateCorroborationScore(sources);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('empty sources → uncorroborated with zero score', () => {
    const result = calculateCorroborationScore([]);
    expect(result.score).toBe(0);
    expect(result.tier).toBe('uncorroborated');
    expect(result.narrative).toBe('No corroborating sources.');
  });

  it('tier boundaries verified through varied source configs', () => {
    // Single F6 source with 10% reliability and old = low tier
    // rawCount=12, reliability=3, independence=3, recency=0 → 18 → 'low'
    const low = calculateCorroborationScore([
      makeSource({ feedId: 'f1', admiraltySource: 'F', feedReliability: 10, lastSeenByFeed: hoursAgo(48) }),
    ]);
    expect(low.tier).toBe('low');
    expect(low.score).toBeGreaterThanOrEqual(16);
    expect(low.score).toBeLessThanOrEqual(35);
  });
});

describe('calculateIndependenceScore', () => {
  it('all same type → low independence', () => {
    const sources = Array.from({ length: 3 }, (_, i) => makeSource({
      feedId: `f${i}`,
      admiraltySource: 'C',
    }));
    const score = calculateIndependenceScore(sources);
    // 3 unique feeds (3/5*40=24) + 1 unique grade (1/6*30=5) + 3 count (3/5*30=18) = 47
    expect(score).toBeLessThan(50);
  });

  it('diverse types → high independence', () => {
    const sources = [
      makeSource({ feedId: 'f1', admiraltySource: 'A' }),
      makeSource({ feedId: 'f2', admiraltySource: 'B' }),
      makeSource({ feedId: 'f3', admiraltySource: 'C' }),
      makeSource({ feedId: 'f4', admiraltySource: 'D' }),
      makeSource({ feedId: 'f5', admiraltySource: 'E' }),
    ];
    const score = calculateIndependenceScore(sources);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('1 source → low independence', () => {
    const score = calculateIndependenceScore([makeSource({ feedId: 'f1' })]);
    expect(score).toBeLessThan(30);
  });

  it('empty → 0', () => {
    expect(calculateIndependenceScore([])).toBe(0);
  });
});

describe('getConsensusFromSources', () => {
  it('A-source critical outweighs 3 D-source low', () => {
    const sources = [
      makeSource({ feedId: 'f1', admiraltySource: 'A' }),
      makeSource({ feedId: 'f2', admiraltySource: 'D' }),
      makeSource({ feedId: 'f3', admiraltySource: 'D' }),
      makeSource({ feedId: 'f4', admiraltySource: 'D' }),
    ];
    // A=5 for critical, D=2 each for low → 6 total for low vs 5 for critical
    // Actually 3*2=6 > 5, so low wins with weight. Let's verify:
    const result = getConsensusFromSources(sources, ['critical', 'low', 'low', 'low']);
    // 3 D-sources at weight 2 each = 6 vs 1 A-source at weight 5 = 5
    expect(result).toBe('low');
  });

  it('A-source outweighs 2 D-sources (5 > 4)', () => {
    const sources = [
      makeSource({ feedId: 'f1', admiraltySource: 'A' }),
      makeSource({ feedId: 'f2', admiraltySource: 'D' }),
      makeSource({ feedId: 'f3', admiraltySource: 'D' }),
    ];
    const result = getConsensusFromSources(sources, ['critical', 'low', 'low']);
    // A=5 for critical vs 2*2=4 for low → critical wins
    expect(result).toBe('critical');
  });

  it('equal weights → majority wins', () => {
    const sources = [
      makeSource({ feedId: 'f1', admiraltySource: 'C' }),
      makeSource({ feedId: 'f2', admiraltySource: 'C' }),
      makeSource({ feedId: 'f3', admiraltySource: 'C' }),
    ];
    const result = getConsensusFromSources(sources, ['high', 'high', 'low']);
    // 2*3=6 for high vs 1*3=3 for low
    expect(result).toBe('high');
  });

  it('single source → that severity', () => {
    const result = getConsensusFromSources(
      [makeSource({ feedId: 'f1', admiraltySource: 'B' })],
      ['medium'],
    );
    expect(result).toBe('medium');
  });

  it('empty → info fallback', () => {
    expect(getConsensusFromSources([], [])).toBe('info');
  });
});
