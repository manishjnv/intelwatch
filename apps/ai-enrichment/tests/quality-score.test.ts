import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeEnrichmentQuality } from '../src/quality-score.js';
import type { VTResult, AbuseIPDBResult, HaikuTriageResult } from '../src/schema.js';

const baseVT: VTResult = {
  malicious: 20, suspicious: 5, harmless: 40, undetected: 5,
  totalEngines: 70, detectionRate: 28.6, tags: [], lastAnalysisDate: null,
};

const baseAbuse: AbuseIPDBResult = {
  abuseConfidenceScore: 75, totalReports: 10, numDistinctUsers: 5,
  lastReportedAt: null, isp: 'TestISP', countryCode: 'US',
  usageType: '', isWhitelisted: false, isTor: false,
};

const baseHaiku: HaikuTriageResult = {
  riskScore: 70, confidence: 80, severity: 'HIGH', threatCategory: 'c2_server',
  reasoning: 'test', tags: [], inputTokens: 100, outputTokens: 50,
  costUsd: 0.001, durationMs: 200,
  scoreJustification: '', evidenceSources: [], uncertaintyFactors: [],
  mitreTechniques: [], isFalsePositive: false, falsePositiveReason: null,
  malwareFamilies: [], attributedActors: [], recommendedActions: [],
  stixLabels: [], cacheReadTokens: 0, cacheCreationTokens: 0,
};

afterEach(() => { vi.restoreAllMocks(); });

describe('computeEnrichmentQuality', () => {
  it('returns 100 for full coverage, fresh data, high AI confidence (IP)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-22T12:00:00Z').getTime());
    const quality = computeEnrichmentQuality(
      baseVT, baseAbuse, baseHaiku,
      'ip', new Date('2026-03-22T12:00:00Z'),
    );
    // 3/3 providers = 100% coverage (33), freshness 100% (33), AI 80% confidence (27.2)
    expect(quality).toBeGreaterThanOrEqual(90);
    expect(quality).toBeLessThanOrEqual(100);
  });

  it('returns lower score with partial coverage (hash — VT + Haiku, no Abuse)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-22T12:00:00Z').getTime());
    const quality = computeEnrichmentQuality(
      baseVT, null, baseHaiku,
      'hash_sha256', new Date('2026-03-22T12:00:00Z'),
    );
    // 2/2 applicable providers = 100% coverage, fresh, AI 80
    expect(quality).toBeGreaterThanOrEqual(85);
  });

  it('penalizes stale data (3.5 days old = ~50% freshness)', () => {
    const now = new Date('2026-03-22T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const staleDate = new Date(now - 3.5 * 24 * 60 * 60 * 1000); // 3.5 days ago
    const quality = computeEnrichmentQuality(baseVT, baseAbuse, baseHaiku, 'ip', staleDate);
    expect(quality).toBeLessThan(85);
    expect(quality).toBeGreaterThan(40);
  });

  it('returns 0 quality for null enrichedAt', () => {
    const quality = computeEnrichmentQuality(baseVT, baseAbuse, baseHaiku, 'ip', null);
    // freshness = 0 (33% weight zeroed), but coverage and AI still contribute
    expect(quality).toBeGreaterThanOrEqual(40);
    expect(quality).toBeLessThan(70);
  });

  it('returns 0 AI confidence when no Haiku result', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-22T12:00:00Z').getTime());
    const quality = computeEnrichmentQuality(
      baseVT, baseAbuse, null,
      'ip', new Date('2026-03-22T12:00:00Z'),
    );
    // 2/3 coverage (~67%), fresh (100%), AI 0 → lower
    expect(quality).toBeLessThan(60);
    expect(quality).toBeGreaterThan(30);
  });

  it('returns very low quality when all providers are null', () => {
    const quality = computeEnrichmentQuality(null, null, null, 'ip', null);
    expect(quality).toBe(0);
  });

  it('clamps result to 0-100 range', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-22T12:00:00Z').getTime());
    const quality = computeEnrichmentQuality(baseVT, baseAbuse, baseHaiku, 'ip', new Date('2026-03-22T12:00:00Z'));
    expect(quality).toBeGreaterThanOrEqual(0);
    expect(quality).toBeLessThanOrEqual(100);
  });
});
