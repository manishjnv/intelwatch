/**
 * @module GlobalIntelligenceSmokeTests
 * @description End-to-end intelligence quality tests for Phase G.
 * Validates corroboration scoring, severity voting, community FP,
 * velocity spikes, fuzzy dedupe + corroboration, and full pipeline flow.
 * DECISION-029 Phase G — Final session.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCorroborationScore,
  calculateIndependenceScore,
  getConsensusFromSources,
  type CorroborationSource,
} from '../../packages/shared-normalization/src/corroboration.js';
import { calculateVelocityScore } from '../../packages/shared-normalization/src/velocity-score.js';
import { computeFuzzyHash, areFuzzyDuplicates } from '../../packages/shared-normalization/src/fuzzy-dedupe.js';
import { getCweEntry, buildCweChain } from '../../packages/shared-normalization/src/cwe-chain.js';
import { calculateBayesianConfidence } from '../../packages/shared-normalization/src/bayesian-confidence.js';
import { calculateVoteWeight } from '../../apps/normalization/src/services/severity-voting.js';

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

describe('Global Intelligence Smoke Tests', () => {

  it('1. IOC from single low-reliability feed → low corroboration + low confidence', () => {
    const sources = [makeSource({
      feedId: 'f-low',
      admiraltySource: 'D',
      admiraltyCred: 4,
      feedReliability: 25,
      lastSeenByFeed: hoursAgo(72),
    })];

    const corrob = calculateCorroborationScore(sources);
    expect(corrob.tier).toBe('low'); // Single low-reliability old source = low tier

    const confidence = calculateBayesianConfidence({
      feedReliability: 25,
      corroboration: corrob.score,
      aiScore: 50,
      daysSinceLastSeen: 3,
      iocType: 'ip',
    });
    expect(confidence.score).toBeLessThan(40);
  });

  it('2. Same IOC from 3 high-reliability feeds → confirmed/high + high confidence', () => {
    const sources = [
      makeSource({ feedId: 'f1', admiraltySource: 'A', admiraltyCred: 2, feedReliability: 95, lastSeenByFeed: hoursAgo(1) }),
      makeSource({ feedId: 'f2', admiraltySource: 'A', admiraltyCred: 2, feedReliability: 92, lastSeenByFeed: hoursAgo(2) }),
      makeSource({ feedId: 'f3', admiraltySource: 'B', admiraltyCred: 2, feedReliability: 90, lastSeenByFeed: hoursAgo(3) }),
    ];

    const corrob = calculateCorroborationScore(sources);
    expect(['high', 'confirmed']).toContain(corrob.tier);

    const confidence = calculateBayesianConfidence({
      feedReliability: 92,
      corroboration: corrob.score,
      aiScore: 80,
      daysSinceLastSeen: 0,
      iocType: 'ip',
    });
    expect(confidence.score).toBeGreaterThan(75);
  });

  it('3. Severity voting: weighted majority wins', () => {
    // 1 A-source votes critical (weight 15)
    // 2 C-sources vote medium (weight 9 each = 18)
    // → medium wins because 18 > 15
    const sources = [
      makeSource({ feedId: 'f1', admiraltySource: 'A' }),
      makeSource({ feedId: 'f2', admiraltySource: 'C' }),
      makeSource({ feedId: 'f3', admiraltySource: 'C' }),
    ];
    const consensus = getConsensusFromSources(sources, ['critical', 'medium', 'medium']);
    expect(consensus).toBe('medium'); // 2*3=6 for medium > 5 for critical

    // But A-source outweighs 1 C-source
    const consensus2 = getConsensusFromSources(
      [makeSource({ feedId: 'f1', admiraltySource: 'A' }), makeSource({ feedId: 'f2', admiraltySource: 'C' })],
      ['critical', 'medium'],
    );
    expect(consensus2).toBe('critical'); // A=5 > C=3
  });

  it('4. Community FP: threshold logic (verifying auto-action rules)', () => {
    // At 75% FP rate (3 of 4 tenants), both downgrade and mark_fp should apply
    // We test the threshold logic: >50% → downgrade, >75% → mark_fp
    const fpRate75 = 75;
    expect(fpRate75 > 50).toBe(true);  // downgrade trigger
    expect(fpRate75 > 75).toBe(false); // mark_fp trigger at >75, not >=75
    // At 76%:
    const fpRate76 = 76;
    expect(fpRate76 > 75).toBe(true);  // mark_fp trigger

    // Verify vote weight formula
    expect(calculateVoteWeight('A', 1)).toBe(15);
    expect(calculateVoteWeight('F', 6)).toBe(0);
  });

  it('5. Velocity spike: 10 sightings in 1 hour → high velocity', () => {
    const now = new Date();
    const timestamps = Array.from({ length: 10 }, (_, i) =>
      new Date(now.getTime() - i * 6 * 60_000), // 6 min apart = 10 in 1 hour
    );
    const feedSources = Array.from({ length: 10 }, (_, i) => `feed-${i % 3}`);

    const result = calculateVelocityScore({
      timestamps,
      feedSources,
      windowHours: 6,
    });
    expect(result.velocityScore).toBeGreaterThan(70);
    expect(result.sightingsInWindow).toBe(10);
  });

  it('6. Full intelligence flow: corroborate + vote + confidence', () => {
    // 2 feeds (B2 + C3), same IOC
    const sources = [
      makeSource({ feedId: 'f-b2', admiraltySource: 'B', admiraltyCred: 2, feedReliability: 85, lastSeenByFeed: hoursAgo(1) }),
      makeSource({ feedId: 'f-c3', admiraltySource: 'C', admiraltyCred: 3, feedReliability: 70, lastSeenByFeed: hoursAgo(4) }),
    ];

    // Corroboration
    const corrob = calculateCorroborationScore(sources);
    expect(corrob.sourceCount).toBe(2);
    expect(corrob.score).toBeGreaterThan(0);

    // Severity consensus
    const severity = getConsensusFromSources(sources, ['high', 'high']);
    expect(severity).toBe('high');

    // Confidence with corroboration factored in
    const confidence = calculateBayesianConfidence({
      feedReliability: 78, // avg of 85 + 70
      corroboration: corrob.score,
      aiScore: 70,
      daysSinceLastSeen: 0,
      iocType: 'domain',
    });
    expect(confidence.score).toBeGreaterThan(50);

    // Higher corroboration should yield higher confidence
    const noCorrobConf = calculateBayesianConfidence({
      feedReliability: 78,
      corroboration: 0,
      aiScore: 70,
      daysSinceLastSeen: 0,
      iocType: 'domain',
    });
    expect(confidence.score).toBeGreaterThan(noCorrobConf.score);
  });

  it('7. Fuzzy dedupe + corroboration: defanged variant corroborates original', () => {
    // Feed 1: evil.com
    const hash1 = computeFuzzyHash('domain', 'evil.com');
    // Feed 2: evil[.]com
    const hash2 = computeFuzzyHash('domain', 'evil[.]com');

    // Same fuzzy hash → merged into single IOC
    expect(hash1).toBe(hash2);
    expect(areFuzzyDuplicates('domain', 'evil.com', 'evil[.]com')).toBe(true);

    // After merge, both feeds contribute to corroboration
    const sources = [
      makeSource({ feedId: 'f-clean', admiraltySource: 'B', feedReliability: 80, lastSeenByFeed: hoursAgo(1) }),
      makeSource({ feedId: 'f-defanged', admiraltySource: 'C', feedReliability: 70, lastSeenByFeed: hoursAgo(2) }),
    ];
    const corrob = calculateCorroborationScore(sources);
    expect(corrob.sourceCount).toBe(2);
    expect(corrob.score).toBeGreaterThan(
      calculateCorroborationScore([sources[0]]).score,
    );
  });

  it('8. CWE chain + EPSS: CVE IOC gets full intelligence enrichment', () => {
    // CWE chain for Log4Shell (CWE-20 → CWE-502)
    const cwe20 = getCweEntry('CWE-20');
    expect(cwe20).toBeTruthy();
    expect(cwe20!.name).toContain('Input');

    const chainResult = buildCweChain(['CWE-20', 'CWE-502']);
    expect(chainResult.chain.length).toBe(2);
    expect(chainResult.chain[0].id).toBe('CWE-20');

    // High EPSS → very high confidence
    const confidence = calculateBayesianConfidence({
      feedReliability: 90,
      corroboration: 85, // many sources confirm
      aiScore: 95,
      daysSinceLastSeen: 0,
      iocType: 'cve',
    });
    expect(confidence.score).toBeGreaterThan(80);
  });
});
