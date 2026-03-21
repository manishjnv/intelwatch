import { describe, it, expect } from 'vitest';
import {
  explainAttribution, findAliasCandidates, ALIAS_SIMILARITY_THRESHOLD,
  analyzeCorroboration, computeCorroborationBoost, CORROBORATION_BONUS_PER_FEED, CORROBORATION_MAX_BONUS,
  classifyDormancy, DORMANCY_THRESHOLDS,
  computeLinkStrength, classifyLinkStrength, LINK_STRENGTH_WEIGHTS,
} from '../src/scoring.js';

// ═══════════════════════════════════════════════════════════════
// A1: Explainable Attribution Audit Trail
// ═══════════════════════════════════════════════════════════════
describe('A1: Explainable Attribution', () => {
  it('returns 4 signals with evidence arrays', () => {
    const result = explainAttribution(
      ['X-Agent', 'Zebrocy'],
      ['T1059', 'T1566'],
      ['government', 'military'],
      ['NATO'],
      ['1.2.3.4', '5.6.7.8'],
    );
    expect(result.signals).toHaveLength(4);
    expect(result.signals[0].signal).toBe('infrastructure');
    expect(result.signals[1].signal).toBe('malware');
    expect(result.signals[2].signal).toBe('ttps');
    expect(result.signals[3].signal).toBe('victimology');
  });

  it('composite score is 0-100', () => {
    const result = explainAttribution([], [], [], [], []);
    expect(result.compositeScore).toBe(0);
  });

  it('more evidence increases score', () => {
    const low = explainAttribution(['one'], ['T1059'], ['gov'], [], ['1.2.3.4']);
    const high = explainAttribution(
      ['X-Agent', 'Zebrocy', 'Sofacy', 'Seduploader', 'Chopstick'],
      ['T1059', 'T1566', 'T1003', 'T1071', 'T1027', 'T1055', 'T1140', 'T1082', 'T1070', 'T1105'],
      ['government', 'military', 'media'],
      ['NATO', 'EU', 'Ukraine'],
      Array.from({ length: 15 }, (_, i) => `${i}.${i}.${i}.${i}`),
    );
    expect(high.compositeScore).toBeGreaterThan(low.compositeScore);
  });

  it('each signal has weight, rawScore, weightedScore, evidence', () => {
    const result = explainAttribution(['X-Agent'], ['T1059'], ['gov'], ['NATO'], ['1.2.3.4']);
    for (const signal of result.signals) {
      expect(signal.weight).toBeGreaterThan(0);
      expect(typeof signal.rawScore).toBe('number');
      expect(typeof signal.weightedScore).toBe('number');
      expect(signal.evidence).toBeInstanceOf(Array);
    }
  });

  it('caps infrastructure evidence at 20 items', () => {
    const iocs = Array.from({ length: 30 }, (_, i) => `192.168.1.${i}`);
    const result = explainAttribution([], [], [], [], iocs);
    const infraSignal = result.signals.find((s) => s.signal === 'infrastructure');
    expect(infraSignal!.evidence.length).toBeLessThanOrEqual(20);
  });
});

