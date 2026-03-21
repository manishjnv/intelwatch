import { describe, it, expect } from 'vitest';
import {
  calculateAttributionScore, jaccardSimilarity,
  groupTtpsByTactic, generateMitreSummary,
  computeSophisticationScore, actorToCsvRow, CSV_HEADER,
  ATTRIBUTION_WEIGHTS,
} from '../src/scoring.js';

describe('Threat Actor Intel — Scoring', () => {
  describe('ATTRIBUTION_WEIGHTS', () => {
    it('weights sum to 1.0', () => {
      const total = Object.values(ATTRIBUTION_WEIGHTS).reduce((sum, w) => sum + w, 0);
      expect(total).toBeCloseTo(1.0);
    });
  });

  describe('calculateAttributionScore', () => {
    it('returns 0 for zero signals', () => {
      const score = calculateAttributionScore({
        infrastructureOverlap: 0, malwareSimilarity: 0, ttpMatch: 0, victimologyMatch: 0,
      });
      expect(score).toBe(0);
    });

    it('returns 100 for perfect signals', () => {
      const score = calculateAttributionScore({
        infrastructureOverlap: 1, malwareSimilarity: 1, ttpMatch: 1, victimologyMatch: 1,
      });
      expect(score).toBe(100);
    });

    it('computes weighted score correctly', () => {
      const score = calculateAttributionScore({
        infrastructureOverlap: 0.5, malwareSimilarity: 0.5, ttpMatch: 0.5, victimologyMatch: 0.5,
      });
      expect(score).toBe(50);
    });

    it('applies correct weights — infra 35%, malware 30%, ttp 20%, victim 15%', () => {
      const score = calculateAttributionScore({
        infrastructureOverlap: 1, malwareSimilarity: 0, ttpMatch: 0, victimologyMatch: 0,
      });
      expect(score).toBe(35);
    });

    it('clamps to 0-100 range', () => {
      const score = calculateAttributionScore({
        infrastructureOverlap: -0.5, malwareSimilarity: 0, ttpMatch: 0, victimologyMatch: 0,
      });
      expect(score).toBe(0);
    });
  });

  describe('jaccardSimilarity', () => {
    it('returns 0 for two empty arrays', () => {
      expect(jaccardSimilarity([], [])).toBe(0);
    });

    it('returns 0 for disjoint arrays', () => {
      expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
    });

    it('returns 1 for identical arrays', () => {
      expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
    });

    it('returns 0.5 for half overlap', () => {
      // {a, b} ∩ {b, c} = {b}, |union| = 3
      expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    });

    it('is case-insensitive', () => {
      expect(jaccardSimilarity(['APT28'], ['apt28'])).toBe(1);
    });
  });

  describe('groupTtpsByTactic', () => {
    it('returns empty object for empty array', () => {
      expect(groupTtpsByTactic([])).toEqual({});
    });

    it('groups known technique IDs', () => {
      const groups = groupTtpsByTactic(['T1059', 'T1059.001', 'T1566']);
      expect(groups['Execution']).toContain('T1059');
      expect(groups['Execution']).toContain('T1059.001');
    });

    it('puts unknown technique IDs in Other', () => {
      const groups = groupTtpsByTactic(['T9999']);
      expect(groups['Other']).toContain('T9999');
    });

    it('handles mixed known and unknown', () => {
      const groups = groupTtpsByTactic(['T1059', 'T9999']);
      expect(Object.keys(groups).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('generateMitreSummary', () => {
    it('returns empty array for no TTPs', () => {
      expect(generateMitreSummary([])).toEqual([]);
    });

    it('sorts by technique count descending', () => {
      const summary = generateMitreSummary(['T1059', 'T1059.001', 'T9999']);
      expect(summary[0].techniqueCount).toBeGreaterThanOrEqual(summary[summary.length - 1].techniqueCount);
    });

    it('includes tactic name and technique list', () => {
      const summary = generateMitreSummary(['T1059']);
      expect(summary[0].tactic).toBeDefined();
      expect(summary[0].techniques).toContain('T1059');
    });
  });

  describe('computeSophisticationScore', () => {
    it('returns 0 for no TTPs', () => {
      expect(computeSophisticationScore([])).toBe(0);
    });

    it('returns higher score for more diverse TTPs', () => {
      const low = computeSophisticationScore(['T1059']);
      const high = computeSophisticationScore(['T1059', 'T1003', 'T1595', 'T1485', 'T1071']);
      expect(high).toBeGreaterThan(low);
    });

    it('caps at 100', () => {
      const ttps = Array.from({ length: 50 }, (_, i) => `T${1000 + i}`);
      expect(computeSophisticationScore(ttps)).toBeLessThanOrEqual(100);
    });
  });

  describe('actorToCsvRow', () => {
    it('produces comma-separated row', () => {
      const row = actorToCsvRow({
        name: 'APT28', aliases: ['Fancy Bear'], actorType: 'nation_state',
        motivation: 'espionage', sophistication: 'expert', country: 'Russia',
        confidence: 90, targetSectors: ['government'], targetRegions: ['NATO'],
        ttps: ['T1059'], associatedMalware: ['X-Agent'], tags: ['apt'],
        tlp: 'amber', firstSeen: new Date('2024-01-01'), lastSeen: new Date('2024-06-01'),
      });
      expect(row).toContain('APT28');
      expect(row).toContain('nation_state');
      expect(row.split(',').length).toBeGreaterThanOrEqual(15);
    });

    it('escapes commas in fields', () => {
      const row = actorToCsvRow({
        name: 'Actor, Inc', aliases: [], actorType: 'unknown',
        motivation: 'unknown', sophistication: 'none', country: null,
        confidence: 50, targetSectors: [], targetRegions: [],
        ttps: [], associatedMalware: [], tags: [],
        tlp: 'amber', firstSeen: null, lastSeen: null,
      });
      expect(row).toContain('"Actor, Inc"');
    });
  });

  describe('CSV_HEADER', () => {
    it('has 15 columns', () => {
      expect(CSV_HEADER.split(',').length).toBe(15);
    });
  });
});
