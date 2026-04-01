import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NormalizationService, buildDedupeHash, type NormalizationResult,
  escalateTLP, escalateSeverity, clampConfidence, batchPenalty,
  configureClassifier, classifySeverity,
} from '../src/service.js';
import { getUnknownTypeStats, resetUnknownTypeCounter } from '../src/stats-counter.js';
import type { IOCRepository } from '../src/repository.js';
import type { NormalizeBatchJob } from '../src/schema.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function mockRepo(overrides: Partial<IOCRepository> = {}): IOCRepository {
  return {
    upsert: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    findById: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getStats: vi.fn().mockResolvedValue({ total: 0, byType: {}, byLifecycle: {}, bySeverity: {} }),
    findByDedupeHash: vi.fn().mockResolvedValue(null),
    findFeedReliability: vi.fn().mockResolvedValue(50),
    ...overrides,
  } as unknown as IOCRepository;
}

function buildJob(iocs: NormalizeBatchJob['iocs'] = []): NormalizeBatchJob {
  return {
    articleId: '00000000-0000-0000-0000-000000000001',
    feedSourceId: '00000000-0000-0000-0000-000000000002',
    tenantId: '00000000-0000-0000-0000-000000000003',
    feedName: 'Test Feed',
    iocs,
  };
}

describe('NormalizationService', () => {
  let repo: IOCRepository;
  let service: NormalizationService;

  beforeEach(() => {
    repo = mockRepo();
    service = new NormalizationService(repo, logger);
  });

  describe('normalizeBatch', () => {
    it('creates new IOC records for valid IPs', async () => {
      const job = buildJob([
        { rawValue: '44.55.66.77', rawType: 'ip' },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
      expect(repo.upsert).toHaveBeenCalledOnce();
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        iocType: 'ip',
        normalizedValue: '44.55.66.77',
        tenantId: job.tenantId,
      }));
    });

    it('creates IOC records for hashes', async () => {
      const md5 = '5d41402abc4b2a76b9719d911017c592';
      const job = buildJob([
        { rawValue: md5, rawType: 'md5' },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.created).toBe(1);
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        iocType: 'hash_md5',
        normalizedValue: md5.toLowerCase(),
      }));
    });

    it('creates IOC records for domains', async () => {
      const job = buildJob([
        { rawValue: 'Evil-Malware.XYZ', rawType: 'domain' },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.created).toBe(1);
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        iocType: 'domain',
        normalizedValue: 'evil-malware.xyz',
      }));
    });

    it('creates IOC records for CVEs', async () => {
      const job = buildJob([
        { rawValue: 'cve-2024-12345', rawType: 'cve' },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.created).toBe(1);
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        iocType: 'cve',
        normalizedValue: 'CVE-2024-12345',
      }));
    });

    it('creates IOC records for URLs', async () => {
      const job = buildJob([
        { rawValue: 'https://malware-dropper.xyz/payload.exe', rawType: 'url' },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.created).toBe(1);
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        iocType: 'url',
      }));
    });

    it('skips unknown IOC types', async () => {
      const job = buildJob([
        { rawValue: 'some random text', rawType: 'unknown' },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('updates existing IOCs (dedup merge)', async () => {
      const existing = {
        id: 'existing-id',
        tenantId: '00000000-0000-0000-0000-000000000003',
        iocType: 'ip',
        value: '88.99.11.22',
        normalizedValue: '88.99.11.22',
        dedupeHash: 'abc',
        lifecycle: 'active',
        tags: ['old-tag'],
        mitreAttack: ['T1234'],
        malwareFamilies: [],
        threatActors: [],
        firstSeen: new Date('2025-01-01'),
        lastSeen: new Date('2025-01-01'),
      };

      repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
      service = new NormalizationService(repo, logger);

      const job = buildJob([
        {
          rawValue: '88.99.11.22',
          rawType: 'ip',
          extractionMeta: { tags: ['new-tag'], mitreAttack: ['T5678'] },
        },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        tags: expect.arrayContaining(['old-tag', 'new-tag']),
        mitreAttack: expect.arrayContaining(['T1234', 'T5678']),
        lifecycle: 'active', // Preserves existing lifecycle
      }));
    });

    it('handles multiple IOCs in a batch', async () => {
      const job = buildJob([
        { rawValue: '1.2.3.4', rawType: 'ip' },
        { rawValue: '5.6.7.8', rawType: 'ip' },
        { rawValue: 'evil.com', rawType: 'domain' },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.created).toBe(3);
      expect(repo.upsert).toHaveBeenCalledTimes(3);
    });

    it('counts errors without crashing batch', async () => {
      repo = mockRepo({
        upsert: vi.fn().mockRejectedValueOnce(new Error('DB error')).mockResolvedValue({ id: 'ok' }),
        findByDedupeHash: vi.fn().mockResolvedValue(null),
      });
      service = new NormalizationService(repo, logger);

      const job = buildJob([
        { rawValue: '1.2.3.4', rawType: 'ip' },
        { rawValue: '5.6.7.8', rawType: 'ip' },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.errors).toBe(1);
      expect(result.created).toBe(1);
    });

    it('maps ingestion IOC types to Prisma enum', async () => {
      const job = buildJob([
        { rawValue: '5d41402abc4b2a76b9719d911017c592', rawType: 'md5' },
        { rawValue: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3', rawType: 'sha1' },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.created).toBe(2);
      const calls = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].iocType).toBe('hash_md5');
      expect(calls[1][0].iocType).toBe('hash_sha1');
    });

    it('applies extraction metadata (threat actors, malware, MITRE)', async () => {
      const job = buildJob([
        {
          rawValue: '45.67.89.10',
          rawType: 'ip',
          extractionMeta: {
            threatActors: ['APT28'],
            malwareFamilies: ['Emotet'],
            mitreAttack: ['T1059'],
            tlp: 'RED',
            severity: 'critical',
          },
        },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.created).toBe(1);
      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
        threatActors: ['APT28'],
        malwareFamilies: ['Emotet'],
        mitreAttack: ['T1059'],
        tlp: 'red',
        severity: 'critical',
      }));
    });

    it('applies calibrated confidence from ingestion', async () => {
      const job = buildJob([
        { rawValue: '45.67.89.10', rawType: 'ip', calibratedConfidence: 85, corroborationCount: 3 },
      ]);

      const result = await service.normalizeBatch(job);

      expect(result.created).toBe(1);
      const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Confidence should be computed via composite formula, not raw pass-through
      expect(call.confidence).toBeGreaterThan(0);
      expect(call.confidence).toBeLessThanOrEqual(100);
    });

    it('handles empty batch gracefully', async () => {
      const job = buildJob([]);
      const result = await service.normalizeBatch(job);

      expect(result).toEqual({ created: 0, updated: 0, skipped: 0, filtered: 0, reactivated: 0, errors: 0, bloomHits: 0, bloomMisses: 0 });
      expect(repo.upsert).not.toHaveBeenCalled();
    });
  });
});

