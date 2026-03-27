/**
 * @module GlobalPerformanceSmokeTests
 * @description Performance regression + integration smoke tests for Phase F.
 * Validates fuzzy dedupe, caching, batch processing, velocity, CWE chains.
 * DECISION-029 Phase F.
 */

import { describe, it, expect } from 'vitest';
import {
  computeFuzzyHash,
  areFuzzyDuplicates,
  fuzzyNormalizeIocValue,
  calculateVelocityScore,
  isVelocitySpike,
  decayVelocityScore,
  getCweEntry,
  buildCweChain,
  WarninglistMatcher,
} from '@etip/shared-normalization';

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600_000);
}

describe('Global Performance Smoke Tests', () => {
  it('fuzzy dedupe correctly merges defanged variants', () => {
    // Insert: evil.com → compute hash
    const cleanHash = computeFuzzyHash('domain', 'evil.com');
    // Process: evil[.]com from different feed → same hash
    const defangedHash = computeFuzzyHash('domain', 'evil[.]com');
    expect(cleanHash).toBe(defangedHash);

    // Verify areFuzzyDuplicates confirms the merge
    expect(areFuzzyDuplicates('domain', 'evil.com', 'evil[.]com')).toBe(true);
  });

  it('velocity score spike detection works end-to-end', () => {
    // Low velocity: 1 sighting
    const lowResult = calculateVelocityScore({
      timestamps: [hoursAgo(12)],
      feedSources: ['feed-1'],
      windowHours: 24,
    });

    // High velocity: 10 sightings in 1 hour from multiple sources
    const timestamps = Array.from({ length: 10 }, (_, i) => hoursAgo(i * 0.1));
    const sources = ['feed-1', 'feed-2', 'feed-3', 'feed-1', 'feed-2', 'feed-3', 'feed-1', 'feed-2', 'feed-3', 'feed-1'];
    const highResult = calculateVelocityScore({
      timestamps,
      feedSources: sources,
      windowHours: 24,
    });

    expect(isVelocitySpike(highResult.velocityScore, lowResult.velocityScore)).toBe(true);
    expect(highResult.velocityScore).toBeGreaterThan(70);
  });

  it('CWE chain builds correct narrative for SQL injection path', () => {
    const result = buildCweChain(['CWE-20', 'CWE-89']);

    expect(result.attackNarrative).toContain('Input Validation');
    expect(result.attackNarrative).toContain('SQL Injection');
    expect(result.rootCauses.map((r) => r.id)).toContain('CWE-20');
    expect(result.maxSeverity).toBe(90);
    expect(result.categories).toContain('injection');
  });

  it('warninglist + fuzzy dedupe interaction: defanged Google DNS still filtered', () => {
    const matcher = new WarninglistMatcher();
    matcher.loadDefaults();

    // 8[.]8[.]8[.]8 after defang normalization = 8.8.8.8
    const normalized = fuzzyNormalizeIocValue('ip', '8[.]8[.]8[.]8');
    expect(normalized).toBe('8.8.8.8');

    // Warninglist should catch it
    const match = matcher.check('ip', normalized);
    expect(match).not.toBeNull();
  });

  it('fuzzy dedupe: URL defang + tracking param strip', () => {
    const h1 = computeFuzzyHash('url', 'hxxp://evil[.]com/payload?utm_source=twitter');
    const h2 = computeFuzzyHash('url', 'http://evil.com/payload');
    expect(h1).toBe(h2);
  });

  it('fuzzy dedupe: hash case insensitive', () => {
    const md5 = 'd41d8cd98f00b204e9800998ecf8427e';
    expect(areFuzzyDuplicates('hash_md5', md5, md5.toUpperCase())).toBe(true);
  });

  it('velocity score decays correctly over time', () => {
    const initial = 100;

    // 6h → ~50
    const after6h = decayVelocityScore(initial, 6);
    expect(after6h).toBeCloseTo(50, 0);

    // 24h → ~6.25
    const after24h = decayVelocityScore(initial, 24);
    expect(after24h).toBeLessThan(10);
  });

  it('CWE memory corruption chain', () => {
    const result = buildCweChain(['CWE-119', 'CWE-787', 'CWE-416']);
    expect(result.chain).toHaveLength(3);
    expect(result.maxSeverity).toBe(95); // CWE-787
    expect(result.categories).toContain('memory');
  });

  it('fuzzy dedupe: email plus-addressing variants', () => {
    expect(areFuzzyDuplicates('email', 'admin+alerts@evil.com', 'admin@evil.com')).toBe(true);
    expect(areFuzzyDuplicates('email', 'admin@evil.com', 'admin@good.com')).toBe(false);
  });

  it('cross-type consistency: same IOC different cases all normalize', () => {
    // Multiple types, all case-insensitive
    expect(areFuzzyDuplicates('domain', 'Evil.COM', 'evil.com')).toBe(true);
    expect(areFuzzyDuplicates('hash_sha256', 'ABCDEF1234567890'.repeat(4), 'abcdef1234567890'.repeat(4))).toBe(true);
    expect(areFuzzyDuplicates('cve', 'cve-2021-44228', 'CVE-2021-44228')).toBe(true);
  });
});
