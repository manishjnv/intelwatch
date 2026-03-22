import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnrichmentService, computeRiskScore } from '../src/service.js';
import { EnrichmentCostTracker } from '../src/cost-tracker.js';
import type { EnrichmentRepository } from '../src/repository.js';
import type { VirusTotalProvider } from '../src/providers/virustotal.js';
import type { AbuseIPDBProvider } from '../src/providers/abuseipdb.js';
import type { HaikuTriageProvider } from '../src/providers/haiku-triage.js';
import type { EnrichmentCache } from '../src/cache.js';
import type { EnrichJob, HaikuTriageResult } from '../src/schema.js';
import pino from 'pino';

// Mock shared-normalization
vi.mock('@etip/shared-normalization', () => ({
  calculateCompositeConfidence: vi.fn(() => ({
    score: 65,
    signals: { feedReliability: 50, corroboration: 0, aiScore: 54 },
    daysSinceLastSeen: 0,
    decayFactor: 1.0,
  })),
}));

const logger = pino({ level: 'silent' });

function mockRepo(): EnrichmentRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByIdInternal: vi.fn().mockResolvedValue(null),
    updateEnrichment: vi.fn().mockResolvedValue({ id: 'mock' }),
    updateConfidence: vi.fn().mockResolvedValue(undefined),
    findPendingEnrichment: vi.fn().mockResolvedValue([]),
    getEnrichmentStats: vi.fn().mockResolvedValue({ total: 0, enriched: 0, pending: 0 }),
  } as unknown as EnrichmentRepository;
}

function mockCache(overrides: Partial<EnrichmentCache> = {}): EnrichmentCache {
  return {
    isAvailable: vi.fn().mockReturnValue(true),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as EnrichmentCache;
}

function mockVT(overrides: Partial<VirusTotalProvider> = {}): VirusTotalProvider {
  return {
    supports: vi.fn().mockReturnValue(true),
    lookup: vi.fn().mockResolvedValue({
      malicious: 15, suspicious: 2, harmless: 50, undetected: 3,
      totalEngines: 70, detectionRate: 21, tags: ['trojan'], lastAnalysisDate: '2026-03-20',
    }),
    ...overrides,
  } as unknown as VirusTotalProvider;
}

function mockAbuse(overrides: Partial<AbuseIPDBProvider> = {}): AbuseIPDBProvider {
  return {
    supports: vi.fn().mockReturnValue(true),
    lookup: vi.fn().mockResolvedValue({
      abuseConfidenceScore: 85, totalReports: 42, numDistinctUsers: 12,
      lastReportedAt: '2026-03-20', isp: 'Evil Hosting', countryCode: 'RU',
      usageType: 'Data Center/Web Hosting/Transit', isWhitelisted: false, isTor: false,
    }),
    ...overrides,
  } as unknown as AbuseIPDBProvider;
}

const DEFAULT_HAIKU_RESULT: HaikuTriageResult = {
  riskScore: 70, confidence: 80, severity: 'HIGH',
  threatCategory: 'c2_server', reasoning: 'Known C2 infra.',
  tags: ['apt28'], inputTokens: 120, outputTokens: 80,
  costUsd: 0.00013, durationMs: 450,
  scoreJustification: '', evidenceSources: [], uncertaintyFactors: [],
  mitreTechniques: [], isFalsePositive: false, falsePositiveReason: null,
  malwareFamilies: [], attributedActors: [], recommendedActions: [],
};

function mockHaiku(overrides: Partial<HaikuTriageProvider> = {}): HaikuTriageProvider {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    supports: vi.fn().mockReturnValue(true),
    triage: vi.fn().mockResolvedValue(DEFAULT_HAIKU_RESULT),
    ...overrides,
  } as unknown as HaikuTriageProvider;
}

function buildJob(overrides: Partial<EnrichJob> = {}): EnrichJob {
  return {
    iocId: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000003',
    iocType: 'ip',
    normalizedValue: '185.220.101.34',
    confidence: 50,
    severity: 'medium',
    ...overrides,
  };
}