describe('Improvement #1: Live confidence decay on re-sighting', () => {
  it('applies time decay for existing IOCs based on firstSeen', async () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '8.8.4.4', normalizedValue: '8.8.4.4',
      dedupeHash: 'abc', lifecycle: 'active',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: oldDate, lastSeen: oldDate, enrichmentData: { sightingCount: 1, sourceFeedIds: ['feed-old'] },
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '8.8.4.4', rawType: 'ip' }]);
    await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // With 60-day decay, confidence should be lower than max
    expect(call.confidence).toBeLessThan(100);
    expect(call.confidence).toBeGreaterThan(0);
    // enrichmentData should track daysSinceFirstSeen
    expect(call.enrichmentData.daysSinceFirstSeen).toBeGreaterThan(50);
  });
});

describe('Improvement #2: Feed reliability from DB', () => {
  it('queries feed reliability and uses it in confidence calc', async () => {
    const repo = mockRepo({ findFeedReliability: vi.fn().mockResolvedValue(90) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '44.55.66.77', rawType: 'ip' }]);
    await service.normalizeBatch(job);

    expect(repo.findFeedReliability).toHaveBeenCalledWith(job.feedSourceId);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.feedReliability).toBe(90);
  });

  it('falls back to 50 when feed not found', async () => {
    const repo = mockRepo({ findFeedReliability: vi.fn().mockResolvedValue(null) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '44.55.66.77', rawType: 'ip' }]);
    await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.feedReliability).toBe(50);
  });
});

