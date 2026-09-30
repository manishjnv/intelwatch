import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventListenerWorker, type CacheInvalidatePayload } from '../src/workers/event-listener.js';

// Mock bullmq
vi.mock('bullmq', () => {
  let processorFn: ((job: unknown) => Promise<void>) | null = null;

  return {
    Worker: vi.fn().mockImplementation((_queue: string, processor: (job: unknown) => Promise<void>) => {
      processorFn = processor;
      return {
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      };
    }),
    // Expose the processor so tests can invoke it directly
    __getProcessor: () => processorFn,
  };
});

function createMockInvalidator() {
  return {
    recordEvent: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    flush: vi.fn(),
    getStats: vi.fn(),
  };
}

function makeJob(data: Partial<CacheInvalidatePayload>, id = 'job-1') {
  return { id, data };
}

describe('EventListenerWorker', () => {
  let worker: EventListenerWorker;
  let mockInvalidator: ReturnType<typeof createMockInvalidator>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidator = createMockInvalidator();
    worker = new EventListenerWorker({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cacheInvalidator: mockInvalidator as any,
      redisUrl: 'redis://localhost:6379/0',
    });
  });

  it('starts a BullMQ worker on the cache-invalidate queue', async () => {
    const { Worker } = await import('bullmq');
    worker.start();
    expect(Worker).toHaveBeenCalledWith(
      'etip-cache-invalidate',
      expect.any(Function),
      expect.objectContaining({ concurrency: 10, removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 } }),
    );
    const { Worker: W } = await import('bullmq') as unknown as { Worker: ReturnType<typeof vi.fn> };
    const opts = W.mock.calls[W.mock.calls.length - 1][2] as Record<string, unknown>;
    expect(opts.prefix).toBeUndefined(); // producers use BullMQ's default 'bull' prefix (RCA #66)
  });

  it('passes the Redis password from the URL (RCA #66: was dropped → NOAUTH)', async () => {
    const w = new EventListenerWorker({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cacheInvalidator: mockInvalidator as any,
      redisUrl: 'redis://:p%40ss@etip_redis:6379/0',
    });
    w.start();
    const { Worker } = await import('bullmq') as unknown as { Worker: ReturnType<typeof vi.fn> };
    const lastCall = Worker.mock.calls[Worker.mock.calls.length - 1];
    expect(lastCall[2].connection).toEqual({ host: 'etip_redis', port: 6379, password: 'p@ss', db: 0 });
  });

  it('skips events older than one hour (backlog drain)', async () => {
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    worker.start();
    const processor = __getProcessor();

    await processor({ id: 'old', data: { tenantId: 'tenant-1', eventType: 'ioc.created' }, timestamp: Date.now() - 2 * 3600_000 });
    expect(mockInvalidator.recordEvent).not.toHaveBeenCalled();
    await processor({ id: 'new', data: { tenantId: 'tenant-1', eventType: 'ioc.created' }, timestamp: Date.now() });
    expect(mockInvalidator.recordEvent).toHaveBeenCalledTimes(1);
  });

  it('forwards valid events to cacheInvalidator.recordEvent()', async () => {
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    worker.start();
    const processor = __getProcessor();

    await processor(makeJob({ tenantId: 'tenant-1', eventType: 'ioc.created' }));
    expect(mockInvalidator.recordEvent).toHaveBeenCalledWith('ioc.created', 'tenant-1', { severity: undefined });
  });

  it('skips events with missing tenantId', async () => {
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    worker.start();
    const processor = __getProcessor();

    await processor(makeJob({ eventType: 'ioc.created' }));
    expect(mockInvalidator.recordEvent).not.toHaveBeenCalled();
  });

  it('skips events with missing eventType', async () => {
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    worker.start();
    const processor = __getProcessor();

    await processor(makeJob({ tenantId: 'tenant-1' }));
    expect(mockInvalidator.recordEvent).not.toHaveBeenCalled();
  });

  it('stops the worker gracefully', async () => {
    worker.start();
    await worker.stop();
    // No error thrown — clean shutdown
    expect(true).toBe(true);
  });

  it('handles stop when not started', async () => {
    await worker.stop();
    // No error thrown
    expect(true).toBe(true);
  });

  it('parses Redis URL with custom db', async () => {
    const w = new EventListenerWorker({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cacheInvalidator: mockInvalidator as any,
      redisUrl: 'redis://myhost:6380/2',
    });
    w.start();
    const { Worker } = await import('bullmq') as unknown as { Worker: ReturnType<typeof vi.fn> };
    const lastCall = Worker.mock.calls[Worker.mock.calls.length - 1];
    expect(lastCall[2].connection).toEqual({ host: 'myhost', port: 6380, db: 2 });
  });
});
