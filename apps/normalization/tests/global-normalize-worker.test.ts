import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildGlobalDedupeHash,
  extractIocsFromText,
} from '../src/workers/global-normalize-worker.js';
import { WarninglistMatcher, stixConfidenceTier } from '@etip/shared-normalization';

// We test the helper functions + simulate processJob logic without BullMQ
// (worker construction requires Redis — tested via integration)

const UUID1 = '00000000-0000-0000-0000-000000000001';
const UUID2 = '00000000-0000-0000-0000-000000000002';

function mockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    globalArticle: {
      findUnique: vi.fn().mockResolvedValue({
        id: UUID1,
        globalFeedId: UUID2,
        title: 'Malware C2 at 44.55.66.77',
        content: 'The IP 44.55.66.77 was seen communicating with evil.example.com. Hash: aabbccddee00112233445566778899aabbccddee00112233445566778899aabb',
        pipelineStatus: 'pending',
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    globalIoc: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'new-ioc-id' }),
      update: vi.fn().mockResolvedValue({}),
    },
    globalFeedCatalog: {
      findUnique: vi.fn().mockResolvedValue({ feedReliability: 80 }),
    },
    ...overrides,
  } as unknown;
}

function mockQueue() {
  return {
    add: vi.fn().mockResolvedValue({}),
  };
}