// ═══════════════════════════════════════════════════════════════
// A2: Alias Similarity Clustering
// ═══════════════════════════════════════════════════════════════
describe('A2: Alias Similarity Clustering', () => {
  const target = { ttps: ['T1059', 'T1566', 'T1003'], associatedMalware: ['X-Agent', 'Zebrocy'], targetSectors: ['government', 'military'] };

  it('finds candidates above threshold', () => {
    const candidates = [
      { id: '1', name: 'Similar Actor', ttps: ['T1059', 'T1566', 'T1003'], associatedMalware: ['X-Agent', 'Zebrocy'], targetSectors: ['government', 'military'] },
      { id: '2', name: 'Different Actor', ttps: ['T9999'], associatedMalware: ['DifferentMalware'], targetSectors: ['finance'] },
    ];
    const results = findAliasCandidates(target, candidates);
    expect(results.length).toBe(1);
    expect(results[0].actorName).toBe('Similar Actor');
  });

  it('returns empty for no similar actors', () => {
    const candidates = [
      { id: '1', name: 'Unrelated', ttps: ['T9999'], associatedMalware: ['Other'], targetSectors: ['retail'] },
    ];
    expect(findAliasCandidates(target, candidates)).toHaveLength(0);
  });

  it('sorts by similarity descending', () => {
    const candidates = [
      { id: '1', name: 'Somewhat Similar', ttps: ['T1059', 'T1566'], associatedMalware: ['X-Agent'], targetSectors: ['government'] },
      { id: '2', name: 'Very Similar', ttps: ['T1059', 'T1566', 'T1003'], associatedMalware: ['X-Agent', 'Zebrocy'], targetSectors: ['government', 'military'] },
    ];
    const results = findAliasCandidates(target, candidates);
    if (results.length >= 2) {
      expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
    }
  });

  it('includes shared evidence in suggestions', () => {
    const candidates = [
      { id: '1', name: 'Match', ttps: ['T1059', 'T1566', 'T1003'], associatedMalware: ['X-Agent', 'Zebrocy'], targetSectors: ['government', 'military'] },
    ];
    const results = findAliasCandidates(target, candidates);
    expect(results[0].sharedTtps.length).toBeGreaterThan(0);
    expect(results[0].sharedMalware.length).toBeGreaterThan(0);
  });

  it('threshold is 0.6', () => {
    expect(ALIAS_SIMILARITY_THRESHOLD).toBe(0.6);
  });
});

