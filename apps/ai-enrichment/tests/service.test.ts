import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnrichmentService } from '../src/service.js';
import type { EnrichmentRepository } from '../src/repository.js';
import type { VirusTotalProvider } from '../src/providers/virustotal.js';
import type { AbuseIPDBProvider } from '../src/providers/abuseipdb.js';
import type { EnrichJob } from '../src/schema.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function mockRepo(): EnrichmentRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByIdInternal: vi.fn().mockResolvedValue(null),
    updateEnrichment: vi.fn().mockResolvedValue({ id: 'mock' }),
    findPendingEnrichment: vi.fn().mockResolvedValue([]),
    getEnrichmentStats: vi.fn().mockResolvedValue({ total: 0, enriched: 0, pending: 0 }),
  } as unknown as EnrichmentRepository;
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
  describe('enrichIOC — AI enabled', () => {
    let service: EnrichmentService;
    let repo: EnrichmentRepository;

    beforeEach(() => {
      repo = mockRepo();
      service = new EnrichmentService(repo, mockVT(), mockAbuse(), true, logger);
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
      service = new EnrichmentService(repo, mockVT(), abuseProvider, true, logger);

      const result = await service.enrichIOC(buildJob({ iocType: 'hash_sha256', normalizedValue: 'a'.repeat(64) }));

      expect(result.enrichmentStatus).toBe('enriched');
      expect(result.vtResult).not.toBeNull();
      expect(result.abuseipdbResult).toBeNull();
    });

    it('returns partial when VT fails but AbuseIPDB succeeds', async () => {
      const vtProvider = mockVT({ lookup: vi.fn().mockRejectedValue(new Error('VT timeout')) });
      service = new EnrichmentService(repo, vtProvider, mockAbuse(), true, logger);

      const result = await service.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('partial');
      expect(result.vtResult).toBeNull();
      expect(result.abuseipdbResult).not.toBeNull();
      expect(result.failureReason).toContain('VT');
    });

    it('returns failed when all providers fail', async () => {
      const vtProvider = mockVT({ lookup: vi.fn().mockRejectedValue(new Error('VT down')) });
      const abuseProvider = mockAbuse({ lookup: vi.fn().mockRejectedValue(new Error('Abuse down')) });
      service = new EnrichmentService(repo, vtProvider, abuseProvider, true, logger);

      const result = await service.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('failed');
      expect(result.failureReason).toContain('VT');
      expect(result.failureReason).toContain('Abuse');
    });

    it('computes weighted risk score from VT + AbuseIPDB', async () => {
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
  });

  describe('enrichIOC — AI disabled', () => {
    it('returns skipped when TI_AI_ENABLED is false', async () => {
      const repo = mockRepo();
      const service = new EnrichmentService(repo, mockVT(), mockAbuse(), false, logger);

      const result = await service.enrichIOC(buildJob());

      expect(result.enrichmentStatus).toBe('skipped');
      expect(result.failureReason).toContain('TI_AI_ENABLED');
      expect(result.vtResult).toBeNull();
      expect(result.abuseipdbResult).toBeNull();
      expect(repo.updateEnrichment).not.toHaveBeenCalled();
    });
  });
});
