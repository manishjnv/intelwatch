import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { createGlobalRESTWorker } from '../src/workers/global-rest-worker.js';
import { Worker } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';

function createMockLogger() {
  const logger: Record<string, unknown> = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() };
  logger.child = vi.fn().mockReturnValue(logger);
  return logger as never;
}

describe('GlobalRESTWorker', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('uses correct queue name: FEED_FETCH_GLOBAL_REST', () => {
    createGlobalRESTWorker({ db: {} as never, logger: createMockLogger(), redisUrl: 'redis://localhost:6379' });
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    expect(workerCtor.mock.calls[0][0]).toBe(QUEUES.FEED_FETCH_GLOBAL_REST);
  });

  it('uses concurrency = 3', () => {
    createGlobalRESTWorker({ db: {} as never, logger: createMockLogger(), redisUrl: 'redis://localhost:6379' });
    const workerCtor = Worker as unknown as ReturnType<typeof vi.fn>;
    expect(workerCtor.mock.calls[0][2]).toEqual(expect.objectContaining({ concurrency: 3 }));
  });
});
