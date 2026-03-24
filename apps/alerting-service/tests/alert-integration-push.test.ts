import { describe, it, expect, vi, beforeEach } from 'vitest';

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
      getEnabledRules: vi.fn().mockReturnValue([
        {
          id: 'rule-1', name: 'High IOC Alert', tenantId: 'tenant-1',
          severity: 'high', channelIds: [], escalationPolicyId: null,
        },
      ]),
      isInCooldown: vi.fn().mockReturnValue(false),
      markTriggered: vi.fn(),
    } as unknown as AlertWorkerDeps['ruleStore'],
    alertStore: {
      create: vi.fn().mockReturnValue({
        id: 'alert-1', tenantId: 'tenant-1', severity: 'high',
        title: '[HIGH] High IOC Alert', status: 'open',
      }),
    } as unknown as AlertWorkerDeps['alertStore'],
    channelStore: { getByIds: vi.fn().mockReturnValue([]) } as unknown as AlertWorkerDeps['channelStore'],
    ruleEngine: {
      pushEvent: vi.fn(),
      evaluate: vi.fn().mockReturnValue({ triggered: true, reason: 'Threshold exceeded' }),
    } as unknown as AlertWorkerDeps['ruleEngine'],
    notifier: { notifyAll: vi.fn().mockResolvedValue([]) } as unknown as AlertWorkerDeps['notifier'],
    dedupStore: {
      fingerprint: vi.fn().mockReturnValue('fp-1'),
      check: vi.fn().mockReturnValue(null),
      record: vi.fn(),
    } as unknown as AlertWorkerDeps['dedupStore'],
    alertHistory: { record: vi.fn() } as unknown as AlertWorkerDeps['alertHistory'],
    escalationDispatcher: { track: vi.fn() } as unknown as AlertWorkerDeps['escalationDispatcher'],
    alertGroupStore: {
      addAlert: vi.fn().mockReturnValue({ group: { id: 'grp-1' }, isNew: true }),
    } as unknown as AlertWorkerDeps['alertGroupStore'],
    maintenanceStore: {
      isRuleSuppressed: vi.fn().mockReturnValue(false),
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
        eventType: 'alert.created',
        entityType: 'alert',
        entityId: 'alert-1',
        severity: 'high',
        triggerEvent: 'alert_created',
      }),
    );
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
});