describe('Improvement #3: Sighting count + source diversity', () => {
  it('increments sighting count on re-sighting', async () => {
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '1.2.3.4', normalizedValue: '1.2.3.4',
      dedupeHash: 'abc', lifecycle: 'active',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(), lastSeen: new Date(),
      enrichmentData: { sightingCount: 3, sourceFeedIds: ['feed-1', 'feed-2'] },
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '1.2.3.4', rawType: 'ip' }]);
    await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.sightingCount).toBe(4);
    // Should include the new feed source
    expect(call.enrichmentData.sourceFeedIds).toContain(job.feedSourceId);
    expect(call.enrichmentData.sourceFeedIds).toContain('feed-1');
    expect(call.enrichmentData.sourceFeedIds).toContain('feed-2');
  });

  it('starts at sighting count 1 for new IOCs', async () => {
    const repo = mockRepo();
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '99.88.77.66', rawType: 'ip' }]);
    await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.sightingCount).toBe(1);
    expect(call.enrichmentData.sourceFeedIds).toEqual([job.feedSourceId]);
  });
});

describe('Improvement #4: Lifecycle transitions', () => {
  it('sets lifecycle to NEW for first sighting', async () => {
    const repo = mockRepo();
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '5.6.7.8', rawType: 'ip' }]);
    await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.lifecycle).toBe('new');
  });

  it('transitions NEW → ACTIVE on second sighting', async () => {
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '5.6.7.8', normalizedValue: '5.6.7.8',
      dedupeHash: 'abc', lifecycle: 'new',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(), lastSeen: new Date(), enrichmentData: null,
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '5.6.7.8', rawType: 'ip' }]);
    await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.lifecycle).toBe('active');
  });

  it('reactivates EXPIRED IOCs (APT infrastructure recycling)', async () => {
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '5.6.7.8', normalizedValue: '5.6.7.8',
      dedupeHash: 'abc', lifecycle: 'expired',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      lastSeen: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      enrichmentData: null,
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '5.6.7.8', rawType: 'ip' }]);
    const result = await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.lifecycle).toBe('reactivated');
    expect(result.reactivated).toBe(1);
    // Confidence should be boosted by 1.2x
    expect(call.enrichmentData.autoSeverityReason).toContain('reactivated');
  });

  it('reactivates AGING IOCs', async () => {
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'domain', value: 'old.evil.com', normalizedValue: 'old.evil.com',
      dedupeHash: 'abc', lifecycle: 'aging',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(), lastSeen: new Date(), enrichmentData: null,
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: 'old.evil.com', rawType: 'domain' }]);
    await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.lifecycle).toBe('reactivated');
  });

  it('preserves FALSE_POSITIVE — never overrides analyst decisions', async () => {
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '5.6.7.8', normalizedValue: '5.6.7.8',
      dedupeHash: 'abc', lifecycle: 'false_positive',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(), lastSeen: new Date(), enrichmentData: null,
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '5.6.7.8', rawType: 'ip' }]);
    await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.lifecycle).toBe('false_positive');
  });

  it('preserves REVOKED — feed retraction respected', async () => {
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '5.6.7.8', normalizedValue: '5.6.7.8',
      dedupeHash: 'abc', lifecycle: 'revoked',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(), lastSeen: new Date(), enrichmentData: null,
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([{ rawValue: '5.6.7.8', rawType: 'ip' }]);
    await service.normalizeBatch(job);

    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.lifecycle).toBe('revoked');
  });
});

