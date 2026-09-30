import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '@etip/shared-utils';

vi.mock('bullmq', () => {
  let processorFn: ((job: unknown) => Promise<void>) | null = null;
  return {
    Queue: vi.fn().mockImplementation((name: string) => ({
      name,
      add: vi.fn().mockResolvedValue({ id: `${name}-job-1` }),
      close: vi.fn().mockResolvedValue(undefined),
    })),
    Worker: vi.fn().mockImplementation((_queue: string, processor: (job: unknown) => Promise<void>) => {
      processorFn = processor;
      return { on: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
    }),
    __getProcessor: () => processorFn,
  };
});

vi.mock('../src/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { AlertWorker, type AlertWorkerDeps } from '../src/workers/alert-worker.js';

function createMockDeps(overrides: Partial<AlertWorkerDeps> = {}): AlertWorkerDeps {
  return {
    ruleStore: {
      getEnabledRules: vi.fn().mockResolvedValue([
        {
          id: 'rule-1', name: 'High IOC Alert', tenantId: 'tenant-1',
          severity: 'high', channelIds: [], escalationPolicyId: null,
        },
      ]),
      isInCooldown: vi.fn().mockResolvedValue(false),
      markTriggered: vi.fn().mockResolvedValue(undefined),
    } as unknown as AlertWorkerDeps['ruleStore'],
    alertStore: {
      create: vi.fn().mockResolvedValue({
        id: 'alert-1', tenantId: 'tenant-1', severity: 'high',
        title: '[HIGH] High IOC Alert', status: 'open',
      }),
      findDuplicate: vi.fn().mockResolvedValue(undefined),
      recordDuplicate: vi.fn().mockResolvedValue(undefined),
    } as unknown as AlertWorkerDeps['alertStore'],
    channelStore: { getByIds: vi.fn().mockResolvedValue([]) } as unknown as AlertWorkerDeps['channelStore'],
    ruleEngine: {
      pushEvent: vi.fn(),
      evaluate: vi.fn().mockReturnValue({ triggered: true, reason: 'Threshold exceeded' }),
    } as unknown as AlertWorkerDeps['ruleEngine'],
    notifier: { notifyAll: vi.fn().mockResolvedValue([]) } as unknown as AlertWorkerDeps['notifier'],
    alertHistory: { record: vi.fn().mockResolvedValue(undefined) } as unknown as AlertWorkerDeps['alertHistory'],
    escalationDispatcher: { track: vi.fn().mockResolvedValue(undefined) } as unknown as AlertWorkerDeps['escalationDispatcher'],
    alertGroupStore: {
      addAlert: vi.fn().mockResolvedValue({ group: { id: 'grp-1' }, isNew: true }),
    } as unknown as AlertWorkerDeps['alertGroupStore'],
    maintenanceStore: {
      isRuleSuppressed: vi.fn().mockResolvedValue(false),
    } as unknown as AlertWorkerDeps['maintenanceStore'],
    redisUrl: 'redis://localhost:6379/0',
    integrationPushEnabled: true,
    ...overrides,
  };
}

describe('AlertWorker — Integration Push (A3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pushes to INTEGRATION_PUSH after alert creation', async () => {
    const deps = createMockDeps();
    const worker = new AlertWorker(deps);
    worker.start();

    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    await processor({
      id: 'job-1',
      attemptsMade: 0,
      timestamp: Date.now(),
      data: { tenantId: 'tenant-1', eventType: 'correlation.match', metric: 'matches', value: 3 },
    });

    // Get the integration queue mock (2nd Queue created — first is ALERT_EVALUATE)
    const { Queue } = await import('bullmq') as unknown as { Queue: ReturnType<typeof vi.fn> };
    const integrationQueueInstance = Queue.mock.results[1]?.value;
    expect(integrationQueueInstance).toBeDefined();
    expect(integrationQueueInstance.add).toHaveBeenCalledWith(
      'integration-push',
      expect.objectContaining({
        tenantId: 'tenant-1',
        event: 'alert.created',
        payload: expect.objectContaining({
          entityType: 'alert',
          entityId: 'alert-1',
          severity: 'high',
          triggerEvent: 'alert_created',
        }),
      }),
    );
  });

  it('passes the Redis password and db from the URL to every BullMQ connection (RCA #66)', async () => {
    const deps = createMockDeps({ redisUrl: 'redis://:s3cr%40t@etip_redis:6380/2' });
    const worker = new AlertWorker(deps);
    worker.start();

    const { Queue, Worker } = await import('bullmq') as unknown as { Queue: ReturnType<typeof vi.fn>; Worker: ReturnType<typeof vi.fn> };
    const expected = { host: 'etip_redis', port: 6380, password: 's3cr@t', db: 2 };
    for (const call of [...Queue.mock.calls, ...Worker.mock.calls]) {
      const opts = call[call.length - 1] as { connection: unknown };
      expect(opts.connection).toEqual(expected);
    }
    expect(Queue.mock.calls.length + Worker.mock.calls.length).toBe(3);
  });

  it('does NOT create integration queue when disabled', async () => {
    const deps = createMockDeps({ integrationPushEnabled: false });
    const worker = new AlertWorker(deps);

    // Only 1 Queue created (ALERT_EVALUATE), not 2
    const { Queue } = await import('bullmq') as unknown as { Queue: ReturnType<typeof vi.fn> };
    expect(Queue).toHaveBeenCalledTimes(1);
    void worker;
  });

  it('handles integration push failure gracefully', async () => {
    const deps = createMockDeps();
    const worker = new AlertWorker(deps);
    worker.start();

    // Make integration queue.add reject
    const { Queue } = await import('bullmq') as unknown as { Queue: ReturnType<typeof vi.fn> };
    const integrationQueueInstance = Queue.mock.results[1]?.value;
    integrationQueueInstance.add.mockRejectedValue(new Error('Redis down'));

    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    // Should not throw
    await expect(processor({
      id: 'job-2',
      attemptsMade: 0,
      timestamp: Date.now(),
      data: { tenantId: 'tenant-1', eventType: 'correlation.match' },
    })).resolves.toBeUndefined();
  });

  it('stops integration queue on shutdown', async () => {
    const deps = createMockDeps();
    const worker = new AlertWorker(deps);
    await worker.stop();

    const { Queue } = await import('bullmq') as unknown as { Queue: ReturnType<typeof vi.fn> };
    const integrationQueueInstance = Queue.mock.results[1]?.value;
    expect(integrationQueueInstance.close).toHaveBeenCalled();
  });

  // ─── Step 3 S155: queue prefix, DB_UNAVAILABLE, retries, malformed payloads ──

  it('constructs Queue and Worker without a prefix option', async () => {
    const deps = createMockDeps();
    const worker = new AlertWorker(deps);
    worker.start();

    const { Queue, Worker } = await import('bullmq') as unknown as { Queue: ReturnType<typeof vi.fn>; Worker: ReturnType<typeof vi.fn> };
    for (const call of Queue.mock.calls) {
      expect(call[1]?.prefix).toBeUndefined();
    }
    for (const call of Worker.mock.calls) {
      expect(call[2]?.prefix).toBeUndefined();
    }
  });

  it('rethrows a DB_UNAVAILABLE AppError from a store instead of swallowing it', async () => {
    const deps = createMockDeps({
      alertStore: {
        findDuplicate: vi.fn().mockRejectedValue(new AppError(503, 'Alerting database unavailable', 'DB_UNAVAILABLE')),
        recordDuplicate: vi.fn(),
        create: vi.fn(),
      } as unknown as AlertWorkerDeps['alertStore'],
    });
    const worker = new AlertWorker(deps);
    worker.start();

    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    await expect(processor({
      id: 'job-3', attemptsMade: 0, timestamp: Date.now(),
      data: { tenantId: 'tenant-1', eventType: 'correlation.match' },
    })).rejects.toMatchObject({ code: 'DB_UNAVAILABLE' });
  });

  it('swallows a non-DB error and continues', async () => {
    const deps = createMockDeps({
      alertStore: {
        findDuplicate: vi.fn().mockRejectedValue(new Error('boom')),
        recordDuplicate: vi.fn(),
        create: vi.fn(),
      } as unknown as AlertWorkerDeps['alertStore'],
    });
    const worker = new AlertWorker(deps);
    worker.start();

    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    await expect(processor({
      id: 'job-4', attemptsMade: 0, timestamp: Date.now(),
      data: { tenantId: 'tenant-1', eventType: 'correlation.match' },
    })).resolves.toBeUndefined();
  });

  it('a retry (attemptsMade > 0) does not push into the rule engine buffer and does not recordDuplicate on a fresh duplicate', async () => {
    const deps = createMockDeps({
      alertStore: {
        findDuplicate: vi.fn().mockResolvedValue({ id: 'existing-alert' }),
        recordDuplicate: vi.fn().mockResolvedValue(undefined),
        create: vi.fn(),
      } as unknown as AlertWorkerDeps['alertStore'],
    });
    const worker = new AlertWorker(deps);
    worker.start();

    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    await processor({
      id: 'job-5', attemptsMade: 1, timestamp: Date.now(),
      data: { tenantId: 'tenant-1', eventType: 'correlation.match' },
    });

    expect(deps.ruleEngine.pushEvent).not.toHaveBeenCalled();
    expect(deps.alertStore.recordDuplicate).not.toHaveBeenCalled();
  });

  it('skips a malformed payload without throwing', async () => {
    const deps = createMockDeps();
    const worker = new AlertWorker(deps);
    worker.start();

    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    await expect(processor({
      id: 'job-6', attemptsMade: 0, timestamp: Date.now(),
      data: { tenantId: '', eventType: 'x' },
    })).resolves.toBeUndefined();
    expect(deps.ruleEngine.pushEvent).not.toHaveBeenCalled();

    await expect(processor({
      id: 'job-7', attemptsMade: 0, timestamp: Date.now(),
      data: {},
    })).resolves.toBeUndefined();
  });
});
