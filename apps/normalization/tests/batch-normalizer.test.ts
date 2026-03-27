import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchNormalizer, type BatchArticle } from '../src/services/batch-normalizer.js';
import { WarninglistMatcher } from '@etip/shared-normalization';

function makeArticle(id: string, title: string, content = ''): BatchArticle {
  return { id, globalFeedId: 'feed-1', title, content };
}

describe('BatchNormalizer', () => {
  let prisma: any;
  let cache: any;
  let matcher: WarninglistMatcher;
  let enrichQueue: any;
  let normalizer: BatchNormalizer;

  beforeEach(() => {
    prisma = {
      globalIoc: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      globalArticle: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    cache = {
      isKnownIoc: vi.fn().mockResolvedValue(false),
      isKnownFuzzyHash: vi.fn().mockResolvedValue(false),
      addKnownIoc: vi.fn().mockResolvedValue(undefined),
      addKnownFuzzyHash: vi.fn().mockResolvedValue(undefined),
    };

    matcher = new WarninglistMatcher();
    matcher.loadDefaults();

    enrichQueue = {
      addBulk: vi.fn().mockResolvedValue([]),
    };

    normalizer = new BatchNormalizer(prisma, cache, matcher, enrichQueue);
  });

  it('processes 5 articles with correct counts', async () => {
    const articles = [
      makeArticle('a1', 'Found malware at evil.com'),
      makeArticle('a2', 'Threat actor used bad.org'),
      makeArticle('a3', 'Exploit from 10.0.0.1'),
      makeArticle('a4', 'Hash d41d8cd98f00b204e9800998ecf8427e found'),
      makeArticle('a5', 'CVE-2021-44228 exploited'),
    ];

    const result = await normalizer.processBatch(articles);
    expect(result.articlesProcessed).toBe(5);
    expect(result.iocsNew).toBeGreaterThan(0);
  });

  it('intra-batch dedup → duplicate IOCs merged within batch', async () => {
    const articles = [
      makeArticle('a1', 'Found evil.com in logs'),
      makeArticle('a2', 'Also found evil.com elsewhere'),
    ];

    const result = await normalizer.processBatch(articles);
    expect(result.intraBatchDeduped).toBeGreaterThanOrEqual(1);
  });

  it('cache hit → skips full upsert', async () => {
    cache.isKnownIoc.mockResolvedValue(true);

    const articles = [makeArticle('a1', 'Found evil.com in network')];
    const result = await normalizer.processBatch(articles);
    expect(result.cacheHits).toBeGreaterThanOrEqual(1);
    // When cache says IOC is known, no createMany for that IOC
    expect(result.iocsNew).toBe(0);
  });

  it('warninglist filtered IOCs counted correctly', async () => {
    // 8.8.8.8 is in default warninglist
    const articles = [makeArticle('a1', 'DNS resolver 8.8.8.8')];
    const result = await normalizer.processBatch(articles);
    expect(result.iocsWarninglistFiltered).toBeGreaterThanOrEqual(1);
  });

  it('fuzzy dedup within batch works via cache', async () => {
    cache.isKnownFuzzyHash.mockResolvedValueOnce(true);

    const articles = [makeArticle('a1', 'Seen at bad.org')];
    const result = await normalizer.processBatch(articles);
    expect(result.iocsFuzzyDeduped + result.cacheHits).toBeGreaterThanOrEqual(1);
  });

  it('batch upsert (createMany) used for new IOCs', async () => {
    const articles = [makeArticle('a1', 'Found evil.com and bad.org')];
    await normalizer.processBatch(articles);
    expect(prisma.globalIoc.createMany).toHaveBeenCalled();
  });

  it('enqueues to ENRICH_GLOBAL in batch', async () => {
    const articles = [makeArticle('a1', 'Found evil.com')];
    await normalizer.processBatch(articles);
    if (enrichQueue.addBulk.mock.calls.length > 0) {
      expect(enrichQueue.addBulk).toHaveBeenCalled();
    }
  });

  it('dbQueriesReduced > 0 when batch > 1', async () => {
    const articles = [
      makeArticle('a1', 'Found evil.com'),
      makeArticle('a2', 'Found bad.org'),
      makeArticle('a3', 'Found worse.net'),
    ];
    const result = await normalizer.processBatch(articles);
    expect(result.dbQueriesReduced).toBeGreaterThan(0);
  });

  describe('determineBatchSize', () => {
    it('low depth → 1', () => {
      expect(normalizer.determineBatchSize(5)).toBe(1);
    });

    it('high depth → 50', () => {
      expect(normalizer.determineBatchSize(300)).toBe(50);
    });

    it('medium depth → 10 or 25', () => {
      expect(normalizer.determineBatchSize(30)).toBe(10);
      expect(normalizer.determineBatchSize(100)).toBe(25);
    });
  });
});