describe('EnrichmentService', () => {
  // ===== Original tests (backward compat, no Haiku) =====

  describe('enrichIOC — AI enabled, no Haiku', () => {
    let service: EnrichmentService;
    let repo: EnrichmentRepository;
    let costTracker: EnrichmentCostTracker;

    beforeEach(() => {
      repo = mockRepo();
      costTracker = new EnrichmentCostTracker();
      service = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, true, logger);
    });

    it('enriches IP with VT + AbuseIPDB results', async () => {
      const result = await service.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('enriched');
      expect(result.vtResult).not.toBeNull();
      expect(result.vtResult!.malicious).toBe(15);
      expect(result.abuseipdbResult).not.toBeNull();
      expect(result.abuseipdbResult!.abuseConfidenceScore).toBe(85);
      expect(result.externalRiskScore).toBeGreaterThan(0);
      expect(repo.updateEnrichment).toHaveBeenCalledOnce();
    });

    it('enriches hash with VT only (AbuseIPDB does not support hashes)', async () => {
      const abuseProvider = mockAbuse({ supports: vi.fn().mockReturnValue(false) });
      service = new EnrichmentService(repo, mockVT(), abuseProvider, null, costTracker, true, logger);

      const result = await service.enrichIOC(buildJob({ iocType: 'hash_sha256', normalizedValue: 'a'.repeat(64) }));

      expect(result.enrichmentStatus).toBe('enriched');
      expect(result.vtResult).not.toBeNull();
      expect(result.abuseipdbResult).toBeNull();
    });

    it('returns partial when VT fails but AbuseIPDB succeeds', async () => {
      const vtProvider = mockVT({ lookup: vi.fn().mockRejectedValue(new Error('VT timeout')) });
      service = new EnrichmentService(repo, vtProvider, mockAbuse(), null, costTracker, true, logger);

      const result = await service.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('partial');
      expect(result.vtResult).toBeNull();
      expect(result.abuseipdbResult).not.toBeNull();
      expect(result.failureReason).toContain('VT');
    });

    it('returns failed when all providers fail', async () => {
      const vtProvider = mockVT({ lookup: vi.fn().mockRejectedValue(new Error('VT down')) });
      const abuseProvider = mockAbuse({ lookup: vi.fn().mockRejectedValue(new Error('Abuse down')) });
      service = new EnrichmentService(repo, vtProvider, abuseProvider, null, costTracker, true, logger);

      const result = await service.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('failed');
      expect(result.failureReason).toContain('VT');
      expect(result.failureReason).toContain('Abuse');
    });

    it('computes weighted risk score from VT + AbuseIPDB (backward compat)', async () => {
      const result = await service.enrichIOC(buildJob());
      // VT detectionRate=21 (weight 0.5) + AbuseIPDB=85 (weight 0.3) + confidence=50 (weight 0.2)
      // = 21*0.5 + 85*0.3 + 50*0.2 = 10.5 + 25.5 + 10 = 46
      expect(result.externalRiskScore).toBe(46);
    });

    it('merges with existing enrichment data', async () => {
      const job = buildJob({ existingEnrichment: { sightingCount: 3, feedReliability: 80 } });
      await service.enrichIOC(job);

      const updateCall = (repo.updateEnrichment as ReturnType<typeof vi.fn>).mock.calls[0];
      const merged = updateCall[1];
      expect(merged.sightingCount).toBe(3);
      expect(merged.feedReliability).toBe(80);
      expect(merged.vtResult).toBeDefined();
    });

    it('haikuResult is null when no Haiku provider', async () => {
      const result = await service.enrichIOC(buildJob());
      expect(result.haikuResult).toBeNull();
    });
  });

  describe('enrichIOC — AI disabled', () => {
    it('returns skipped when TI_AI_ENABLED is false', async () => {
      const repo = mockRepo();
      const costTracker = new EnrichmentCostTracker();
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, false, logger);

      const result = await service.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('skipped');
      expect(result.failureReason).toContain('TI_AI_ENABLED');
      expect(result.vtResult).toBeNull();
      expect(result.abuseipdbResult).toBeNull();
      expect(result.haikuResult).toBeNull();
      expect(repo.updateEnrichment).not.toHaveBeenCalled();
    });
  });

  // ===== Session 21: Haiku triage + cost tracking =====

  describe('enrichIOC — with Haiku triage', () => {
    let service: EnrichmentService;
    let repo: EnrichmentRepository;
    let costTracker: EnrichmentCostTracker;
    let haiku: HaikuTriageProvider;

    beforeEach(() => {
      repo = mockRepo();
      costTracker = new EnrichmentCostTracker();
      haiku = mockHaiku();
      service = new EnrichmentService(repo, mockVT(), mockAbuse(), haiku, costTracker, true, logger);
    });

    it('enriches IP with VT + AbuseIPDB + Haiku results', async () => {
      const result = await service.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('enriched');
      expect(result.vtResult).not.toBeNull();
      expect(result.abuseipdbResult).not.toBeNull();
      expect(result.haikuResult).not.toBeNull();
      expect(result.haikuResult!.riskScore).toBe(70);
    });

    it('includes haikuResult in EnrichmentResult', async () => {
      const result = await service.enrichIOC(buildJob());

      expect(result.haikuResult!.severity).toBe('HIGH');
      expect(result.haikuResult!.threatCategory).toBe('c2_server');
      expect(result.haikuResult!.tags).toEqual(['apt28']);
    });

    it('calls Haiku with VT and AbuseIPDB results as context', async () => {
      await service.enrichIOC(buildJob());

      const triageMock = haiku.triage as ReturnType<typeof vi.fn>;
      expect(triageMock).toHaveBeenCalledOnce();
      const [iocType, value, vtResult, abuseResult, confidence] = triageMock.mock.calls[0];
      expect(iocType).toBe('ip');
      expect(value).toBe('185.220.101.34');
      expect(vtResult).not.toBeNull();
      expect(abuseResult).not.toBeNull();
      expect(confidence).toBe(50);
    });

    it('records all 3 providers in cost tracker', async () => {
      await service.enrichIOC(buildJob());

      const iocCost = costTracker.getIOCCost('00000000-0000-0000-0000-000000000001');
      const providers = iocCost.providers.map(p => p.provider);
      expect(providers).toContain('virustotal');
      expect(providers).toContain('abuseipdb');
      expect(providers).toContain('haiku_triage');
    });

    it('computes 4-component risk score with Haiku', async () => {
      const result = await service.enrichIOC(buildJob());
      // VT(21)*0.35 + Abuse(85)*0.25 + Haiku(70)*0.25 + base(50)*0.15
      // = 7.35 + 21.25 + 17.5 + 7.5 = 53.6 → 54
      expect(result.externalRiskScore).toBe(54);
    });

    it('stores cost breakdown in enrichmentData', async () => {
      await service.enrichIOC(buildJob());

      const updateCall = (repo.updateEnrichment as ReturnType<typeof vi.fn>).mock.calls[0];
      const merged = updateCall[1];
      expect(merged.costBreakdown).toBeDefined();
      expect(merged.costBreakdown.providerCount).toBe(3);
    });

    it('falls back to 2-provider scoring when Haiku returns null', async () => {
      const disabledHaiku = mockHaiku({ triage: vi.fn().mockResolvedValue(null) });
      service = new EnrichmentService(repo, mockVT(), mockAbuse(), disabledHaiku, costTracker, true, logger);

      const result = await service.enrichIOC(buildJob());
      // Falls back to original formula: 21*0.5 + 85*0.3 + 50*0.2 = 46
      expect(result.externalRiskScore).toBe(46);
      expect(result.haikuResult).toBeNull();
    });

    it('falls back gracefully when Haiku provider is disabled', async () => {
      const disabledHaiku = mockHaiku({ isEnabled: vi.fn().mockReturnValue(false) });
      service = new EnrichmentService(repo, mockVT(), mockAbuse(), disabledHaiku, costTracker, true, logger);

      const result = await service.enrichIOC(buildJob());
      expect(result.haikuResult).toBeNull();
      expect(result.externalRiskScore).toBe(46);
    });

    it('tracks tenant spend after enrichment', async () => {
      await service.enrichIOC(buildJob());

      const spend = costTracker.getTenantSpend('00000000-0000-0000-0000-000000000003');
      expect(spend).toBeGreaterThan(0);
    });

    it('tracks duration for each provider call', async () => {
      await service.enrichIOC(buildJob());

      const iocCost = costTracker.getIOCCost('00000000-0000-0000-0000-000000000001');
      for (const p of iocCost.providers) {
        expect(p.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('still returns enriched when all providers return null', async () => {
      const vtProvider = mockVT({ supports: vi.fn().mockReturnValue(false) });
      const abuseProvider = mockAbuse({ supports: vi.fn().mockReturnValue(false) });
      const disabledHaiku = mockHaiku({ isEnabled: vi.fn().mockReturnValue(false) });
      service = new EnrichmentService(repo, vtProvider, abuseProvider, disabledHaiku, costTracker, true, logger);

      const result = await service.enrichIOC(buildJob());
      expect(result.enrichmentStatus).toBe('enriched');
      expect(result.externalRiskScore).toBeNull();
    });

    it('includes costBreakdown with totalCostUsd in result', async () => {
      const result = await service.enrichIOC(buildJob());
      expect(result.costBreakdown).not.toBeNull();
      expect(result.costBreakdown!.totalCostUsd).toBeGreaterThan(0);
    });
  });

  // ===== Session 22: Budget Enforcement Gate (#5) =====

  describe('enrichIOC — budget enforcement gate (#5)', () => {
    let repo: EnrichmentRepository;
    let costTracker: EnrichmentCostTracker;
    let haiku: HaikuTriageProvider;

    beforeEach(() => {
      repo = mockRepo();
      costTracker = new EnrichmentCostTracker();
      haiku = mockHaiku();
    });

    it('calls Haiku normally when under budget', async () => {
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), haiku, costTracker, true, logger, undefined, 5.00);
      const result = await service.enrichIOC(buildJob());

      expect(result.haikuResult).not.toBeNull();
      expect(haiku.triage).toHaveBeenCalledOnce();
    });

    it('uses rule-based fallback at 90% budget', async () => {
      // Pre-load tenant spend to 90% of $5 = $4.50
      costTracker.addTenantSpend('00000000-0000-0000-0000-000000000003', 4.50);
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), haiku, costTracker, true, logger, undefined, 5.00);

      const result = await service.enrichIOC(buildJob());

      expect(haiku.triage).not.toHaveBeenCalled();
      expect(result.haikuResult).not.toBeNull();
      expect(result.haikuResult!.tags).toContain('rule_based');
      expect(result.haikuResult!.costUsd).toBe(0);
    });

    it('uses rule-based fallback at 100% budget (over budget)', async () => {
      costTracker.addTenantSpend('00000000-0000-0000-0000-000000000003', 5.00);
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), haiku, costTracker, true, logger, undefined, 5.00);

      const result = await service.enrichIOC(buildJob());

      expect(haiku.triage).not.toHaveBeenCalled();
      expect(result.haikuResult).not.toBeNull();
      expect(result.haikuResult!.tags).toContain('rule_based');
    });

    it('still enriches with VT + AbuseIPDB even when over budget', async () => {
      costTracker.addTenantSpend('00000000-0000-0000-0000-000000000003', 10.00);
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), haiku, costTracker, true, logger, undefined, 5.00);

      const result = await service.enrichIOC(buildJob());

      expect(result.vtResult).not.toBeNull();
      expect(result.abuseipdbResult).not.toBeNull();
      expect(result.enrichmentStatus).toBe('enriched');
    });
  });

  // ===== Session 22: Confidence Feedback Loop (#4) =====

  describe('enrichIOC — confidence feedback loop (#4)', () => {
    let repo: EnrichmentRepository;
    let costTracker: EnrichmentCostTracker;

    beforeEach(() => {
      repo = mockRepo();
      costTracker = new EnrichmentCostTracker();
    });

    it('updates IOC confidence after enrichment', async () => {
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, true, logger);
      await service.enrichIOC(buildJob());

      expect(repo.updateConfidence).toHaveBeenCalledOnce();
      const [iocId, newConfidence] = (repo.updateConfidence as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(iocId).toBe('00000000-0000-0000-0000-000000000001');
      expect(newConfidence).toBeGreaterThanOrEqual(0);
      expect(newConfidence).toBeLessThanOrEqual(100);
    });

    it('does not update confidence when enrichment is skipped', async () => {
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, false, logger);
      await service.enrichIOC(buildJob());

      expect(repo.updateConfidence).not.toHaveBeenCalled();
    });

    it('does not update confidence when no results', async () => {
      const vtProvider = mockVT({ supports: vi.fn().mockReturnValue(false) });
      const abuseProvider = mockAbuse({ supports: vi.fn().mockReturnValue(false) });
      const service = new EnrichmentService(repo, vtProvider, abuseProvider, null, costTracker, true, logger);
      await service.enrichIOC(buildJob());

      expect(repo.updateConfidence).not.toHaveBeenCalled();
    });

    it('continues gracefully if confidence update fails', async () => {
      (repo.updateConfidence as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, true, logger);

      // Should not throw
      const result = await service.enrichIOC(buildJob());
      expect(result.enrichmentStatus).toBe('enriched');
    });
  });

  // ===== Session 22: Redis Enrichment Cache (#6) =====

  describe('enrichIOC — cache integration (#6)', () => {
    let repo: EnrichmentRepository;
    let costTracker: EnrichmentCostTracker;

    beforeEach(() => {
      repo = mockRepo();
      costTracker = new EnrichmentCostTracker();
    });

    it('returns cached result when cache hit', async () => {
      const cachedResult = {
        vtResult: null, abuseipdbResult: null, haikuResult: null,
        enrichedAt: '2026-03-22T00:00:00Z', enrichmentStatus: 'enriched' as const,
        failureReason: null, externalRiskScore: 42, costBreakdown: null,
      };
      const cache = mockCache({ get: vi.fn().mockResolvedValue(cachedResult) });
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, true, logger, cache);

      const result = await service.enrichIOC(buildJob());

      expect(result.externalRiskScore).toBe(42);
      expect(repo.updateEnrichment).not.toHaveBeenCalled();
    });

    it('caches result after successful enrichment', async () => {
      const cache = mockCache();
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, true, logger, cache);

      await service.enrichIOC(buildJob());

      expect(cache.set).toHaveBeenCalledOnce();
      const [iocType, value] = (cache.set as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(iocType).toBe('ip');
      expect(value).toBe('185.220.101.34');
    });

    it('does not cache failed enrichment', async () => {
      const vtProvider = mockVT({ lookup: vi.fn().mockRejectedValue(new Error('VT down')) });
      const abuseProvider = mockAbuse({ lookup: vi.fn().mockRejectedValue(new Error('Abuse down')) });
      const cache = mockCache();
      const service = new EnrichmentService(repo, vtProvider, abuseProvider, null, costTracker, true, logger, cache);

      await service.enrichIOC(buildJob());

      expect(cache.set).not.toHaveBeenCalled();
    });

    it('skips cache when disabled', async () => {
      const cache = mockCache({ isAvailable: vi.fn().mockReturnValue(false) });
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, true, logger, cache);

      await service.enrichIOC(buildJob());

      expect(cache.get).not.toHaveBeenCalled();
    });

    it('works normally without cache (undefined)', async () => {
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, true, logger);
      const result = await service.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('enriched');
    });
  });

  // ===== computeRiskScore function =====

  describe('computeRiskScore', () => {
    const vt = { malicious: 15, suspicious: 2, harmless: 50, undetected: 3, totalEngines: 70, detectionRate: 21, tags: [], lastAnalysisDate: null };
    const abuse = { abuseConfidenceScore: 85, totalReports: 42, numDistinctUsers: 12, lastReportedAt: null, isp: '', countryCode: '', usageType: '', isWhitelisted: false, isTor: false };
    const haiku: HaikuTriageResult = {
      riskScore: 70, confidence: 80, severity: 'HIGH', threatCategory: 'c2_server', reasoning: '', tags: [],
      inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0,
      scoreJustification: '', evidenceSources: [], uncertaintyFactors: [],
      mitreTechniques: [], isFalsePositive: false, falsePositiveReason: null,
      malwareFamilies: [], attributedActors: [], recommendedActions: [],
    };

    it('VT+Abuse+Haiku+base = 54', () => {
      expect(computeRiskScore(vt, abuse, haiku, 50)).toBe(54);
    });

    it('VT+Abuse+base (no Haiku) = 46 (backward compat)', () => {
      expect(computeRiskScore(vt, abuse, null, 50)).toBe(46);
    });

    it('VT+base only (no Abuse, no Haiku) = 36', () => {
      expect(computeRiskScore(vt, null, null, 50)).toBe(36);
    });

    it('base only (no external providers) = 50', () => {
      expect(computeRiskScore(null, null, null, 50)).toBe(50);
    });

    it('Haiku+base (no VT, no Abuse) = 58', () => {
      // haiku(70)*0.25 + base(50)*0.75 = 17.5 + 37.5 = 55
      expect(computeRiskScore(null, null, haiku, 50)).toBe(55);
    });

    it('all scores at 100 = 100', () => {
      const vt100 = { ...vt, detectionRate: 100 };
      const abuse100 = { ...abuse, abuseConfidenceScore: 100 };
      const haiku100 = { ...haiku, riskScore: 100 };
      expect(computeRiskScore(vt100, abuse100, haiku100, 100)).toBe(100);
    });

    it('all scores at 0 = 0', () => {
      const vt0 = { ...vt, detectionRate: 0 };
      const abuse0 = { ...abuse, abuseConfidenceScore: 0 };
      const haiku0 = { ...haiku, riskScore: 0 };
      expect(computeRiskScore(vt0, abuse0, haiku0, 0)).toBe(0);
    });

    it('clamps result to 0-100 range', () => {
      expect(computeRiskScore(vt, abuse, haiku, 100)).toBeLessThanOrEqual(100);
      expect(computeRiskScore(vt, abuse, haiku, 0)).toBeGreaterThanOrEqual(0);
    });
  });
});
