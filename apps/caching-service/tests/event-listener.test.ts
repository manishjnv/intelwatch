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
      expect.objectContaining({ prefix: 'etip', concurrency: 10 }),
    );
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
