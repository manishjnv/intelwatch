import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config.js', () => ({
  getConfig: () => ({
    TI_REDIS_URL: 'redis://localhost:6379/0',
    TI_CORRELATION_WORKER_CONCURRENCY: 1,
    TI_CORRELATION_WINDOW_HOURS: 24,
    TI_CORRELATION_CONFIDENCE_THRESHOLD: 0.6,
    TI_CORRELATION_MAX_RESULTS: 10000,
    TI_ALERT_ENABLED: true,
    TI_INTEGRATION_PUSH_ENABLED: true,
  }),
  loadConfig: vi.fn(),
}));

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

import {
  createCorrelateWorker,
  createDownstreamQueues,
  closeDownstreamQueues,
  type DownstreamQueues,
  type CorrelateWorkerDeps,
} from '../src/workers/correlate.js';

function createMockStore() {
  return {
    getTenantIOCs: vi.fn().mockReturnValue(new Map()),
    getTenantResults: vi.fn().mockReturnValue(new Map()),
    getTenantWaves: vi.fn().mockReturnValue([]),
    getTenantCampaigns: vi.fn().mockReturnValue(new Map()),
    getTenantRuleStats: vi.fn().mockReturnValue(new Map()),
  };
}

function createMockServices() {
  return {
    cooccurrence: {
      detectCooccurrences: vi.fn().mockReturnValue([]),
      toCorrelationResults: vi.fn().mockReturnValue([]),
    },
    infraCluster: {
      detectClusters: vi.fn().mockReturnValue([]),
      toCorrelationResults: vi.fn().mockReturnValue([]),
    },
    temporalWave: { detectWaves: vi.fn().mockReturnValue([]) },
    campaignCluster: { detectCampaigns: vi.fn().mockReturnValue([]) },
    fpSuppression: { applySuppression: vi.fn().mockImplementation((results) => results) },
    confidenceScoring: {},
  };
}

function createMockDownstream(): DownstreamQueues {
  return {
    alertEvaluate: { add: vi.fn().mockResolvedValue({ id: 'a-1' }), close: vi.fn() } as unknown as DownstreamQueues['alertEvaluate'],
    integrationPush: { add: vi.fn().mockResolvedValue({ id: 'i-1' }), close: vi.fn() } as unknown as DownstreamQueues['integrationPush'],
  };
}

function createMockLogger() {
  return {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    fatal: vi.fn(), trace: vi.fn(), child: vi.fn().mockReturnThis(),
  };
}

const VALID_PAYLOAD = {
  tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  entityType: 'ioc' as const,
  entityId: '550e8400-e29b-41d4-a716-446655440000',
  triggerEvent: 'enrichment_complete',
};

