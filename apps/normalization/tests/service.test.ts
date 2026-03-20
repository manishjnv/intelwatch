import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NormalizationService, buildDedupeHash, type NormalizationResult } from '../src/service.js';
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

      expect(result).toEqual({ created: 0, updated: 0, skipped: 0, filtered: 0, reactivated: 0, errors: 0 });
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