describe('Improvement #5: Quality filters in normalization', () => {
  it('filters bogon IPs (result.filtered counter)', async () => {
    const repo = mockRepo();
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([
      { rawValue: '192.168.1.1', rawType: 'ip' },    // bogon — filtered
      { rawValue: '10.0.0.1', rawType: 'ip' },        // bogon — filtered
      { rawValue: '44.55.66.77', rawType: 'ip' },     // public — passes
    ]);
    const result = await service.normalizeBatch(job);

    expect(result.filtered).toBe(2);
    expect(result.created).toBe(1);
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('filters safe domains', async () => {
    const repo = mockRepo();
    const service = new NormalizationService(repo, pino({ level: 'silent' }));

    const job = buildJob([
      { rawValue: 'google.com', rawType: 'domain' },
      { rawValue: 'evil-c2.xyz', rawType: 'domain' },
    ]);
    const result = await service.normalizeBatch(job);

    expect(result.filtered).toBe(1);
    expect(result.created).toBe(1);
  });
});

describe('buildDedupeHash', () => {
  it('produces deterministic hash', () => {
    const h1 = buildDedupeHash('ip', '1.2.3.4', 'tenant-1');
    const h2 = buildDedupeHash('ip', '1.2.3.4', 'tenant-1');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it('produces different hash for different values', () => {
    const h1 = buildDedupeHash('ip', '1.2.3.4', 'tenant-1');
    const h2 = buildDedupeHash('ip', '5.6.7.8', 'tenant-1');
    expect(h1).not.toBe(h2);
  });

  it('produces different hash for different tenants', () => {
    const h1 = buildDedupeHash('ip', '1.2.3.4', 'tenant-1');
    const h2 = buildDedupeHash('ip', '1.2.3.4', 'tenant-2');
    expect(h1).not.toBe(h2);
  });

  it('produces different hash for different types', () => {
    const h1 = buildDedupeHash('ip', '1.2.3.4', 'tenant-1');
    const h2 = buildDedupeHash('domain', '1.2.3.4', 'tenant-1');
    expect(h1).not.toBe(h2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// New improvement tests
// ═══════════════════════════════════════════════════════════════════

describe('Improvement A1: Type-specific confidence decay', () => {
  it('hashes retain more confidence than IPs after 60 days', async () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const makeExisting = (type: string, value: string) => ({
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: type, value, normalizedValue: value,
      dedupeHash: 'abc', lifecycle: 'active', severity: 'low', tlp: 'amber',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: oldDate, lastSeen: oldDate, enrichmentData: { sightingCount: 1, sourceFeedIds: ['feed-old'] },
    });

    // Hash IOC
    const hashRepo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(makeExisting('hash_sha256', 'a'.repeat(64))) });
    const hashService = new NormalizationService(hashRepo, pino({ level: 'silent' }));
    const hashJob = buildJob([{ rawValue: 'a'.repeat(64), rawType: 'sha256' }]);
    await hashService.normalizeBatch(hashJob);
    const hashConf = (hashRepo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0].confidence;

    // IP IOC
    const ipRepo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(makeExisting('ip', '8.8.4.4')) });
    const ipService = new NormalizationService(ipRepo, pino({ level: 'silent' }));
    const ipJob = buildJob([{ rawValue: '8.8.4.4', rawType: 'ip' }]);
    await ipService.normalizeBatch(ipJob);
    const ipConf = (ipRepo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0].confidence;

    // Hash should have significantly higher confidence than IP after same time
    expect(hashConf).toBeGreaterThan(ipConf);
  });

  it('stores decayRate in enrichmentData', async () => {
    const repo = mockRepo();
    const service = new NormalizationService(repo, pino({ level: 'silent' }));
    const job = buildJob([{ rawValue: '44.55.66.77', rawType: 'ip' }]);
    await service.normalizeBatch(job);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.decayRate).toBe(0.05); // IP decay rate
  });
});

describe('Improvement A4: TLP escalation protection', () => {
  it('escalateTLP never downgrades', () => {
    expect(escalateTLP('red', 'green')).toBe('red');
    expect(escalateTLP('red', 'white')).toBe('red');
    expect(escalateTLP('amber', 'red')).toBe('red');
    expect(escalateTLP('green', 'amber')).toBe('amber');
    expect(escalateTLP('white', 'white')).toBe('white');
  });

  it('preserves higher TLP on re-sighting with lower TLP', async () => {
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '5.6.7.8', normalizedValue: '5.6.7.8',
      dedupeHash: 'abc', lifecycle: 'active', severity: 'low', tlp: 'red',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(), lastSeen: new Date(), enrichmentData: null,
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));
    const job = buildJob([{ rawValue: '5.6.7.8', rawType: 'ip', extractionMeta: { tlp: 'GREEN' } }]);
    await service.normalizeBatch(job);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tlp).toBe('red'); // preserved RED, not downgraded to GREEN
  });
});