describe('Correlation Worker — Downstream Enqueue', () => {
  let downstream: DownstreamQueues;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    downstream = createMockDownstream();
    mockLogger = createMockLogger();
  });

  it('enqueues to INTEGRATION_PUSH on zero matches (always push)', async () => {
    const services = createMockServices();
    // Zero correlation results → zero matches
    services.cooccurrence.toCorrelationResults.mockReturnValue([]);
    services.infraCluster.toCorrelationResults.mockReturnValue([]);

    const deps: CorrelateWorkerDeps = {
      store: createMockStore() as unknown as CorrelateWorkerDeps['store'],
      ...services,
      logger: mockLogger as unknown as CorrelateWorkerDeps['logger'],
      downstream,
    } as unknown as CorrelateWorkerDeps;

    createCorrelateWorker(deps);
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    await processor({ id: 'job-1', data: VALID_PAYLOAD });

    // Integration always fires — shape: { tenantId, event, payload }
    expect((downstream.integrationPush as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
      'integration-push',
      expect.objectContaining({
        tenantId: VALID_PAYLOAD.tenantId,
        event: 'correlation.match',
        payload: expect.objectContaining({ matchCount: 0 }),
      }),
    );

    // Alert should NOT fire (0 matches)
    expect((downstream.alertEvaluate as unknown as { add: ReturnType<typeof vi.fn> }).add).not.toHaveBeenCalled();
  });

  it('enqueues to ALERT_EVALUATE when matches found', async () => {
    const services = createMockServices();
    // Return 2 correlation results above threshold
    const fakeResults = [
      { id: 'r1', confidence: 0.8, type: 'cooccurrence' },
      { id: 'r2', confidence: 0.7, type: 'cooccurrence' },
    ];
    services.cooccurrence.toCorrelationResults.mockReturnValue(fakeResults);
    services.fpSuppression.applySuppression.mockReturnValue(fakeResults);

    const deps: CorrelateWorkerDeps = {
      store: createMockStore() as unknown as CorrelateWorkerDeps['store'],
      ...services,
      logger: mockLogger as unknown as CorrelateWorkerDeps['logger'],
      downstream,
    } as unknown as CorrelateWorkerDeps;

    createCorrelateWorker(deps);
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    await processor({ id: 'job-2', data: VALID_PAYLOAD });

    // Alert fires because matches > 0
    expect((downstream.alertEvaluate as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
      'alert-evaluate',
      expect.objectContaining({
        tenantId: VALID_PAYLOAD.tenantId,
        eventType: 'correlation.match',
        value: 2,
      }),
    );

    // Integration always fires
    expect((downstream.integrationPush as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalled();
  });

  it('does not enqueue downstream when downstream is undefined', async () => {
    const services = createMockServices();
    const deps: CorrelateWorkerDeps = {
      store: createMockStore() as unknown as CorrelateWorkerDeps['store'],
      ...services,
      logger: mockLogger as unknown as CorrelateWorkerDeps['logger'],
      // no downstream
    } as unknown as CorrelateWorkerDeps;

    createCorrelateWorker(deps);
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    // Should not throw
    await expect(processor({ id: 'job-3', data: VALID_PAYLOAD })).resolves.toBeUndefined();
  });

  it('skips non-IOC entities (no downstream enqueue)', async () => {
    const services = createMockServices();
    const deps: CorrelateWorkerDeps = {
      store: createMockStore() as unknown as CorrelateWorkerDeps['store'],
      ...services,
      logger: mockLogger as unknown as CorrelateWorkerDeps['logger'],
      downstream,
    } as unknown as CorrelateWorkerDeps;

    createCorrelateWorker(deps);
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    await processor({ id: 'job-4', data: { ...VALID_PAYLOAD, entityType: 'threat_actor' } });

    // No matches for non-IOC → alert should not fire, integration should fire with matchCount 0
    expect((downstream.alertEvaluate as unknown as { add: ReturnType<typeof vi.fn> }).add).not.toHaveBeenCalled();
    expect((downstream.integrationPush as unknown as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
      'integration-push',
      expect.objectContaining({
        event: 'correlation.match',
        payload: expect.objectContaining({ matchCount: 0 }),
      }),
    );
  });

  it('handles downstream enqueue failure gracefully', async () => {
    const services = createMockServices();
    (downstream.integrationPush as unknown as { add: ReturnType<typeof vi.fn> }).add.mockRejectedValue(new Error('Redis down'));

    const deps: CorrelateWorkerDeps = {
      store: createMockStore() as unknown as CorrelateWorkerDeps['store'],
      ...services,
      logger: mockLogger as unknown as CorrelateWorkerDeps['logger'],
      downstream,
    } as unknown as CorrelateWorkerDeps;

    createCorrelateWorker(deps);
    const { __getProcessor } = await import('bullmq') as unknown as { __getProcessor: () => (job: unknown) => Promise<void> };
    const processor = __getProcessor();

    // Should not throw — fire-and-forget
    await expect(processor({ id: 'job-5', data: VALID_PAYLOAD })).resolves.toBeUndefined();
  });
});

describe('Downstream Queue Producers', () => {
  it('creates queues when flags enabled', () => {
    const queues = createDownstreamQueues();
    expect(queues.alertEvaluate).not.toBeNull();
    expect(queues.integrationPush).not.toBeNull();
  });

  it('closes without error', async () => {
    createDownstreamQueues();
    await expect(closeDownstreamQueues()).resolves.toBeUndefined();
  });
});
