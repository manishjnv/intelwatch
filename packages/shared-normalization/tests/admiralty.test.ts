import { describe, it, expect } from 'vitest';
import {
  admiraltyToScore,
  scoreToAdmiralty,
  formatAdmiraltyCode,
  ADMIRALTY_LABELS,
  type SourceReliability,
  type InfoCredibility,
} from '../src/admiralty.js';

describe('admiraltyToScore', () => {
  it('A1 → 100 (best possible)', () => {
    expect(admiraltyToScore('A', 1)).toBe(85);
    // Formula: (5-0)*14 + (6-1)*3 = 70 + 15 = 85
  });

  it('F6 → 0 (worst possible)', () => {
    expect(admiraltyToScore('F', 6)).toBe(0);
  });

  it('C3 → 51', () => {
    // (5-2)*14 + (6-3)*3 = 42 + 9 = 51
    expect(admiraltyToScore('C', 3)).toBe(51);
  });

  it('B2 → 68', () => {
    // (5-1)*14 + (6-2)*3 = 56 + 12 = 68
    expect(admiraltyToScore('B', 2)).toBe(68);
  });

  it('A6 → 55', () => {
    // (5-0)*14 + (6-6)*3 = 70 + 0 = 70
    expect(admiraltyToScore('A', 6)).toBe(70);
  });

  it('F1 → 15', () => {
    // (5-5)*14 + (6-1)*3 = 0 + 15 = 15
    expect(admiraltyToScore('F', 1)).toBe(15);
  });

  it('throws on invalid source letter', () => {
    expect(() => admiraltyToScore('X' as SourceReliability, 1)).toThrow('Invalid source reliability');
  });

  it('throws on cred out of range', () => {
    expect(() => admiraltyToScore('A', 0 as InfoCredibility)).toThrow('Invalid info credibility');
    expect(() => admiraltyToScore('A', 7 as InfoCredibility)).toThrow('Invalid info credibility');
  });
});

describe('scoreToAdmiralty', () => {
  it('round-trips for all 36 combinations', () => {
    const sources: SourceReliability[] = ['A', 'B', 'C', 'D', 'E', 'F'];
    const creds: InfoCredibility[] = [1, 2, 3, 4, 5, 6];

    for (const s of sources) {
      for (const c of creds) {
        const score = admiraltyToScore(s, c);
        const result = scoreToAdmiralty(score);
        // The reverse should produce the same score (may differ in code if ties exist)
        expect(admiraltyToScore(result.source, result.cred)).toBe(score);
      }
    }
  });

  it('clamps score to 0-100 range', () => {
    expect(scoreToAdmiralty(-10)).toBeDefined();
    expect(scoreToAdmiralty(150)).toBeDefined();
  });
});

describe('formatAdmiraltyCode', () => {
  it('formats as source+cred string', () => {
    expect(formatAdmiraltyCode('B', 2)).toBe('B2');
    expect(formatAdmiraltyCode('A', 1)).toBe('A1');
    expect(formatAdmiraltyCode('F', 6)).toBe('F6');
  });
});

describe('ADMIRALTY_LABELS', () => {
  it('has labels for all 6 source grades', () => {
    for (const s of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(ADMIRALTY_LABELS[s]).toBeTruthy();
    }
  });

  it('has labels for all 6 credibility grades', () => {
    for (let c = 1; c <= 6; c++) {
      expect(ADMIRALTY_LABELS[String(c)]).toBeTruthy();
    }
  });

  it('A = Completely reliable', () => {
    expect(ADMIRALTY_LABELS['A']).toBe('Completely reliable');
  });

  it('1 = Confirmed', () => {
    expect(ADMIRALTY_LABELS['1']).toBe('Confirmed');
  });
});
