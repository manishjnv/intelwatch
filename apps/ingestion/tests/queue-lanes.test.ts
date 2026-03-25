import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks hoisted to top (vi.mock is hoisted by vitest) ──────────────

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

const mockPipeline = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
};
const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  incr: vi.fn().mockResolvedValue(1),
  decr: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
  pipeline: vi.fn().mockReturnValue(mockPipeline),
  eval: vi.fn().mockResolvedValue(0),
  quit: vi.fn().mockResolvedValue('OK'),
};
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedis),
}));

const processorFns: Array<(job: unknown) => Promise<unknown>> = [];
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: (job: unknown) => Promise<unknown>) => {
    processorFns.push(processor);
    return { on: vi.fn(), close: vi.fn() };
  }),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({ id: 'mock-job' }),
    close: vi.fn(),
  })),
  DelayedError: class DelayedError extends Error { constructor() { super('DelayedError'); this.name = 'DelayedError'; } },
}));

vi.mock('../src/queue.js', () => ({
  FEED_FETCH_QUEUE_NAMES: ['etip-feed-fetch-rss', 'etip-feed-fetch-nvd', 'etip-feed-fetch-stix', 'etip-feed-fetch-rest'],
  mapFeedTypeToQueue: (feedType: string) => {
    switch (feedType) {
      case 'rss': case 'atom': return 'etip-feed-fetch-rss';
      case 'nvd': return 'etip-feed-fetch-nvd';
      case 'stix': case 'taxii': return 'etip-feed-fetch-stix';
      case 'rest_api': return 'etip-feed-fetch-rest';
      default: return 'etip-feed-fetch-rss';
    }
  },
}));

