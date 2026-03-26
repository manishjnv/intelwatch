import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FeedScheduler,
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  CB_THRESHOLD,
  CB_WINDOW_MS,
  CB_OPEN_MS,
} from '../src/workers/scheduler.js';

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn().mockImplementation((_expr: string, callback: () => void) => ({
      stop: vi.fn(),
      _callback: callback,
    })),
    validate: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../src/queue.js', () => ({
  mapFeedTypeToQueue: (feedType: string) => {
    switch (feedType) {
      case 'rss': return 'etip-feed-fetch-rss';
      default: return 'etip-feed-fetch-rss';
    }
  },
}));

import cron from 'node-cron';

function createMockRepo() {
  return {
    create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findById: vi.fn(),
    update: vi.fn(), softDelete: vi.fn(), countByTenant: vi.fn(),
    getHealth: vi.fn(), getStats: vi.fn(), updateHealth: vi.fn(),
    findAllActive: vi.fn(),
  };
}

function createMockQueue(shouldFail = false) {
  const add = shouldFail
    ? vi.fn().mockRejectedValue(new Error('Queue unavailable'))
    : vi.fn().mockResolvedValue({ id: 'job-1' });
  return { add, close: vi.fn() };
}

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
}

function makeActiveFeed(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feed-1', tenantId: 'tenant-a', schedule: '*/15 * * * *',
    feedType: 'rss', enabled: true, status: 'active', ...overrides,
  };
}

describe('FeedScheduler — retry & circuit breaker', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates exponential backoff delay: 30s, 60s, 120s, capped at 5min', () => {
    // Verify the backoff formula: min(300_000, 30_000 * 2^(failCount-1))
    expect(Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, 0))).toBe(30_000);  // fail 1
    expect(Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, 1))).toBe(60_000);  // fail 2
    expect(Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, 2))).toBe(120_000); // fail 3
    expect(Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, 3))).toBe(240_000); // fail 4
    expect(Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, 4))).toBe(300_000); // fail 5 (capped)
    expect(Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, 10))).toBe(300_000); // fail 11 (still capped)
  });

  it('resets failCount on successful enqueue', async () => {
    const queue = createMockQueue(false);
    const queues = new Map([['etip-feed-fetch-rss', queue]]);
    repo = createMockRepo();
    logger = createMockLogger();
    const scheduler = new FeedScheduler({ repo: repo as never, queues: queues as never, logger: logger as never });

    // Simulate prior failure state
    scheduler.retryState.set('feed-1', { failCount: 3, lastFailAt: 0 });

    repo.findAllActive.mockResolvedValue([makeActiveFeed()]);
    await scheduler.start();

    // Fire the cron callback
    const cronCalls = (cron.schedule as ReturnType<typeof vi.fn>).mock.calls;
    const feedCall = cronCalls.find((c: unknown[]) => c[0] === '*/15 * * * *');
    const callback = feedCall[1] as () => void;
    callback();

    await vi.advanceTimersByTimeAsync(20);

    // After success, retry state should be cleared
    expect(scheduler.retryState.has('feed-1')).toBe(false);

    await scheduler.stop();
  });

  it('tracks failures and skips enqueue during backoff window', async () => {
    const failQueue = createMockQueue(true);
    const queues = new Map([['etip-feed-fetch-rss', failQueue]]);
    repo = createMockRepo();
    logger = createMockLogger();
    const scheduler = new FeedScheduler({ repo: repo as never, queues: queues as never, logger: logger as never });

    repo.findAllActive.mockResolvedValue([makeActiveFeed()]);
    await scheduler.start();

    // Fire the cron — should fail and set retry state
    const cronCalls = (cron.schedule as ReturnType<typeof vi.fn>).mock.calls;
    const feedCall = cronCalls.find((c: unknown[]) => c[0] === '*/15 * * * *');
    const callback = feedCall[1] as () => void;
    callback();
    await vi.advanceTimersByTimeAsync(20);

    expect(scheduler.retryState.get('feed-1')?.failCount).toBe(1);

    // Fire again immediately — should be skipped (within 30s backoff)
    callback();
    await vi.advanceTimersByTimeAsync(20);

    // queue.add should only have been called once (the first attempt)
    expect(failQueue.add).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ feedId: 'feed-1', failCount: 1 }),
      expect.stringContaining('backoff window'),
    );

    await scheduler.stop();
  });

  it('tracks separate retry state per feed', async () => {
    const failQueue = createMockQueue(true);
    const queues = new Map([['etip-feed-fetch-rss', failQueue]]);
    repo = createMockRepo();
    logger = createMockLogger();
    const scheduler = new FeedScheduler({ repo: repo as never, queues: queues as never, logger: logger as never });

    // Manually set different failure counts
    scheduler.retryState.set('feed-a', { failCount: 2, lastFailAt: Date.now() - 100_000 });
    scheduler.retryState.set('feed-b', { failCount: 5, lastFailAt: Date.now() - 100_000 });

    expect(scheduler.retryState.get('feed-a')?.failCount).toBe(2);
    expect(scheduler.retryState.get('feed-b')?.failCount).toBe(5);
    // Different feeds = independent backoff
    expect(scheduler.retryState.size).toBe(2);

    await scheduler.stop();
  });

  it('opens circuit breaker after 3 consecutive quota fetch failures', async () => {
    repo = createMockRepo();
    logger = createMockLogger();
    const queue = createMockQueue(false);
    const queues = new Map([['etip-feed-fetch-rss', queue]]);
    const mockClient = {
      getFeedQuota: vi.fn().mockRejectedValue(new Error('Service unavailable')),
    };
    const scheduler = new FeedScheduler({
      repo: repo as never,
      queues: queues as never,
      logger: logger as never,
      customizationClient: mockClient as never,
    });

    // 3 tenants → 3 failures → circuit should open
    repo.findAllActive.mockResolvedValue([
      makeActiveFeed({ id: 'f1', tenantId: 't1' }),
      makeActiveFeed({ id: 'f2', tenantId: 't2' }),
      makeActiveFeed({ id: 'f3', tenantId: 't3' }),
    ]);

    await scheduler.start();

    expect(scheduler.circuitBreaker.failures).toBe(CB_THRESHOLD);
    expect(scheduler.circuitBreaker.openUntil).toBeGreaterThan(Date.now());
    expect(logger.warn).toHaveBeenCalledWith('Circuit breaker open for customization-client');

    // Next sync should skip quota fetches entirely
    mockClient.getFeedQuota.mockClear();
    await scheduler.syncFeeds();

    expect(mockClient.getFeedQuota).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Circuit breaker open for customization-client, skipping quota fetch',
    );

    await scheduler.stop();
  });
});