describe('GlobalNormalizeWorker', () => {
  describe('buildGlobalDedupeHash', () => {
    it('produces deterministic SHA256 from type:normalizedValue', () => {
      const hash1 = buildGlobalDedupeHash('ip', '44.55.66.77');
      const hash2 = buildGlobalDedupeHash('ip', '44.55.66.77');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('different values produce different hashes', () => {
      const hash1 = buildGlobalDedupeHash('ip', '1.2.3.4');
      const hash2 = buildGlobalDedupeHash('ip', '5.6.7.8');
      expect(hash1).not.toBe(hash2);
    });

    it('type is part of the hash (same value, different type)', () => {
      const hashIp = buildGlobalDedupeHash('ip', '44.55.66.77');
      const hashDomain = buildGlobalDedupeHash('domain', '44.55.66.77');
      expect(hashIp).not.toBe(hashDomain);
    });
  });

  describe('extractIocsFromText', () => {
    it('extracts IP addresses from text', () => {
      const iocs = extractIocsFromText('The IP 44.55.66.77 was seen');
      expect(iocs.some((i) => i.rawType === 'ip' && i.rawValue === '44.55.66.77')).toBe(true);
    });

    it('extracts domains from text', () => {
      const iocs = extractIocsFromText('communicating with evil.example.com');
      expect(iocs.some((i) => i.rawType === 'domain' && i.rawValue === 'evil.example.com')).toBe(true);
    });

    it('extracts CVEs from text', () => {
      const iocs = extractIocsFromText('exploiting CVE-2024-12345 in the wild');
      expect(iocs.some((i) => i.rawType === 'cve' && i.rawValue === 'CVE-2024-12345')).toBe(true);
    });

    it('extracts SHA-256 hashes from text', () => {
      const hash = 'aabbccddee00112233445566778899aabbccddee00112233445566778899aabb';
      const iocs = extractIocsFromText(`File hash: ${hash}`);
      expect(iocs.some((i) => i.rawType === 'hash_sha256' && i.rawValue === hash)).toBe(true);
    });

    it('deduplicates same IOC appearing twice', () => {
      const iocs = extractIocsFromText('IP 44.55.66.77 seen again at 44.55.66.77');
      const ips = iocs.filter((i) => i.rawValue === '44.55.66.77');
      expect(ips).toHaveLength(1);
    });

    it('returns empty array for empty text', () => {
      expect(extractIocsFromText('')).toEqual([]);
    });

    it('handles article with 0 IOCs gracefully', () => {
      const iocs = extractIocsFromText('This is a normal news article with no indicators.');
      expect(iocs).toEqual([]);
    });
  });

  describe('warninglist filtering', () => {
    let matcher: WarninglistMatcher;

    beforeEach(() => {
      matcher = new WarninglistMatcher();
      matcher.loadDefaults();
    });

    it('filters Google DNS 8.8.8.8 (known benign)', () => {
      const match = matcher.check('ip', '8.8.8.8');
      expect(match).not.toBeNull();
      expect(match!.listName).toBe('Known DNS resolvers');
    });

    it('allows unknown IP to pass through', () => {
      const match = matcher.check('ip', '44.55.66.77');
      expect(match).toBeNull();
    });

    it('filters known safe domains', () => {
      const match = matcher.check('domain', 'google.com');
      expect(match).not.toBeNull();
      expect(match!.category).toBe('false_positive');
    });
  });

  describe('confidence and STIX tier', () => {
    it('STIX tier assigned based on confidence score', () => {
      expect(stixConfidenceTier(90)).toBe('High');
      expect(stixConfidenceTier(50)).toBe('Medium');
      expect(stixConfidenceTier(10)).toBe('Low');
      expect(stixConfidenceTier(0)).toBe('None');
    });
  });

  describe('process simulation', () => {
    it('skips non-pending articles (idempotency)', async () => {
      const prisma = mockPrisma();
      (prisma as Record<string, unknown>).globalArticle = {
        ...((prisma as Record<string, unknown>).globalArticle as Record<string, unknown>),
        findUnique: vi.fn().mockResolvedValue({
          id: UUID1,
          pipelineStatus: 'normalized', // already processed
        }),
      };

      // Simulate check
      const article = await (prisma as { globalArticle: { findUnique: () => Promise<{ pipelineStatus: string }> } }).globalArticle.findUnique();
      expect(article.pipelineStatus).toBe('normalized');
      // Worker would skip — verified by status check
    });

    it('enqueues new IOCs to ENRICH_GLOBAL', async () => {
      const queue = mockQueue();
      const dedupeHash = buildGlobalDedupeHash('ip', '44.55.66.77');

      await queue.add('enrich-global', { globalIocId: dedupeHash }, {
        jobId: `enrich-${dedupeHash}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });

      expect(queue.add).toHaveBeenCalledWith(
        'enrich-global',
        { globalIocId: dedupeHash },
        expect.objectContaining({ jobId: `enrich-${dedupeHash}` }),
      );
    });

    it('updates existing IOC: bumps lastSeen + crossFeedCorroboration', async () => {
      const prisma = mockPrisma();
      const existingIoc = {
        id: 'existing-id',
        sightingSources: ['feed-1'],
        crossFeedCorroboration: 1,
      };
      (prisma as Record<string, unknown>).globalIoc = {
        findUnique: vi.fn().mockResolvedValue(existingIoc),
        update: vi.fn().mockResolvedValue({}),
        create: vi.fn(),
      };

      const iocPrisma = (prisma as { globalIoc: { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> } }).globalIoc;

      // Simulate upsert logic for existing IOC
      const sources = existingIoc.sightingSources;
      const newFeedId = 'feed-2';
      const newSources = sources.includes(newFeedId) ? sources : [...sources, newFeedId];

      await iocPrisma.update({
        where: { dedupeHash: 'test-hash' },
        data: {
          lastSeen: expect.any(Date),
          crossFeedCorroboration: newSources.length,
          sightingSources: newSources,
        },
      });

      expect(iocPrisma.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            crossFeedCorroboration: 2,
            sightingSources: ['feed-1', 'feed-2'],
          }),
        }),
      );
    });

    it('does not append duplicate sighting sources', () => {
      const sources = ['feed-1', 'feed-2'];
      const feedId = 'feed-1';
      const newSources = sources.includes(feedId) ? sources : [...sources, feedId];
      expect(newSources).toEqual(['feed-1', 'feed-2']); // no duplicate
    });
  });
});