describe('Improvement A5: Confidence floor/ceiling per type', () => {
  it('clampConfidence enforces floor for IP', () => {
    expect(clampConfidence(5, 'ip')).toBe(20);   // floor 20
    expect(clampConfidence(50, 'ip')).toBe(50);   // within range
    expect(clampConfidence(95, 'ip')).toBe(90);   // ceiling 90
  });

  it('clampConfidence enforces floor for hash_sha256', () => {
    expect(clampConfidence(10, 'hash_sha256')).toBe(60);  // floor 60
    expect(clampConfidence(100, 'hash_sha256')).toBe(100); // ceiling 100
  });

  it('clampConfidence allows full range for unknown types', () => {
    expect(clampConfidence(0, 'weird_type')).toBe(0);
    expect(clampConfidence(100, 'weird_type')).toBe(100);
  });

  it('new IP IOC confidence is at least 20 (floor)', async () => {
    const repo = mockRepo({ findFeedReliability: vi.fn().mockResolvedValue(10) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));
    const job = buildJob([{ rawValue: '44.55.66.77', rawType: 'ip', calibratedConfidence: 5 }]);
    await service.normalizeBatch(job);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.confidence).toBeGreaterThanOrEqual(20);
  });
});

describe('Improvement A6: Batch anomaly scoring', () => {
  it('batchPenalty returns 1.0 for small batches', () => {
    expect(batchPenalty(1)).toBe(1.0);
    expect(batchPenalty(10)).toBe(1.0);
  });

  it('batchPenalty penalizes medium batches', () => {
    expect(batchPenalty(15)).toBe(0.9);
    expect(batchPenalty(30)).toBe(0.9);
  });

  it('batchPenalty penalizes large batches', () => {
    expect(batchPenalty(50)).toBe(0.7);
    expect(batchPenalty(100)).toBe(0.7);
  });

  it('batchPenalty heavily penalizes bulk dumps', () => {
    expect(batchPenalty(101)).toBe(0.5);
    expect(batchPenalty(500)).toBe(0.5);
  });

  it('stores batchPenalty in enrichmentData', async () => {
    const repo = mockRepo();
    const service = new NormalizationService(repo, pino({ level: 'silent' }));
    const job = buildJob([{ rawValue: '44.55.66.77', rawType: 'ip' }]);
    await service.normalizeBatch(job);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.batchPenalty).toBe(1.0);
  });
});

describe('Improvement C2: 3-signal confidence weights', () => {
  it('does not include communityVotes in enrichmentData', async () => {
    const repo = mockRepo();
    const service = new NormalizationService(repo, pino({ level: 'silent' }));
    const job = buildJob([{ rawValue: '44.55.66.77', rawType: 'ip' }]);
    await service.normalizeBatch(job);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData).not.toHaveProperty('communityVotes');
  });
});

describe('G2a: Feed reliability TTL cache', () => {
  it('calls findFeedReliability once for same feedId within TTL', async () => {
    const findFeedReliability = vi.fn().mockResolvedValue(75);
    const repo = mockRepo({ findFeedReliability });
    const service = new NormalizationService(repo, logger);
    const job = buildJob([{ rawValue: '1.2.3.4', rawType: 'ip' }]);

    // Two batches with same feedSourceId — DB should only be called once
    await service.normalizeBatch(job);
    await service.normalizeBatch(job);

    expect(findFeedReliability).toHaveBeenCalledTimes(1);
  });

  it('returns cached reliability score on second call', async () => {
    const findFeedReliability = vi.fn().mockResolvedValue(88);
    const repo = mockRepo({ findFeedReliability });
    const service = new NormalizationService(repo, logger);
    const job = buildJob([{ rawValue: '9.8.7.6', rawType: 'ip' }]);

    await service.normalizeBatch(job);
    await service.normalizeBatch(job);

    // Feed reliability should be 88 (from cache, not 50 default)
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.feedReliability).toBe(88);
  });

  it('calls DB again after TTL expires (using time-mock)', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const findFeedReliability = vi.fn().mockResolvedValue(60);
    const repo = mockRepo({ findFeedReliability });
    const service = new NormalizationService(repo, logger);
    const job = buildJob([{ rawValue: '5.5.5.5', rawType: 'ip' }]);

    await service.normalizeBatch(job);
    expect(findFeedReliability).toHaveBeenCalledTimes(1);

    // Advance time past TTL (5 min + 1ms)
    vi.setSystemTime(now + 5 * 60 * 1000 + 1);
    await service.normalizeBatch(job);

    expect(findFeedReliability).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('different feedIds each get their own cache entry', async () => {
    const findFeedReliability = vi.fn().mockResolvedValue(70);
    const repo = mockRepo({ findFeedReliability });
    const service = new NormalizationService(repo, logger);

    const jobA = { ...buildJob([{ rawValue: '1.1.1.1', rawType: 'ip' }]), feedSourceId: 'feed-a' };
    const jobB = { ...buildJob([{ rawValue: '2.2.2.2', rawType: 'ip' }]), feedSourceId: 'feed-b' };

    await service.normalizeBatch(jobA);
    await service.normalizeBatch(jobB);
    // Each unique feedId triggers one DB call
    expect(findFeedReliability).toHaveBeenCalledTimes(2);

    // Third call to feed-a should use cache (no new DB call)
    await service.normalizeBatch(jobA);
    expect(findFeedReliability).toHaveBeenCalledTimes(2);
  });
});

