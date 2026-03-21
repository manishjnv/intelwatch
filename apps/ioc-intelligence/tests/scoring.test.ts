import { describe, it, expect } from 'vitest';
import {
  computeConfidenceTrend, computeActionability, computeRecencyBoost,
  computeRelevanceScore, classifyInfrastructureDensity, inferRelationships,
  EXPORT_PROFILES,
} from '../src/scoring.js';

describe('IOC Scoring — A2: Confidence Trend', () => {
  it('returns insufficient_data for < 3 points', () => {
    const result = computeConfidenceTrend([
      { date: '2026-03-01', score: 50, source: 'feed' },
    ]);
    expect(result.direction).toBe('insufficient_data');
    expect(result.dataPoints).toBe(1);
  });

  it('detects rising trend (scores increasing over time)', () => {
    const result = computeConfidenceTrend([
      { date: '2026-03-01', score: 40, source: 'feed' },
      { date: '2026-03-05', score: 55, source: 'corroboration' },
      { date: '2026-03-10', score: 70, source: 'enrichment' },
      { date: '2026-03-15', score: 85, source: 'analyst' },
    ]);
    expect(result.direction).toBe('rising');
    expect(result.slope).toBeGreaterThan(0);
    expect(result.dataPoints).toBe(4);
  });

  it('detects falling trend (scores decreasing)', () => {
    const result = computeConfidenceTrend([
      { date: '2026-03-01', score: 90, source: 'feed' },
      { date: '2026-03-05', score: 70, source: 'decay' },
      { date: '2026-03-10', score: 50, source: 'decay' },
      { date: '2026-03-15', score: 30, source: 'decay' },
    ]);
    expect(result.direction).toBe('falling');
    expect(result.slope).toBeLessThan(0);
  });

  it('detects stable trend (scores flat)', () => {
    const result = computeConfidenceTrend([
      { date: '2026-03-01', score: 75, source: 'feed' },
      { date: '2026-03-05', score: 74, source: 'feed' },
      { date: '2026-03-10', score: 76, source: 'feed' },
    ]);
    expect(result.direction).toBe('stable');
  });
});

describe('IOC Scoring — A3: Actionability', () => {
  it('scores 100 for ransomware + APT + high-impact MITRE', () => {
    const result = computeActionability({
      malwareFamilies: ['LockBit'],
      threatActors: ['APT28'],
      mitreAttack: ['T1486', 'T1059'],
      enrichmentData: { vtResult: {}, abuseipdbResult: {}, velocityScore: 80 },
    });
    // 30+25+20+15+8 = 98, capped at 100
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.components.ransomwareLinkage).toBe(100);
    expect(result.components.aptLinkage).toBe(100);
  });

  it('scores 0 for IOC with no context', () => {
    const result = computeActionability({
      malwareFamilies: [],
      threatActors: [],
      mitreAttack: [],
      enrichmentData: null,
    });
    expect(result.score).toBe(0);
  });

  it('scores partial for APT linkage only', () => {
    const result = computeActionability({
      malwareFamilies: [],
      threatActors: ['FIN7'],
      mitreAttack: [],
      enrichmentData: null,
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.components.aptLinkage).toBe(100);
    expect(result.components.ransomwareLinkage).toBe(0);
  });

  it('gives 40 aptLinkage for unnamed threat actors', () => {
    const result = computeActionability({
      malwareFamilies: [],
      threatActors: ['Unknown Group'],
      mitreAttack: [],
      enrichmentData: null,
    });
    expect(result.components.aptLinkage).toBe(40);
  });
});