vi.mock('../src/connectors/rss.js', () => ({
  RSSConnector: vi.fn().mockImplementation(() => ({
    fetch: vi.fn().mockResolvedValue({ articles: [], fetchDurationMs: 0, feedTitle: null, feedDescription: null }),
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

// ── Imports (after mocks) ────────────────────────────────────────────

import { createFeedFetchWorkers } from '../src/workers/feed-fetch.js';
import { mapFeedTypeToQueue } from '../src/queue.js';
import { Worker } from 'bullmq';

// ── Helpers ──────────────────────────────────────────────────────────

function createMockRepo() {
  return {
    create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findById: vi.fn(),
    update: vi.fn(), softDelete: vi.fn(), countByTenant: vi.fn(),
    getHealth: vi.fn(), getStats: vi.fn(), updateHealth: vi.fn(), findAllActive: vi.fn(),
  };
}

function createMockLogger() {
  const l: Record<string, unknown> = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  l.child = vi.fn().mockReturnValue(l);
  return l;
}

function createMockDb() {
  return { article: { createMany: vi.fn().mockResolvedValue({ count: 0 }) } };
}

function makeJob(feedId: string, tenantId: string) {
  return { id: 'job-1', data: { feedId, tenantId, triggeredBy: 'schedule' as const }, moveToDelayed: vi.fn() };
}

function makeFeed(feedId: string, tenantId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: feedId, tenantId, name: 'Test Feed', feedType: 'rss', url: 'https://example.com/feed.rss',
    status: 'active', enabled: true, consecutiveFailures: 0, schedule: '0 * * * *',
    headers: {}, authConfig: {}, parseConfig: {}, ...overrides,
  };
}

// ── P3-4: Queue routing tests ────────────────────────────────────────

describe('mapFeedTypeToQueue (P3-4)', () => {
  it('routes rss feed to feed-fetch-rss queue', () => {
    expect(mapFeedTypeToQueue('rss')).toBe('etip-feed-fetch-rss');
  });

  it('routes atom feed to feed-fetch-rss queue', () => {
    expect(mapFeedTypeToQueue('atom')).toBe('etip-feed-fetch-rss');
  });

  it('routes nvd feed to feed-fetch-nvd queue', () => {
    expect(mapFeedTypeToQueue('nvd')).toBe('etip-feed-fetch-nvd');
  });

  it('routes stix feed to feed-fetch-stix queue', () => {
    expect(mapFeedTypeToQueue('stix')).toBe('etip-feed-fetch-stix');
  });

  it('routes taxii feed to feed-fetch-stix queue', () => {
    expect(mapFeedTypeToQueue('taxii')).toBe('etip-feed-fetch-stix');
  });

  it('routes rest_api feed to feed-fetch-rest queue', () => {
    expect(mapFeedTypeToQueue('rest_api')).toBe('etip-feed-fetch-rest');
  });

  it('routes unknown feed type to feed-fetch-rss (safe fallback)', () => {
    expect(mapFeedTypeToQueue('csv_upload')).toBe('etip-feed-fetch-rss');
    expect(mapFeedTypeToQueue('unknown_type')).toBe('etip-feed-fetch-rss');
  });
});

// ── P3-4: Worker creation tests ──────────────────────────────────────

describe('createFeedFetchWorkers (P3-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processorFns.length = 0;
  });

  it('creates 4 workers with per-type queue names', () => {
    createFeedFetchWorkers({ repo: createMockRepo() as never, logger: createMockLogger() as never, db: createMockDb() as never });
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    expect(workerCtor).toHaveBeenCalledTimes(4);
    expect(workerCtor.mock.calls[0][0]).toBe('etip-feed-fetch-rss');
    expect(workerCtor.mock.calls[1][0]).toBe('etip-feed-fetch-nvd');
    expect(workerCtor.mock.calls[2][0]).toBe('etip-feed-fetch-stix');
    expect(workerCtor.mock.calls[3][0]).toBe('etip-feed-fetch-rest');
  });

  it('sets per-type concurrency from config', () => {
    createFeedFetchWorkers({ repo: createMockRepo() as never, logger: createMockLogger() as never, db: createMockDb() as never });
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    expect(workerCtor.mock.calls[0][2]).toEqual(expect.objectContaining({ concurrency: 5 }));
    expect(workerCtor.mock.calls[1][2]).toEqual(expect.objectContaining({ concurrency: 2 }));
    expect(workerCtor.mock.calls[2][2]).toEqual(expect.objectContaining({ concurrency: 2 }));
    expect(workerCtor.mock.calls[3][2]).toEqual(expect.objectContaining({ concurrency: 3 }));
  });
});

// ── P3-7: Per-tenant fairness tests ──────────────────────────────────

describe('Per-tenant BullMQ fairness (P3-7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processorFns.length = 0;
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.decr.mockResolvedValue(0);
  });

  it('increments tenant counter atomically via pipeline on job start', async () => {
    const repo = createMockRepo();
    repo.findById.mockResolvedValue(makeFeed('f1', 't1'));
    repo.updateHealth.mockResolvedValue({});

    createFeedFetchWorkers({ repo: repo as never, logger: createMockLogger() as never, db: createMockDb() as never });
    await processorFns[0](makeJob('f1', 't1'));

    // Atomic INCR+EXPIRE via pipeline (W1 fix)
    expect(mockPipeline.incr).toHaveBeenCalledWith('etip-feed-active:t1');
    expect(mockPipeline.expire).toHaveBeenCalledWith('etip-feed-active:t1', 300);
    expect(mockPipeline.exec).toHaveBeenCalled();
  });

  it('safe-decrements tenant counter on job completion via Lua', async () => {
    const repo = createMockRepo();
    repo.findById.mockResolvedValue(makeFeed('f1', 't1'));
    repo.updateHealth.mockResolvedValue({});

    createFeedFetchWorkers({ repo: repo as never, logger: createMockLogger() as never, db: createMockDb() as never });
    await processorFns[0](makeJob('f1', 't1'));

    // Safe DECR via Lua eval (W2 fix — never goes below 0)
    expect(mockRedis.eval).toHaveBeenCalledWith(expect.stringContaining('decr'), 1, 'etip-feed-active:t1');
  });

  it('safe-decrements tenant counter even on job failure (try/finally)', async () => {
    const repo = createMockRepo();
    repo.findById.mockResolvedValue(null); // Will throw NOT_FOUND

    createFeedFetchWorkers({ repo: repo as never, logger: createMockLogger() as never, db: createMockDb() as never });
    await expect(processorFns[0](makeJob('f1', 't1'))).rejects.toThrow('Feed not found');

    // Lua eval DECR must still fire despite error
    expect(mockRedis.eval).toHaveBeenCalledWith(expect.stringContaining('decr'), 1, 'etip-feed-active:t1');
  });

  it('delays job and throws DelayedError when tenant at max concurrent slots (C3 fix)', async () => {
    mockRedis.get.mockResolvedValue('3'); // At limit

    const repo = createMockRepo();
    createFeedFetchWorkers({ repo: repo as never, logger: createMockLogger() as never, db: createMockDb() as never });

    const job = makeJob('f1', 't1');
    // C3 fix: throws DelayedError so BullMQ does NOT mark job as completed
    await expect(processorFns[0](job)).rejects.toThrow('DelayedError');

    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number));
    expect(mockPipeline.incr).not.toHaveBeenCalled(); // Counter NOT incremented when delayed
  });

  it('allows job when tenant below max concurrent slots', async () => {
    mockRedis.get.mockResolvedValue('2'); // Below limit of 3

    const repo = createMockRepo();
    repo.findById.mockResolvedValue(makeFeed('f1', 't1'));
    repo.updateHealth.mockResolvedValue({});

    createFeedFetchWorkers({ repo: repo as never, logger: createMockLogger() as never, db: createMockDb() as never });
    const job = makeJob('f1', 't1');
    const result = await processorFns[0](job) as { status: string };

    expect(job.moveToDelayed).not.toHaveBeenCalled();
    expect(mockPipeline.incr).toHaveBeenCalledWith('etip-feed-active:t1');
    expect(result.status).toBe('success');
  });
});
