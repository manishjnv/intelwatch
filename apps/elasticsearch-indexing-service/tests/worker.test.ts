import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock bullmq before importing worker
vi.mock('bullmq', () => {
  const Worker = vi.fn(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }));
  const Queue = vi.fn(() => ({
    getWaiting: vi.fn().mockResolvedValue([]),
    getActive: vi.fn().mockResolvedValue([]),
    getDelayed: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  }));
  return { Worker, Queue };
});

import { IocIndexWorker } from '../src/worker.js';
import type { IocIndexer } from '../src/ioc-indexer.js';

function makeIndexer(): IocIndexer {
  return {
    indexIOC: vi.fn().mockResolvedValue(undefined),
    updateIOC: vi.fn().mockResolvedValue(undefined),
    deleteIOC: vi.fn().mockResolvedValue(undefined),
    reindexTenant: vi.fn().mockResolvedValue({ indexed: 0, failed: 0 }),
  } as unknown as IocIndexer;
}

describe('IocIndexWorker', () => {
  let indexer: IocIndexer;
  let worker: IocIndexWorker;

  beforeEach(() => {
    indexer = makeIndexer();
    worker = new IocIndexWorker('redis://localhost:6379/0', indexer);
  });

  afterEach(async () => {
    await worker.stop();
  });

  it('creates a BullMQ Worker on the ioc-indexed queue', async () => {
    const { Worker } = await import('bullmq');
    expect(Worker).toHaveBeenCalledWith(
      'etip-ioc-indexed',
      expect.any(Function),
      expect.objectContaining({ connection: expect.objectContaining({}) }),
    );
  });

  it('exposes a stop() method', () => {
    expect(typeof worker.stop).toBe('function');
  });

  it('exposes a getQueueDepth() method', () => {
    expect(typeof worker.getQueueDepth).toBe('function');
  });

  it('getQueueDepth returns a number', async () => {
    const depth = await worker.getQueueDepth();
    expect(typeof depth).toBe('number');
  });

  const fullPayload = {
    iocId: 'ioc-001',
    tenantId: 'tenant-abc',
    value: '1.2.3.4',
    normalizedValue: '1.2.3.4',
    type: 'ip',
    severity: 'high',
    confidence: 80,
    lifecycle: 'active',
    tags: [],
    mitreAttack: [],
    malwareFamilies: [],
    threatActors: [],
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastSeen: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    enriched: false,
    archived: false,
    tlp: 'WHITE',
  };

  it('processes index action by calling indexer.indexIOC', async () => {
    const { Worker } = await import('bullmq');
    const calls = vi.mocked(Worker).mock.calls;
    const processorFn = calls[calls.length - 1]?.[1] as
      | ((job: { data: unknown }) => Promise<void>)
      | undefined;

    if (!processorFn) throw new Error('Worker processor not captured');

    await processorFn({
      data: {
        action: 'index',
        iocId: 'ioc-001',
        tenantId: 'tenant-abc',
        payload: fullPayload,
      },
    });
    expect(indexer.indexIOC).toHaveBeenCalledWith('tenant-abc', 'ioc-001', fullPayload);
  });

  it('processes update action by calling indexer.updateIOC with iocType', async () => {
    const { Worker } = await import('bullmq');
    const calls = vi.mocked(Worker).mock.calls;
    const processorFn = calls[calls.length - 1]?.[1] as
      | ((job: { data: unknown }) => Promise<void>)
      | undefined;

    if (!processorFn) throw new Error('Worker processor not captured');

    await processorFn({
      data: {
        action: 'update',
        iocId: 'ioc-002',
        tenantId: 'tenant-xyz',
        iocType: 'ip',
        payload: { severity: 'critical' },
      },
    });
    expect(indexer.updateIOC).toHaveBeenCalledWith('tenant-xyz', 'ioc-002', {
      severity: 'critical',
    }, 'ip');
  });

  it('drops an invalid job (index action without payload) — logs warn, no ES call', async () => {
    const { Worker } = await import('bullmq');
    const calls = vi.mocked(Worker).mock.calls;
    const processorFn = calls[calls.length - 1]?.[1] as
      | ((job: { data: unknown }) => Promise<void>)
      | undefined;

    if (!processorFn) throw new Error('Worker processor not captured');

    await expect(
      processorFn({ data: { action: 'index', iocId: 'ioc-003', tenantId: 'tenant-abc' } }),
    ).resolves.not.toThrow();
    expect(indexer.indexIOC).not.toHaveBeenCalled();
    expect(indexer.updateIOC).not.toHaveBeenCalled();
  });

  it('drops a job whose payload tenantId/iocId differs from the job (no cross-tenant doc)', async () => {
    const { Worker } = await import('bullmq');
    const calls = vi.mocked(Worker).mock.calls;
    const processorFn = calls[calls.length - 1]?.[1] as
      | ((job: { data: unknown }) => Promise<void>)
      | undefined;
    if (!processorFn) throw new Error('Worker processor not captured');

    await processorFn({ data: { action: 'index', iocId: 'ioc-001', tenantId: 'tenant-other', payload: fullPayload } });
    await processorFn({ data: { action: 'index', iocId: 'ioc-999', tenantId: 'tenant-abc', payload: fullPayload } });
    await processorFn({
      data: { action: 'update', iocId: 'ioc-001', tenantId: 'tenant-other', iocType: 'ip', payload: { tenantId: 'tenant-abc' } },
    });
    expect(indexer.indexIOC).not.toHaveBeenCalled();
    expect(indexer.updateIOC).not.toHaveBeenCalled();
  });

  it('processes delete action by calling indexer.deleteIOC', async () => {
    const { Worker } = await import('bullmq');
    const calls = vi.mocked(Worker).mock.calls;
    const processorFn = calls[calls.length - 1]?.[1] as
      | ((job: { data: unknown }) => Promise<void>)
      | undefined;

    if (!processorFn) throw new Error('Worker processor not captured');

    await processorFn({
      data: {
        action: 'delete',
        iocId: 'ioc-003',
        tenantId: 'tenant-abc',
      },
    });
    expect(indexer.deleteIOC).toHaveBeenCalledWith('tenant-abc', 'ioc-003');
  });

  it('does not throw on unknown action (graceful skip)', async () => {
    const { Worker } = await import('bullmq');
    const calls = vi.mocked(Worker).mock.calls;
    const processorFn = calls[calls.length - 1]?.[1] as
      | ((job: { data: unknown }) => Promise<void>)
      | undefined;

    if (!processorFn) throw new Error('Worker processor not captured');

    await expect(
      processorFn({ data: { action: 'unknown', iocId: 'x', tenantId: 'y' } }),
    ).resolves.not.toThrow();
  });
});
