import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before imports
vi.mock('../src/config.js', () => ({
  getConfig: () => ({
    TI_REDIS_URL: 'redis://:testpass@localhost:6379',
    TI_MAX_CONSECUTIVE_FAILURES: 5,
  }),
}));

// Mock bullmq Worker
const mockWorkerInstance = {
  on: vi.fn(),
  close: vi.fn(),
};
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => {
    mockWorkerInstance._processor = processor;
    return mockWorkerInstance;
  }),
}));

// Mock RSS connector
vi.mock('../src/connectors/rss.js', () => ({
  RSSConnector: vi.fn().mockImplementation(() => ({
    fetch: vi.fn(),
  })),
}));

import { createFeedFetchWorker, type FeedFetchJobData } from '../src/workers/feed-fetch.js';
import { Worker } from 'bullmq';
import { RSSConnector } from '../src/connectors/rss.js';

function createMockRepo() {
  return {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    countByTenant: vi.fn(),
    getHealth: vi.fn(),
    getStats: vi.fn(),
    updateHealth: vi.fn(),
    findAllActive: vi.fn(),
  };
}

function createMockLogger() {
  const logger: Record<string, unknown> = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  logger.child = vi.fn().mockReturnValue(logger);
  return logger;
}

function createMockDb() {
  return {
    article: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

const TENANT_ID = 'tenant-uuid-1';
const FEED_ID = 'feed-uuid-1';

function makeFeed(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ID,
    tenantId: TENANT_ID,
    name: 'Test RSS Feed',
    feedType: 'rss',
    url: 'https://example.com/feed.rss',
    status: 'active',
    enabled: true,
    consecutiveFailures: 0,
    schedule: '0 * * * *',
    headers: {},
    authConfig: {},
    parseConfig: {},
    ...overrides,
  };
}

function makeJob(data: FeedFetchJobData) {
  return { id: 'job-1', data } as never;
}

describe('FeedFetchWorker', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo();
    logger = createMockLogger();
  });

  function getProcessor() {
    createFeedFetchWorker({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    // Get the processor function passed to Worker constructor
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    const processorFn = workerCtor.mock.calls[0][1];
    return processorFn;
  }

  it('creates a Worker with correct queue name (dashes, not colons)', () => {
    createFeedFetchWorker({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    expect(workerCtor.mock.calls[0][0]).toBe('etip-feed-fetch');
  });

  it('processes RSS feed successfully', async () => {
    const processor = getProcessor();

    repo.findById.mockResolvedValue(makeFeed());
    repo.updateHealth.mockResolvedValue(makeFeed());

    // Mock the RSS connector's fetch inside the processor
    const RSSCtor = RSSConnector as unknown as ReturnType<typeof vi.fn>;
    RSSCtor.mockImplementation(() => ({
      fetch: vi.fn().mockResolvedValue({
        articles: [
          { title: 'Article 1', content: 'content', url: 'https://example.com/1', publishedAt: new Date(), author: null, rawMeta: {} },
          { title: 'Article 2', content: 'content', url: 'https://example.com/2', publishedAt: new Date(), author: null, rawMeta: {} },
        ],
        fetchDurationMs: 450,
        feedTitle: 'Test Feed',
        feedDescription: 'desc',
      }),
    }));

    // Re-create to pick up the mock
    const worker = createFeedFetchWorker({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const latestProcessor = (Worker as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)[1];

    const result = await latestProcessor(makeJob({ feedId: FEED_ID, tenantId: TENANT_ID, triggeredBy: 'manual' }));

    expect(result.status).toBe('success');
    expect(result.articlesCount).toBe(2);
    expect(repo.updateHealth).toHaveBeenCalledWith(
      TENANT_ID, FEED_ID,
      expect.objectContaining({ consecutiveFailures: 0, status: 'active' }),
    );
  });

  it('skips disabled feeds', async () => {
    createFeedFetchWorker({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const processor = (Worker as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)[1];

    repo.findById.mockResolvedValue(makeFeed({ enabled: false }));

    const result = await processor(makeJob({ feedId: FEED_ID, tenantId: TENANT_ID, triggeredBy: 'schedule' }));

    expect(result.status).toBe('success');
    expect(result.articlesCount).toBe(0);
    expect(repo.updateHealth).not.toHaveBeenCalled();
  });

  it('throws when feed not found', async () => {
    createFeedFetchWorker({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const processor = (Worker as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)[1];

    repo.findById.mockResolvedValue(null);

    await expect(
      processor(makeJob({ feedId: FEED_ID, tenantId: TENANT_ID, triggeredBy: 'manual' })),
    ).rejects.toThrow('Feed not found');
  });

  it('updates health on fetch failure', async () => {
    const RSSCtor = RSSConnector as unknown as ReturnType<typeof vi.fn>;
    RSSCtor.mockImplementation(() => ({
      fetch: vi.fn().mockRejectedValue(new Error('Connection timeout')),
    }));

    createFeedFetchWorker({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const processor = (Worker as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)[1];

    repo.findById.mockResolvedValue(makeFeed({ consecutiveFailures: 2 }));
    repo.updateHealth.mockResolvedValue(makeFeed());

    const result = await processor(makeJob({ feedId: FEED_ID, tenantId: TENANT_ID, triggeredBy: 'schedule' }));

    expect(result.status).toBe('failure');
    expect(result.error).toBe('Connection timeout');
    expect(repo.updateHealth).toHaveBeenCalledWith(
      TENANT_ID, FEED_ID,
      expect.objectContaining({
        consecutiveFailures: 3,
        lastErrorMessage: 'Connection timeout',
      }),
    );
  });

  it('disables feed after max consecutive failures', async () => {
    const RSSCtor = RSSConnector as unknown as ReturnType<typeof vi.fn>;
    RSSCtor.mockImplementation(() => ({
      fetch: vi.fn().mockRejectedValue(new Error('DNS failure')),
    }));

    createFeedFetchWorker({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const processor = (Worker as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)[1];

    // Feed already at 4 failures, this will be the 5th (= max)
    repo.findById.mockResolvedValue(makeFeed({ consecutiveFailures: 4 }));
    repo.updateHealth.mockResolvedValue(makeFeed());

    await processor(makeJob({ feedId: FEED_ID, tenantId: TENANT_ID, triggeredBy: 'schedule' }));

    expect(repo.updateHealth).toHaveBeenCalledWith(
      TENANT_ID, FEED_ID,
      expect.objectContaining({
        consecutiveFailures: 5,
        status: 'error',
        enabled: false,
      }),
    );
  });

  it('throws 501 for unimplemented connector types', async () => {
    const RSSCtor = RSSConnector as unknown as ReturnType<typeof vi.fn>;
    RSSCtor.mockImplementation(() => ({ fetch: vi.fn() }));

    createFeedFetchWorker({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const processor = (Worker as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)[1];

    repo.findById.mockResolvedValue(makeFeed({ feedType: 'stix' }));
    repo.updateHealth.mockResolvedValue(makeFeed());

    const result = await processor(makeJob({ feedId: FEED_ID, tenantId: TENANT_ID, triggeredBy: 'manual' }));

    expect(result.status).toBe('failure');
    expect(result.error).toContain('not yet implemented');
  });

  it('registers event handlers on the worker', () => {
    createFeedFetchWorker({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    expect(mockWorkerInstance.on).toHaveBeenCalledWith('failed', expect.any(Function));
    expect(mockWorkerInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
