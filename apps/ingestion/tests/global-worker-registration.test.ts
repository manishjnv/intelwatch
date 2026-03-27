import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Verify the worker factory functions return the expected structure
vi.mock('../src/config.js', () => ({ getConfig: () => ({ TI_REDIS_URL: 'redis://localhost:6379' }) }));
vi.mock('ioredis', () => ({ default: vi.fn().mockImplementation(() => ({ get: vi.fn(), set: vi.fn(), quit: vi.fn() })) }));
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn(), close: vi.fn() })),
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn(), close: vi.fn() })),
}));
vi.mock('../src/connectors/rss.js', () => ({ RSSConnector: vi.fn().mockImplementation(() => ({ fetch: vi.fn() })) }));
vi.mock('../src/connectors/nvd.js', () => ({ NVDConnector: vi.fn().mockImplementation(() => ({ fetch: vi.fn() })) }));
vi.mock('../src/connectors/taxii.js', () => ({ TAXIIConnector: vi.fn().mockImplementation(() => ({ fetch: vi.fn() })) }));
vi.mock('../src/connectors/rest-api.js', () => ({ RestAPIConnector: vi.fn().mockImplementation(() => ({ fetch: vi.fn() })) }));
vi.mock('../src/connectors/misp.js', () => ({ MISPConnector: vi.fn().mockImplementation(() => ({ fetch: vi.fn() })) }));

import { createGlobalRSSWorker } from '../src/workers/global-rss-worker.js';
import { createGlobalNVDWorker } from '../src/workers/global-nvd-worker.js';
import { createGlobalSTIXWorker } from '../src/workers/global-stix-worker.js';
import { createGlobalRESTWorker } from '../src/workers/global-rest-worker.js';
import { createGlobalMISPWorker } from '../src/workers/global-misp-worker.js';
import { GlobalFeedScheduler } from '../src/schedulers/global-feed-scheduler.js';
import { Worker } from 'bullmq';

function createMockLogger() {
  const logger: Record<string, unknown> = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  logger.child = vi.fn().mockReturnValue(logger);
  return logger as never;
}

const deps = { db: {} as never, logger: createMockLogger(), redisUrl: 'redis://localhost:6379' };
const origEnv = process.env.TI_GLOBAL_PROCESSING_ENABLED;

describe('Global Worker Registration', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.TI_GLOBAL_PROCESSING_ENABLED = origEnv;
    } else {
      delete process.env.TI_GLOBAL_PROCESSING_ENABLED;
    }
  });

  it('all 5 worker factories create workers', () => {
    const workers = [
      createGlobalRSSWorker(deps),
      createGlobalNVDWorker(deps),
      createGlobalSTIXWorker(deps),
      createGlobalRESTWorker(deps),
      createGlobalMISPWorker(deps),
    ];
    expect(workers).toHaveLength(5);
    expect(workers.every((w) => typeof w.close === 'function')).toBe(true);

    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    expect(workerCtor).toHaveBeenCalledTimes(5);
  });

  it('each worker has a worker property', () => {
    const result = createGlobalRSSWorker(deps);
    expect(result.worker).toBeDefined();
  });

  it('scheduler not started when flag off', () => {
    delete process.env.TI_GLOBAL_PROCESSING_ENABLED;
    const scheduler = new GlobalFeedScheduler({ db: {} as never, queues: {}, logger: createMockLogger() });
    scheduler.start();
    expect(scheduler.isRunning).toBe(false);
    scheduler.stop();
  });

  it('scheduler started when flag on', () => {
    process.env.TI_GLOBAL_PROCESSING_ENABLED = 'true';
    const scheduler = new GlobalFeedScheduler({
      db: { globalFeedCatalog: { findMany: vi.fn().mockResolvedValue([]) } } as never,
      queues: {},
      logger: createMockLogger(),
    });
    scheduler.start();
    expect(scheduler.isRunning).toBe(true);
    scheduler.stop();
  });

  it('log output confirms worker count', () => {
    const logDeps = { db: {} as never, logger: createMockLogger(), redisUrl: 'redis://localhost:6379' };
    createGlobalRSSWorker(logDeps);
    // Logger should have been called with worker start info
    expect((logDeps.logger as unknown as Record<string, ReturnType<typeof vi.fn>>).info).toHaveBeenCalledWith(
      expect.objectContaining({ connector: 'rss' }),
      expect.stringContaining('Global fetch worker started'),
    );
  });
});
