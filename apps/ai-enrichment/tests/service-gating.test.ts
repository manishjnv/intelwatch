import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnrichmentService } from '../src/service.js';
import { EnrichmentCostTracker } from '../src/cost-tracker.js';
import type { EnrichmentRepository } from '../src/repository.js';
import type { VirusTotalProvider } from '../src/providers/virustotal.js';
import type { AbuseIPDBProvider } from '../src/providers/abuseipdb.js';
import type { HaikuTriageProvider } from '../src/providers/haiku-triage.js';
import type { GoogleSafeBrowsingProvider } from '../src/providers/google-safe-browsing.js';
import type { IPinfoProvider } from '../src/providers/ipinfo.js';
import type { TenantBudgetService } from '../src/services/tenant-budget.js';
import type { EnrichJob, HaikuTriageResult } from '../src/schema.js';
import pino from 'pino';

vi.mock('@etip/shared-normalization', () => ({
  calculateCompositeConfidence: vi.fn(() => ({ score: 65, signals: {}, daysSinceLastSeen: 0, decayFactor: 1.0 })),
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

function mockVT(overrides: Partial<VirusTotalProvider> = {}): VirusTotalProvider {
  return {
    supports: vi.fn().mockReturnValue(true),
    lookup: vi.fn().mockResolvedValue({
      malicious: 15, suspicious: 2, harmless: 50, undetected: 3,
      totalEngines: 70, detectionRate: 21, tags: [], lastAnalysisDate: null,
    }),
    ...overrides,
  } as unknown as VirusTotalProvider;
}

function mockAbuse(overrides: Partial<AbuseIPDBProvider> = {}): AbuseIPDBProvider {
  return {
    supports: vi.fn().mockReturnValue(true),
    lookup: vi.fn().mockResolvedValue({
      abuseConfidenceScore: 85, totalReports: 42, numDistinctUsers: 12,
      lastReportedAt: null, isp: 'Evil Hosting', countryCode: 'RU',
      usageType: 'Data Center', isWhitelisted: false, isTor: false,
    }),
    ...overrides,
  } as unknown as AbuseIPDBProvider;
}

function mockIPinfo(): IPinfoProvider {
  return { supports: vi.fn().mockReturnValue(true), lookup: vi.fn().mockResolvedValue(null) } as unknown as IPinfoProvider;
}
function mockGSB(): GoogleSafeBrowsingProvider {
  return { supports: vi.fn().mockReturnValue(true), lookup: vi.fn().mockResolvedValue(null) } as unknown as GoogleSafeBrowsingProvider;
}

const DEFAULT_HAIKU_RESULT: HaikuTriageResult = {
  riskScore: 70, confidence: 80, severity: 'HIGH', threatCategory: 'c2_server',
  reasoning: 'x', tags: [], inputTokens: 120, outputTokens: 80, costUsd: 0.0002, durationMs: 400,
  scoreJustification: '', evidenceSources: [], uncertaintyFactors: [],
  mitreTechniques: [], isFalsePositive: false, falsePositiveReason: null,
  malwareFamilies: [], attributedActors: [], recommendedActions: [],
  stixLabels: [], cacheReadTokens: 0, cacheCreationTokens: 0,
};

function mockHaiku(overrides: Partial<HaikuTriageProvider> = {}): HaikuTriageProvider {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    supports: vi.fn().mockReturnValue(true),
    triage: vi.fn().mockResolvedValue(DEFAULT_HAIKU_RESULT),
    ...overrides,
  } as unknown as HaikuTriageProvider;
}

function mockTenantBudget(allowed = true): TenantBudgetService {
  return {
    checkBudget: vi.fn().mockResolvedValue({ allowed, reason: allowed ? undefined : 'plan-ai-disabled' }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
  } as unknown as TenantBudgetService;
}

function buildJob(overrides: Partial<EnrichJob> = {}): EnrichJob {
  return {
    iocId: '00000000-0000-0000-0000-000000000001',
    tenantId: '00000000-0000-0000-0000-000000000003',
    iocType: 'ip',
    normalizedValue: '185.220.101.34',
    confidence: 50,
    severity: 'critical',
    manual: false,
    ...overrides,
  };
}

describe('EnrichmentService — S164 gating', () => {
  let repo: EnrichmentRepository;
  let costTracker: EnrichmentCostTracker;

  beforeEach(() => {
    repo = mockRepo();
    costTracker = new EnrichmentCostTracker();
  });

  describe('severity gate', () => {
    it('critical + auto (not manual) → lookups run', async () => {
      const svc = new EnrichmentService(repo, mockVT(), mockAbuse(), mockHaiku(), costTracker, true, logger, undefined, 5, mockGSB(), mockIPinfo(), ['critical', 'high']);
      const result = await svc.enrichIOC(buildJob({ severity: 'critical' }));
      expect(result.enrichmentStatus).toBe('enriched');
      expect(result.vtResult).not.toBeNull();
    });

    it('low + not manual → skipped, zero provider calls, zero DB writes', async () => {
      const vt = mockVT();
      const abuse = mockAbuse();
      const haiku = mockHaiku();
      const svc = new EnrichmentService(repo, vt, abuse, haiku, costTracker, true, logger, undefined, 5, mockGSB(), mockIPinfo(), ['critical', 'high']);
      const result = await svc.enrichIOC(buildJob({ severity: 'low', manual: false }));

      expect(result.enrichmentStatus).toBe('skipped');
      expect(result.failureReason).toBe('severity-below-threshold');
      expect(vt.lookup).not.toHaveBeenCalled();
      expect(abuse.lookup).not.toHaveBeenCalled();
      expect(haiku.triage).not.toHaveBeenCalled();
      expect(repo.updateEnrichment).not.toHaveBeenCalled();
    });

    it('low + manual → runs', async () => {
      const svc = new EnrichmentService(repo, mockVT(), mockAbuse(), null, costTracker, true, logger, undefined, 5, undefined, undefined, ['critical', 'high']);
      const result = await svc.enrichIOC(buildJob({ severity: 'low', manual: true }));
      expect(result.enrichmentStatus).toBe('enriched');
      expect(repo.updateEnrichment).toHaveBeenCalledOnce();
    });
  });

  describe('lookups gate', () => {
    it('lookups off → no VT/AbuseIPDB/IPinfo/GSB calls', async () => {
      const vt = mockVT();
      const abuse = mockAbuse();
      const gsb = mockGSB();
      const ipinfo = mockIPinfo();
      const svc = new EnrichmentService(repo, vt, abuse, null, costTracker, true, logger, undefined, 5, gsb, ipinfo, ['critical', 'high'], false);
      const result = await svc.enrichIOC(buildJob());

      expect(vt.lookup).not.toHaveBeenCalled();
      expect(abuse.lookup).not.toHaveBeenCalled();
      expect(gsb.lookup).not.toHaveBeenCalled();
      expect(ipinfo.lookup).not.toHaveBeenCalled();
      expect(result.vtResult).toBeNull();
    });
  });

  describe('AI gate', () => {
    it('AI off → no Haiku, lookups still run', async () => {
      const haiku = mockHaiku();
      const svc = new EnrichmentService(repo, mockVT(), mockAbuse(), haiku, costTracker, false, logger, undefined, 5, undefined, undefined, ['critical', 'high'], true);
      const result = await svc.enrichIOC(buildJob());

      expect(haiku.triage).not.toHaveBeenCalled();
      expect(result.haikuResult).toBeNull();
      expect(result.vtResult).not.toBeNull();
      expect(result.enrichmentStatus).toBe('enriched');
    });

    it('over tenant budget → no Haiku, lookups run', async () => {
      const haiku = mockHaiku();
      const tenantBudget = mockTenantBudget(false);
      const svc = new EnrichmentService(repo, mockVT(), mockAbuse(), haiku, costTracker, true, logger, undefined, 5, undefined, undefined, ['critical', 'high'], true, tenantBudget);
      const result = await svc.enrichIOC(buildJob());

      expect(haiku.triage).not.toHaveBeenCalled();
      expect(result.haikuResult).toBeNull();
      expect(result.vtResult).not.toBeNull();
    });

    it('free-plan tenant → no Haiku even with AI on', async () => {
      const haiku = mockHaiku();
      const tenantBudget = mockTenantBudget(false); // simulates plan-ai-disabled
      const svc = new EnrichmentService(repo, mockVT(), mockAbuse(), haiku, costTracker, true, logger, undefined, 5, undefined, undefined, ['critical', 'high'], true, tenantBudget);
      const result = await svc.enrichIOC(buildJob());

      expect(haiku.triage).not.toHaveBeenCalled();
      expect(result.haikuResult).toBeNull();
    });

    it('under budget → Haiku runs and records usage on tenantBudget', async () => {
      const haiku = mockHaiku();
      const tenantBudget = mockTenantBudget(true);
      const svc = new EnrichmentService(repo, mockVT(), mockAbuse(), haiku, costTracker, true, logger, undefined, 5, undefined, undefined, ['critical', 'high'], true, tenantBudget);
      const result = await svc.enrichIOC(buildJob());

      expect(haiku.triage).toHaveBeenCalledOnce();
      expect(result.haikuResult).not.toBeNull();
      expect(tenantBudget.recordUsage).toHaveBeenCalledWith(
        buildJob().tenantId, DEFAULT_HAIKU_RESULT.inputTokens + DEFAULT_HAIKU_RESULT.outputTokens, DEFAULT_HAIKU_RESULT.costUsd,
      );
    });
  });

  describe('all-gates-off', () => {
    it('lookups off + AI off → skipped, no DB write', async () => {
      const vt = mockVT();
      const svc = new EnrichmentService(repo, vt, mockAbuse(), null, costTracker, false, logger, undefined, 5, undefined, undefined, ['critical', 'high'], false);
      const result = await svc.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('skipped');
      expect(result.failureReason).toBe('all-gates-off');
      expect(vt.lookup).not.toHaveBeenCalled();
      expect(repo.updateEnrichment).not.toHaveBeenCalled();
    });
  });
});