describe('Improvement C3: Severity escalation protection', () => {
  it('escalateSeverity never downgrades', () => {
    expect(escalateSeverity('critical', 'low')).toBe('critical');
    expect(escalateSeverity('high', 'medium')).toBe('high');
    expect(escalateSeverity('low', 'critical')).toBe('critical');
    expect(escalateSeverity('info', 'info')).toBe('info');
  });

  it('preserves higher severity on re-sighting with lower context', async () => {
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '5.6.7.8', normalizedValue: '5.6.7.8',
      dedupeHash: 'abc', lifecycle: 'active', severity: 'critical', tlp: 'amber',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(), lastSeen: new Date(), enrichmentData: null,
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));
    // Re-sighting with no threat context (would classify as LOW for IP)
    const job = buildJob([{ rawValue: '5.6.7.8', rawType: 'ip' }]);
    await service.normalizeBatch(job);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.severity).toBe('critical'); // preserved, not downgraded
  });
});

describe('Improvement B3: Confidence history tracking', () => {
  it('creates initial confidence history entry for new IOCs', async () => {
    const repo = mockRepo();
    const service = new NormalizationService(repo, pino({ level: 'silent' }));
    const job = buildJob([{ rawValue: '44.55.66.77', rawType: 'ip' }]);
    await service.normalizeBatch(job);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.confidenceHistory).toHaveLength(1);
    expect(call.enrichmentData.confidenceHistory[0].score).toBe(call.confidence);
    expect(call.enrichmentData.confidenceHistory[0].source).toBe(job.feedSourceId);
  });

  it('appends to existing confidence history on re-sighting', async () => {
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '5.6.7.8', normalizedValue: '5.6.7.8',
      dedupeHash: 'abc', lifecycle: 'active', severity: 'low', tlp: 'amber',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(), lastSeen: new Date(),
      enrichmentData: {
        sightingCount: 1, sourceFeedIds: ['old-feed'],
        confidenceHistory: [{ date: '2026-03-20', score: 50, source: 'old-feed' }],
      },
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));
    const job = buildJob([{ rawValue: '5.6.7.8', rawType: 'ip' }]);
    await service.normalizeBatch(job);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.confidenceHistory).toHaveLength(2);
    expect(call.enrichmentData.confidenceHistory[0].source).toBe('old-feed');
    expect(call.enrichmentData.confidenceHistory[1].source).toBe(job.feedSourceId);
  });

  it('caps confidence history at 20 entries', async () => {
    const longHistory = Array.from({ length: 25 }, (_, i) => ({
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      score: 50 + i,
      source: `feed-${i}`,
    }));
    const existing = {
      id: 'e-1', tenantId: '00000000-0000-0000-0000-000000000003',
      iocType: 'ip', value: '5.6.7.8', normalizedValue: '5.6.7.8',
      dedupeHash: 'abc', lifecycle: 'active', severity: 'low', tlp: 'amber',
      tags: [], mitreAttack: [], malwareFamilies: [], threatActors: [],
      firstSeen: new Date(), lastSeen: new Date(),
      enrichmentData: { sightingCount: 25, sourceFeedIds: ['feed-1'], confidenceHistory: longHistory },
    };
    const repo = mockRepo({ findByDedupeHash: vi.fn().mockResolvedValue(existing) });
    const service = new NormalizationService(repo, pino({ level: 'silent' }));
    const job = buildJob([{ rawValue: '5.6.7.8', rawType: 'ip' }]);
    await service.normalizeBatch(job);
    const call = (repo.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.enrichmentData.confidenceHistory.length).toBeLessThanOrEqual(20);
  });
});

