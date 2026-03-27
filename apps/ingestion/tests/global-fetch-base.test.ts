import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config
vi.mock('../src/config.js', () => ({
  getConfig: () => ({
    TI_REDIS_URL: 'redis://:testpass@localhost:6379',
  }),
}));

// Mock ioredis
const mockRedisInstance = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  quit: vi.fn().mockResolvedValue('OK'),
};
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedisInstance),
}));

// Mock bullmq Worker
let capturedProcessor: ((...args: unknown[]) => unknown) | undefined;
const mockWorkerInstance = {
  on: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
};
const mockQueueInstance = {
  add: vi.fn().mockResolvedValue({ id: 'mock-job' }),
  close: vi.fn(),
};
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: (...args: unknown[]) => unknown) => {
    capturedProcessor = processor;
    return { ...mockWorkerInstance };
  }),
  Queue: vi.fn().mockImplementation(() => mockQueueInstance),
}));

// Mock connectors
vi.mock('../src/connectors/rss.js', () => ({
  RSSConnector: vi.fn().mockImplementation(() => ({
    fetch: vi.fn().mockResolvedValue({
      articles: [
        { title: 'Test Article', content: 'Body', url: 'https://example.com/1', publishedAt: new Date(), author: null, rawMeta: {} },
        { title: 'Test Article 2', content: 'Body2', url: 'https://example.com/2', publishedAt: new Date(), author: null, rawMeta: {} },
      ],
      fetchDurationMs: 100, feedTitle: 'Test', feedDescription: null,
    }),
  })),
}));
vi.mock('../src/connectors/nvd.js', () => ({
  NVDConnector: vi.fn().mockImplementation(() => ({
    fetch: vi.fn().mockResolvedValue({ articles: [], fetchDurationMs: 0, feedTitle: null, feedDescription: null }),
  })),
}));
vi.mock('../src/connectors/taxii.js', () => ({
  TAXIIConnector: vi.fn().mockImplementation(() => ({
    fetch: vi.fn().mockResolvedValue({ articles: [], fetchDurationMs: 0, feedTitle: null, feedDescription: null }),
  })),
}));
vi.mock('../src/connectors/rest-api.js', () => ({
  RestAPIConnector: vi.fn().mockImplementation(() => ({
    fetch: vi.fn().mockResolvedValue({ articles: [], fetchDurationMs: 0, feedTitle: null, feedDescription: null }),
  })),
}));
vi.mock('../src/connectors/misp.js', () => ({
  MISPConnector: vi.fn().mockImplementation(() => ({
    fetch: vi.fn().mockResolvedValue({ articles: [], fetchDurationMs: 0, feedTitle: null, feedDescription: null }),
  })),
}));

import { createGlobalFetchWorker, type GlobalFetchJobData, type GlobalFetchResult } from '../src/workers/global-fetch-base.js';
import { Worker } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';

function createMockLogger() {
  const logger: Record<string, unknown> = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  logger.child = vi.fn().mockReturnValue(logger);
  return logger as never;
}

const FEED_ID = 'global-feed-uuid-1';

function makeCatalogEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ID,
    name: 'Test Global Feed',
    feedType: 'rss',
    url: 'https://example.com/feed.rss',
    enabled: true,
    consecutiveFailures: 0,
    totalItemsIngested: 0,
    lastFetchAt: null,
    schedule: '*/30 * * * *',
    headers: {},
    parseConfig: {},
    authConfig: {},
    ...overrides,
  };
}

function createMockDb() {
  return {
    globalFeedCatalog: {
      findUnique: vi.fn().mockResolvedValue(makeCatalogEntry()),
      update: vi.fn().mockResolvedValue(makeCatalogEntry()),
    },
    globalArticle: {
      findFirst: vi.fn().mockResolvedValue(null), // No existing articles (no dupes)
      create: vi.fn().mockResolvedValue({ id: 'article-1' }),
    },
  };
}

function makeJob(data: GlobalFetchJobData) {
  return { id: 'job-1', data } as never;
}

