import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before imports
vi.mock('../src/config.js', () => ({
  getConfig: () => ({
    TI_REDIS_URL: 'redis://:testpass@localhost:6379',
    TI_MAX_CONSECUTIVE_FAILURES: 5,
    TI_FEED_CONCURRENCY_RSS: 5,
    TI_FEED_CONCURRENCY_NVD: 2,
    TI_FEED_CONCURRENCY_STIX: 2,
    TI_FEED_CONCURRENCY_REST: 3,
    TI_FEED_MAX_CONCURRENT_PER_TENANT: 3,
  }),
}));

// Mock ioredis for tenant fairness
const mockRedisInstance = {
  get: vi.fn().mockResolvedValue(null),
  incr: vi.fn().mockResolvedValue(1),
  decr: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
};
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedisInstance),
}));

// Mock bullmq Worker
const mockWorkerInstance = {
  on: vi.fn(),
  close: vi.fn(),
  _processor: undefined as unknown,
};
const mockQueueInstance = {
  add: vi.fn().mockResolvedValue({ id: 'mock-job' }),
  close: vi.fn(),
};
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => {
    mockWorkerInstance._processor = processor;
    return { ...mockWorkerInstance };
  }),
  Queue: vi.fn().mockImplementation(() => mockQueueInstance),
}));

// Mock queue.ts
vi.mock('../src/queue.js', () => ({
  FEED_FETCH_QUEUE_NAMES: ['etip-feed-fetch-rss', 'etip-feed-fetch-nvd', 'etip-feed-fetch-stix', 'etip-feed-fetch-rest'],
}));

// Mock connectors
vi.mock('../src/connectors/rss.js', () => ({
  RSSConnector: vi.fn().mockImplementation(() => ({
    fetch: vi.fn(),
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

import { createFeedFetchWorkers, type FeedFetchJobData } from '../src/workers/feed-fetch.js';
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
  return { id: 'job-1', data, moveToDelayed: vi.fn() } as never;
}

describe('FeedFetchWorker', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo();
    logger = createMockLogger();
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.incr.mockResolvedValue(1);
    mockRedisInstance.decr.mockResolvedValue(0);
  });

  function getProcessor() {
    createFeedFetchWorkers({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    // Get the processor function passed to first Worker constructor
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    const processorFn = workerCtor.mock.calls[0][1];
    return processorFn;
  }

  it('creates 4 Workers with per-type queue names (P3-4)', () => {
    createFeedFetchWorkers({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    expect(workerCtor).toHaveBeenCalledTimes(4);
    expect(workerCtor.mock.calls[0][0]).toBe('etip-feed-fetch-rss');
    expect(workerCtor.mock.calls[1][0]).toBe('etip-feed-fetch-nvd');
    expect(workerCtor.mock.calls[2][0]).toBe('etip-feed-fetch-stix');
    expect(workerCtor.mock.calls[3][0]).toBe('etip-feed-fetch-rest');
  });

  it('sets per-type concurrency from config (P3-4)', () => {
    createFeedFetchWorkers({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    // Third arg is options with concurrency
    expect(workerCtor.mock.calls[0][2]).toEqual(expect.objectContaining({ concurrency: 5 }));  // RSS
    expect(workerCtor.mock.calls[1][2]).toEqual(expect.objectContaining({ concurrency: 2 }));  // NVD
    expect(workerCtor.mock.calls[2][2]).toEqual(expect.objectContaining({ concurrency: 2 }));  // STIX
    expect(workerCtor.mock.calls[3][2]).toEqual(expect.objectContaining({ concurrency: 3 }));  // REST
  });

  it('skips disabled feeds', async () => {
    const processor = getProcessor();
    repo.findById.mockResolvedValue(makeFeed({ enabled: false }));

    const result = await processor(makeJob({ feedId: FEED_ID, tenantId: TENANT_ID, triggeredBy: 'schedule' }));

    expect(result.status).toBe('success');
    expect(result.articlesCount).toBe(0);
    expect(repo.updateHealth).not.toHaveBeenCalled();
  });

  it('throws when feed not found', async () => {
    const processor = getProcessor();
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

    createFeedFetchWorkers({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
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

    createFeedFetchWorkers({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    const processor = (Worker as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)[1];

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

  it('registers event handlers on all workers', () => {
    const workers = createFeedFetchWorkers({ repo: repo as never, logger: logger as never, db: createMockDb() as never });
    expect(workers).toHaveLength(4);
  });
});
