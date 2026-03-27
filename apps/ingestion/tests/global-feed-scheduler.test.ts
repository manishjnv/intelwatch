import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlobalFeedScheduler } from '../src/schedulers/global-feed-scheduler.js';

function createMockLogger() {
  const logger: Record<string, unknown> = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  logger.child = vi.fn().mockReturnValue(logger);
  return logger as never;
}

function createMockDb() {
  return {
    globalFeedCatalog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function createMockQueues() {
  return {
    'etip-feed-fetch-global-rss': { add: vi.fn().mockResolvedValue({ id: 'j1' }) },
    'etip-feed-fetch-global-nvd': { add: vi.fn().mockResolvedValue({ id: 'j2' }) },
    'etip-feed-fetch-global-stix': { add: vi.fn().mockResolvedValue({ id: 'j3' }) },
    'etip-feed-fetch-global-rest': { add: vi.fn().mockResolvedValue({ id: 'j4' }) },
  };
}

describe('GlobalFeedScheduler', () => {
  let db: ReturnType<typeof createMockDb>;
  let logger: ReturnType<typeof createMockLogger>;
  let queues: ReturnType<typeof createMockQueues>;
  let scheduler: GlobalFeedScheduler;
  const origEnv = process.env.TI_GLOBAL_PROCESSING_ENABLED;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    db = createMockDb();
    logger = createMockLogger();
    queues = createMockQueues();
    scheduler = new GlobalFeedScheduler({ db: db as never, queues: queues as never, logger });
    delete process.env.TI_GLOBAL_PROCESSING_ENABLED;
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
    if (origEnv !== undefined) {
      process.env.TI_GLOBAL_PROCESSING_ENABLED = origEnv;
    } else {
      delete process.env.TI_GLOBAL_PROCESSING_ENABLED;
    }
  });

  it('feature flag off → does not register cron', () => {
    scheduler.start();
    expect(scheduler.isRunning).toBe(false);
  });

  it('feature flag on → starts running', () => {
    process.env.TI_GLOBAL_PROCESSING_ENABLED = 'true';
    scheduler.start();
    expect(scheduler.isRunning).toBe(true);
  });

  it('queries enabled catalog entries on tick', async () => {
    process.env.TI_GLOBAL_PROCESSING_ENABLED = 'true';
    scheduler.start();

    // Let the immediate tick's promise resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(db.globalFeedCatalog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } }),
    );
  });

  it('enqueues to correct queue based on feedType (RSS)', async () => {
    process.env.TI_GLOBAL_PROCESSING_ENABLED = 'true';
    db.globalFeedCatalog.findMany.mockResolvedValue([
      { id: 'feed-1', feedType: 'rss', schedule: '*/5 * * * *', lastFetchAt: null },
    ]);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(queues['etip-feed-fetch-global-rss'].add).toHaveBeenCalledWith(
      expect.stringContaining('global-fetch-'),
      expect.objectContaining({ globalFeedId: 'feed-1' }),
      expect.any(Object),
    );
  });

  it('NVD feed → FEED_FETCH_GLOBAL_NVD queue', async () => {
    process.env.TI_GLOBAL_PROCESSING_ENABLED = 'true';
    db.globalFeedCatalog.findMany.mockResolvedValue([
      { id: 'feed-2', feedType: 'nvd', schedule: '*/30 * * * *', lastFetchAt: null },
    ]);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(queues['etip-feed-fetch-global-nvd'].add).toHaveBeenCalled();
  });

  it('disabled feeds not enqueued', async () => {
    process.env.TI_GLOBAL_PROCESSING_ENABLED = 'true';
    // DB only returns enabled feeds (WHERE enabled=true), so nothing should be enqueued
    db.globalFeedCatalog.findMany.mockResolvedValue([]);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(queues['etip-feed-fetch-global-rss'].add).not.toHaveBeenCalled();
  });

  it('stop: clears interval', () => {
    process.env.TI_GLOBAL_PROCESSING_ENABLED = 'true';
    scheduler.start();
    expect(scheduler.isRunning).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);
  });

  describe('isDue', () => {
    it('null lastFetchAt → true (first fetch)', () => {
      expect(scheduler.isDue('*/5 * * * *', null)).toBe(true);
    });

    it('lastFetchAt recent → false', () => {
      const recent = new Date(Date.now() - 60_000); // 1 min ago, schedule is every 5 min
      expect(scheduler.isDue('*/5 * * * *', recent)).toBe(false);
    });

    it('lastFetchAt past due → true', () => {
      const old = new Date(Date.now() - 10 * 60_000); // 10 min ago, schedule is every 5 min
      expect(scheduler.isDue('*/5 * * * *', old)).toBe(true);
    });

    it('complex cron → uses 30 minute default', () => {
      const old = new Date(Date.now() - 31 * 60_000);
      expect(scheduler.isDue('0 8 * * 1-5', old)).toBe(true);

      const recent = new Date(Date.now() - 10 * 60_000);
      expect(scheduler.isDue('0 8 * * 1-5', recent)).toBe(false);
    });
  });
});