describe('createGlobalFetchWorker', () => {
  let db: ReturnType<typeof createMockDb>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = undefined;
    db = createMockDb();
    logger = createMockLogger();
    mockRedisInstance.get.mockResolvedValue(null);
  });

  function getProcessor() {
    createGlobalFetchWorker(
      { queueName: QUEUES.FEED_FETCH_GLOBAL_RSS, connectorType: 'rss', concurrency: 3, rateLimitSeconds: 300 },
      { db: db as never, logger, redisUrl: 'redis://:testpass@localhost:6379' },
    );
    return capturedProcessor!;
  }

  it('creates a Worker with correct queue name and concurrency', () => {
    createGlobalFetchWorker(
      { queueName: QUEUES.FEED_FETCH_GLOBAL_RSS, connectorType: 'rss', concurrency: 3, rateLimitSeconds: 300 },
      { db: db as never, logger, redisUrl: 'redis://:testpass@localhost:6379' },
    );
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    expect(workerCtor).toHaveBeenCalledTimes(1);
    expect(workerCtor.mock.calls[0][0]).toBe(QUEUES.FEED_FETCH_GLOBAL_RSS);
    expect(workerCtor.mock.calls[0][2]).toEqual(expect.objectContaining({ concurrency: 3 }));
  });

  it('processes job: fetches RSS, inserts new articles, updates stats', async () => {
    const processor = getProcessor();
    const result = await processor(makeJob({ globalFeedId: FEED_ID })) as GlobalFetchResult;

    expect(result.status).toBe('success');
    expect(result.articlesInserted).toBe(2);
    expect(db.globalArticle.create).toHaveBeenCalledTimes(2);
    expect(db.globalFeedCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FEED_ID },
        data: expect.objectContaining({ consecutiveFailures: 0 }),
      }),
    );
  });

  it('skips disabled feed entry', async () => {
    db.globalFeedCatalog.findUnique.mockResolvedValue(makeCatalogEntry({ enabled: false }));
    const processor = getProcessor();
    const result = await processor(makeJob({ globalFeedId: FEED_ID })) as GlobalFetchResult;

    expect(result.status).toBe('skipped');
    expect(db.globalArticle.create).not.toHaveBeenCalled();
  });

  it('skips feed entry not found (logs warning)', async () => {
    db.globalFeedCatalog.findUnique.mockResolvedValue(null);
    const processor = getProcessor();
    const result = await processor(makeJob({ globalFeedId: FEED_ID })) as GlobalFetchResult;

    expect(result.status).toBe('skipped');
  });

  it('deduplicates: existing URL not re-inserted', async () => {
    // First article exists, second does not
    db.globalArticle.findFirst
      .mockResolvedValueOnce({ id: 'existing-1' })
      .mockResolvedValueOnce(null);

    const processor = getProcessor();
    const result = await processor(makeJob({ globalFeedId: FEED_ID })) as GlobalFetchResult;

    expect(result.articlesInserted).toBe(1);
    expect(result.articlesSkipped).toBe(1);
    expect(db.globalArticle.create).toHaveBeenCalledTimes(1);
  });

  it('sets pipelineStatus=pending on new articles', async () => {
    const processor = getProcessor();
    await processor(makeJob({ globalFeedId: FEED_ID }));

    expect(db.globalArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pipelineStatus: 'pending' }),
      }),
    );
  });

  it('verifies globalFeedId set on inserted articles', async () => {
    const processor = getProcessor();
    await processor(makeJob({ globalFeedId: FEED_ID }));

    expect(db.globalArticle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ globalFeedId: FEED_ID }),
      }),
    );
  });

  it('rate limiting: skips if fetched within rate limit window', async () => {
    mockRedisInstance.get.mockResolvedValue(String(Date.now())); // Just fetched
    const processor = getProcessor();
    const result = await processor(makeJob({ globalFeedId: FEED_ID })) as GlobalFetchResult;

    expect(result.status).toBe('skipped');
    expect(db.globalArticle.create).not.toHaveBeenCalled();
  });

  it('updates lastFetchAt on success', async () => {
    const processor = getProcessor();
    await processor(makeJob({ globalFeedId: FEED_ID }));

    expect(db.globalFeedCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastFetchAt: expect.any(Date) }),
      }),
    );
  });

  it('resets consecutiveFailures on success', async () => {
    db.globalFeedCatalog.findUnique.mockResolvedValue(makeCatalogEntry({ consecutiveFailures: 3 }));
    const processor = getProcessor();
    await processor(makeJob({ globalFeedId: FEED_ID }));

    expect(db.globalFeedCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ consecutiveFailures: 0 }),
      }),
    );
  });

  it('returns close function that shuts down worker and redis', async () => {
    const result = createGlobalFetchWorker(
      { queueName: QUEUES.FEED_FETCH_GLOBAL_RSS, connectorType: 'rss', concurrency: 3, rateLimitSeconds: 300 },
      { db: db as never, logger, redisUrl: 'redis://:testpass@localhost:6379' },
    );
    expect(typeof result.close).toBe('function');
    await result.close();
    expect(mockWorkerInstance.close).toHaveBeenCalled();
    expect(mockRedisInstance.quit).toHaveBeenCalled();
  });
});