// ═══════════════════════════════════════════════════════════════
// A3: Multi-Source Actor Corroboration
// ═══════════════════════════════════════════════════════════════
describe('A3: Multi-Source Corroboration', () => {
  it('no boost for single feed', () => {
    expect(computeCorroborationBoost(1)).toBe(0);
    expect(computeCorroborationBoost(0)).toBe(0);
  });

  it('5 points per additional feed', () => {
    expect(computeCorroborationBoost(2)).toBe(5);
    expect(computeCorroborationBoost(3)).toBe(10);
    expect(CORROBORATION_BONUS_PER_FEED).toBe(5);
  });

  it('caps at 20', () => {
    expect(computeCorroborationBoost(10)).toBe(CORROBORATION_MAX_BONUS);
    expect(CORROBORATION_MAX_BONUS).toBe(20);
  });

  it('analyzeCorroboration returns full result', () => {
    const result = analyzeCorroboration(70, ['feed-1', 'feed-2', 'feed-3']);
    expect(result.feedCount).toBe(3);
    expect(result.boost).toBe(10);
    expect(result.corroboratedConfidence).toBe(80);
    expect(result.singleSource).toBe(false);
  });

  it('flags single source', () => {
    const result = analyzeCorroboration(50, ['feed-1']);
    expect(result.singleSource).toBe(true);
    expect(result.boost).toBe(0);
    expect(result.corroboratedConfidence).toBe(50);
  });

  it('deduplicates feed IDs', () => {
    const result = analyzeCorroboration(60, ['feed-1', 'feed-1', 'feed-2']);
    expect(result.feedCount).toBe(2);
    expect(result.boost).toBe(5);
  });

  it('caps corroborated confidence at 100', () => {
    const result = analyzeCorroboration(95, ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
    expect(result.corroboratedConfidence).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════
// B1: Dormancy Detection
// ═══════════════════════════════════════════════════════════════
describe('B1: Dormancy Detection', () => {
  const now = new Date('2026-03-21T12:00:00Z');

  it('returns unknown for no IOC data', () => {
    const result = classifyDormancy([], now);
    expect(result.status).toBe('unknown');
    expect(result.daysSinceLastIoc).toBeNull();
    expect(result.confidenceAdjustment).toBe(0);
  });

  it('classifies as active within 30 days', () => {
    const recent = new Date('2026-03-15T12:00:00Z');
    const result = classifyDormancy([recent], now);
    expect(result.status).toBe('active');
    expect(result.daysSinceLastIoc).toBeLessThanOrEqual(30);
    expect(result.confidenceAdjustment).toBe(0);
  });

  it('classifies as dormant after 90 days', () => {
    const old = new Date('2025-12-01T12:00:00Z');
    const result = classifyDormancy([old], now);
    expect(result.status).toBe('dormant');
    expect(result.daysSinceLastIoc).toBeGreaterThanOrEqual(90);
    expect(result.confidenceAdjustment).toBe(-10);
  });

  it('detects resurgence (gap 60+ days then recent)', () => {
    const oldActivity = new Date('2025-12-01T12:00:00Z');
    const recentReturn = new Date('2026-03-18T12:00:00Z'); // Within 14 days, gap > 60
    const result = classifyDormancy([recentReturn, oldActivity], now);
    expect(result.status).toBe('resurgent');
    expect(result.resurgenceDetected).toBe(true);
    expect(result.confidenceAdjustment).toBe(10);
  });

  it('applies -5 penalty for 31-89 day inactivity', () => {
    const aging = new Date('2026-02-01T12:00:00Z'); // ~48 days ago
    const result = classifyDormancy([aging], now);
    expect(result.status).toBe('active');
    expect(result.confidenceAdjustment).toBe(-5);
  });

  it('thresholds match spec', () => {
    expect(DORMANCY_THRESHOLDS.activeWithin).toBe(30);
    expect(DORMANCY_THRESHOLDS.dormantAfter).toBe(90);
    expect(DORMANCY_THRESHOLDS.resurgenceGap).toBe(60);
    expect(DORMANCY_THRESHOLDS.resurgenceWindow).toBe(14);
  });
});

// ═══════════════════════════════════════════════════════════════
// C2: Actor-IOC Link Strength Scoring
// ═══════════════════════════════════════════════════════════════
describe('C2: Link Strength Scoring', () => {
  it('weights sum to 1.0', () => {
    const total = Object.values(LINK_STRENGTH_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1.0);
  });

  it('returns high score for fresh, multi-source, high-confidence IOC', () => {
    const score = computeLinkStrength({
      feedReliability: 90,
      daysSinceAttribution: 1,
      corroboratingFeeds: 3,
      iocConfidence: 95,
    });
    expect(score).toBeGreaterThan(70);
  });

  it('returns low score for old, single-source, low-confidence IOC', () => {
    const score = computeLinkStrength({
      feedReliability: 30,
      daysSinceAttribution: 180,
      corroboratingFeeds: 1,
      iocConfidence: 20,
    });
    expect(score).toBeLessThan(40);
  });

  it('recency decays over time', () => {
    const fresh = computeLinkStrength({ feedReliability: 70, daysSinceAttribution: 0, corroboratingFeeds: 1, iocConfidence: 50 });
    const old = computeLinkStrength({ feedReliability: 70, daysSinceAttribution: 90, corroboratingFeeds: 1, iocConfidence: 50 });
    expect(fresh).toBeGreaterThan(old);
  });

  it('classifies strong >= 70', () => {
    expect(classifyLinkStrength(70)).toBe('strong');
    expect(classifyLinkStrength(100)).toBe('strong');
  });

  it('classifies moderate 30-69', () => {
    expect(classifyLinkStrength(30)).toBe('moderate');
    expect(classifyLinkStrength(69)).toBe('moderate');
  });

  it('classifies weak < 30', () => {
    expect(classifyLinkStrength(29)).toBe('weak');
    expect(classifyLinkStrength(0)).toBe('weak');
  });

  it('clamps score to 0-100', () => {
    const score = computeLinkStrength({ feedReliability: 100, daysSinceAttribution: 0, corroboratingFeeds: 10, iocConfidence: 100 });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