describe('G4b: configureClassifier — extensible severity sets', () => {
  // Reset between tests to avoid cross-contamination
  beforeEach(() => {
    configureClassifier({ extraRansomwareFamilies: [], extraNationStateActors: [] });
  });

  it('known ransomware family is classified critical without configuration', () => {
    const result = classifySeverity({ iocType: 'domain', threatActors: [], malwareFamilies: ['lockbit'], mitreAttack: [], corroborationCount: 1 });
    expect(result).toBe('critical');
  });

  it('new ransomware family defaults to medium without configuration', () => {
    const result = classifySeverity({ iocType: 'domain', threatActors: [], malwareFamilies: ['blackbasta'], mitreAttack: [], corroborationCount: 1 });
    expect(result).not.toBe('critical');
  });

  it('after configureClassifier, new ransomware is classified critical', () => {
    configureClassifier({ extraRansomwareFamilies: ['blackbasta', 'play2'] });
    const result = classifySeverity({ iocType: 'domain', threatActors: [], malwareFamilies: ['blackbasta'], mitreAttack: [], corroborationCount: 1 });
    expect(result).toBe('critical');
  });

  it('configureClassifier works for new nation-state actors', () => {
    configureClassifier({ extraNationStateActors: ['phantom panda'] });
    const result = classifySeverity({ iocType: 'ip', threatActors: ['Phantom Panda'], malwareFamilies: [], mitreAttack: [], corroborationCount: 1 });
    expect(result).toBe('high');
  });

  it('configureClassifier is case-insensitive for families', () => {
    configureClassifier({ extraRansomwareFamilies: ['BlackBasta'] });
    const result = classifySeverity({ iocType: 'domain', threatActors: [], malwareFamilies: ['BLACKBASTA'], mitreAttack: [], corroborationCount: 1 });
    expect(result).toBe('critical');
  });

  it('empty arrays do not reset existing sets', () => {
    configureClassifier({ extraRansomwareFamilies: [] });
    const result = classifySeverity({ iocType: 'domain', threatActors: [], malwareFamilies: ['lockbit'], mitreAttack: [], corroborationCount: 1 });
    expect(result).toBe('critical');
  });
});

describe('unknownTypeCount stats counter', () => {
  let repo: IOCRepository;
  let service: NormalizationService;

  beforeEach(() => {
    resetUnknownTypeCounter();
    repo = {
      upsert: vi.fn().mockResolvedValue({ id: 'mock-id' }),
      findById: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue({ data: [], total: 0 }),
      getStats: vi.fn().mockResolvedValue({ total: 0, byType: {}, byLifecycle: {}, bySeverity: {} }),
      findByDedupeHash: vi.fn().mockResolvedValue(null),
      findFeedReliability: vi.fn().mockResolvedValue(50),
    } as unknown as IOCRepository;
    service = new NormalizationService(repo, pino({ level: 'silent' }));
  });

  it('starts at zero — resets on service restart', () => {
    const stats = getUnknownTypeStats();
    expect(stats.unknownTypeCount).toBe(0);
    expect(stats.lastUnknownType).toBeNull();
  });

  it('increments counter and records rawType when IOC type is unknown', async () => {
    const job: NormalizeBatchJob = {
      articleId: '00000000-0000-0000-0000-000000000001',
      feedSourceId: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000003',
      feedName: 'Test Feed',
      iocs: [{ rawValue: 'INVALID_IOC_12345', rawType: 'yara_rule' }],
    };
    await service.normalizeBatch(job);
    const stats = getUnknownTypeStats();
    expect(stats.unknownTypeCount).toBe(1);
    expect(stats.lastUnknownType).toBe('yara_rule');
  });

  it('accumulates across multiple unknown IOCs and tracks the last rawType seen', async () => {
    const job: NormalizeBatchJob = {
      articleId: '00000000-0000-0000-0000-000000000001',
      feedSourceId: '00000000-0000-0000-0000-000000000002',
      tenantId: '00000000-0000-0000-0000-000000000003',
      feedName: 'Test Feed',
      iocs: [
        { rawValue: 'INVALID_IOC_ONE', rawType: 'yara_rule' },
        { rawValue: 'INVALID_IOC_TWO', rawType: 'registry_key' },
      ],
    };
    await service.normalizeBatch(job);
    const stats = getUnknownTypeStats();
    expect(stats.unknownTypeCount).toBe(2);
    expect(stats.lastUnknownType).toBe('registry_key');
  });
});