describe('IOC Scoring — A5: Recency Boost', () => {
  it('returns ~1.5 for IOC seen today', () => {
    const now = new Date('2026-03-21');
    const boost = computeRecencyBoost(now, now);
    expect(boost).toBeCloseTo(1.5, 1);
  });

  it('returns ~1.18 for IOC seen 7 days ago', () => {
    const now = new Date('2026-03-21');
    const lastSeen = new Date('2026-03-14');
    const boost = computeRecencyBoost(lastSeen, now);
    expect(boost).toBeCloseTo(1.184, 1);
  });

  it('returns ~1.0 for IOC seen 30+ days ago', () => {
    const now = new Date('2026-03-21');
    const lastSeen = new Date('2026-02-01');
    const boost = computeRecencyBoost(lastSeen, now);
    expect(boost).toBeCloseTo(1.0, 1);
  });

  it('computeRelevanceScore multiplies confidence by boost', () => {
    const now = new Date('2026-03-21');
    const score = computeRelevanceScore(80, now, now);
    expect(score).toBe(120); // 80 × 1.5 = 120
  });
});

describe('IOC Scoring — A1: Infrastructure Density', () => {
  it('classifies 10+ IOCs in /24 as c2_infrastructure (+10 boost)', () => {
    const result = classifyInfrastructureDensity('ip', '192.168.1.50', 15);
    expect(result.classification).toBe('c2_infrastructure');
    expect(result.confidenceAdjustment).toBe(10);
    expect(result.subnetPrefix).toBe('192.168.1');
  });

  it('classifies 1 IOC in /24 as low_density (-5 penalty)', () => {
    const result = classifyInfrastructureDensity('ip', '10.0.0.1', 1);
    expect(result.classification).toBe('low_density');
    expect(result.confidenceAdjustment).toBe(-5);
  });

  it('classifies 2-9 IOCs as shared_hosting (neutral)', () => {
    const result = classifyInfrastructureDensity('ip', '10.0.0.1', 5);
    expect(result.classification).toBe('shared_hosting');
    expect(result.confidenceAdjustment).toBe(0);
  });

  it('returns not_applicable for non-IP IOCs', () => {
    const result = classifyInfrastructureDensity('domain', 'evil.com', 0);
    expect(result.classification).toBe('not_applicable');
  });
});

describe('IOC Scoring — A4: Relationship Inference', () => {
  it('extracts domain from URL', () => {
    const result = inferRelationships('url', 'https://evil.com/payload.exe');
    expect(result).toHaveLength(1);
    expect(result[0].relatedType).toBe('domain');
    expect(result[0].relatedValue).toBe('evil.com');
    expect(result[0].relationship).toBe('url_contains_domain');
  });

  it('extracts domain from email', () => {
    const result = inferRelationships('email', 'attacker@evil.com');
    expect(result).toHaveLength(1);
    expect(result[0].relatedType).toBe('domain');
    expect(result[0].relatedValue).toBe('evil.com');
  });

  it('returns empty for IP IOCs', () => {
    const result = inferRelationships('ip', '1.2.3.4');
    expect(result).toHaveLength(0);
  });

  it('handles malformed URL gracefully', () => {
    const result = inferRelationships('url', 'hxxps://evil.com/path');
    expect(result).toHaveLength(1); // falls back to regex
    expect(result[0].relatedValue).toBe('evil.com');
  });
});

describe('IOC Scoring — D2: Export Profiles', () => {
  it('high_fidelity profile requires minConfidence 80', () => {
    expect(EXPORT_PROFILES.high_fidelity.minConfidence).toBe(80);
    expect(EXPORT_PROFILES.high_fidelity.excludeLifecycles).toContain('false_positive');
  });

  it('research profile has no minimum confidence', () => {
    expect(EXPORT_PROFILES.research.minConfidence).toBe(0);
    expect(EXPORT_PROFILES.research.excludeLifecycles).toHaveLength(0);
  });

  it('monitoring profile excludes archived and false_positive', () => {
    expect(EXPORT_PROFILES.monitoring.excludeLifecycles).toContain('archived');
    expect(EXPORT_PROFILES.monitoring.excludeLifecycles).toContain('false_positive');
  });
});
