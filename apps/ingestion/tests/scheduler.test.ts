import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FeedScheduler } from '../src/workers/scheduler.js';

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn().mockImplementation((_expr: string, callback: () => void) => {
      return {
        stop: vi.fn(),
        _callback: callback,
      };
    }),
    validate: vi.fn().mockReturnValue(true),
  },
}));

import cron from 'node-cron';

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

function createMockQueue() {
  return { add: vi.fn().mockResolvedValue({ id: 'job-1' }), close: vi.fn() };
}

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
}

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function makeActiveFeed(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feed-1',
    tenantId: TENANT_A,
    schedule: '*/15 * * * *',
    enabled: true,
    status: 'active',
    ...overrides,
  };
}

describe('FeedScheduler', () => {
  let repo: ReturnType<typeof createMockRepo>;
  let queue: ReturnType<typeof createMockQueue>;
  let logger: ReturnType<typeof createMockLogger>;
  let scheduler: FeedScheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo();
    queue = createMockQueue();
    logger = createMockLogger();
    scheduler = new FeedScheduler({
      repo: repo as never,
      queue: queue as never,
      logger: logger as never,
    });
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  it('starts and registers cron jobs for active feeds', async () => {
    repo.findAllActive.mockResolvedValue([
      makeActiveFeed({ id: 'feed-1' }),
      makeActiveFeed({ id: 'feed-2', tenantId: TENANT_B, schedule: '0 * * * *' }),
    ]);

    await scheduler.start();

    expect(scheduler.activeJobCount).toBe(2);
    // 2 feed cron jobs + 1 sync task = 3 total cron.schedule calls
    expect(cron.schedule).toHaveBeenCalledTimes(3);
  });

  it('does not register duplicate jobs on re-sync', async () => {
    repo.findAllActive.mockResolvedValue([makeActiveFeed({ id: 'feed-1' })]);

    await scheduler.start();
    const initialCalls = (cron.schedule as ReturnType<typeof vi.fn>).mock.calls.length;

    // Sync again — same feed should not create another job
    await scheduler.syncFeeds();

    // Only the sync itself might be called, but feed-1 should NOT get a second cron job
    expect(scheduler.activeJobCount).toBe(1);
  });

  it('removes jobs for deactivated feeds', async () => {
    repo.findAllActive.mockResolvedValueOnce([
      makeActiveFeed({ id: 'feed-1' }),
      makeActiveFeed({ id: 'feed-2' }),
    ]);

    await scheduler.start();
    expect(scheduler.activeJobCount).toBe(2);

    // Now feed-2 is gone
    repo.findAllActive.mockResolvedValueOnce([makeActiveFeed({ id: 'feed-1' })]);

    await scheduler.syncFeeds();
    expect(scheduler.activeJobCount).toBe(1);
  });

  it('skips feeds with invalid cron expressions', async () => {
    (cron.validate as ReturnType<typeof vi.fn>).mockImplementation((expr: string) => expr !== 'bad-cron');

    repo.findAllActive.mockResolvedValue([
      makeActiveFeed({ id: 'feed-1', schedule: '*/15 * * * *' }),
      makeActiveFeed({ id: 'feed-bad', schedule: 'bad-cron' }),
    ]);

    await scheduler.start();

    expect(scheduler.activeJobCount).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ feedId: 'feed-bad' }),
      expect.stringContaining('Invalid cron'),
    );
  });

  it('enqueues a feed fetch job when cron fires', async () => {
    repo.findAllActive.mockResolvedValue([makeActiveFeed({ id: 'feed-1' })]);

    await scheduler.start();

    // Get the cron callback for feed-1 (second call — first is the sync task)
    const cronCalls = (cron.schedule as ReturnType<typeof vi.fn>).mock.calls;
    const feedCronCall = cronCalls.find((c: unknown[]) => c[0] === '*/15 * * * *');
    const callback = feedCronCall[1] as () => void;

    // Fire the cron
    callback();

    // Wait for the async enqueue
    await new Promise((r) => setTimeout(r, 10));

    expect(queue.add).toHaveBeenCalledWith(
      'etip:feed-fetch',
      expect.objectContaining({ feedId: 'feed-1', tenantId: TENANT_A, triggeredBy: 'schedule' }),
      expect.objectContaining({ jobId: expect.stringContaining('sched-feed-1-') }),
    );
  });

  it('handles zero active feeds gracefully', async () => {
    repo.findAllActive.mockResolvedValue([]);

    await scheduler.start();

    expect(scheduler.activeJobCount).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ activeFeeds: 0, scheduledJobs: 0 }),
      'Feed sync completed',
    );
  });

  it('stops cleanly', async () => {
    repo.findAllActive.mockResolvedValue([
      makeActiveFeed({ id: 'feed-1' }),
      makeActiveFeed({ id: 'feed-2' }),
    ]);

    await scheduler.start();
    expect(scheduler.activeJobCount).toBe(2);

    await scheduler.stop();
    expect(scheduler.activeJobCount).toBe(0);
  });

  it('does not start twice', async () => {
    repo.findAllActive.mockResolvedValue([]);

    await scheduler.start();
    await scheduler.start(); // Should be a no-op

    // findAllActive called only once (initial sync), not twice
    expect(repo.findAllActive).toHaveBeenCalledTimes(1);
  });

  it('handles multi-tenant feeds correctly', async () => {
    repo.findAllActive.mockResolvedValue([
      makeActiveFeed({ id: 'feed-a1', tenantId: TENANT_A, schedule: '*/10 * * * *' }),
      makeActiveFeed({ id: 'feed-b1', tenantId: TENANT_B, schedule: '0 */2 * * *' }),
    ]);

    await scheduler.start();
    expect(scheduler.activeJobCount).toBe(2);
  });
});
