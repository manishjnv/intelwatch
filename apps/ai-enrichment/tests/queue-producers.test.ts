import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string) => ({
    name,
    add: vi.fn().mockResolvedValue({ id: `${name}-job-1` }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../src/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    TI_REDIS_URL: 'redis://localhost:6379/0',
    TI_GRAPH_SYNC_ENABLED: true,
    TI_IOC_INDEX_ENABLED: true,
    TI_CORRELATE_ENABLED: true,
  }),
}));

import { createDownstreamQueues, closeDownstreamQueues } from '../src/queue.js';
import { getConfig } from '../src/config.js';

describe('Downstream Queue Producers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates all 4 queues when all flags enabled', () => {
    const queues = createDownstreamQueues();
    expect(queues.graphSync).not.toBeNull();
    expect(queues.iocIndex).not.toBeNull();
    expect(queues.correlate).not.toBeNull();
    expect(queues.cacheInvalidate).not.toBeNull();
    expect((queues.graphSync as unknown as { name: string }).name).toBe('etip-graph-sync');
    expect((queues.iocIndex as unknown as { name: string }).name).toBe('etip-ioc-indexed');
    expect((queues.correlate as unknown as { name: string }).name).toBe('etip-correlate');
    expect((queues.cacheInvalidate as unknown as { name: string }).name).toBe('etip-cache-invalidate');
  });

  it('returns null for disabled queues', () => {
    vi.mocked(getConfig).mockReturnValue({
      TI_REDIS_URL: 'redis://localhost:6379/0',
      TI_GRAPH_SYNC_ENABLED: false,
      TI_IOC_INDEX_ENABLED: true,
      TI_CORRELATE_ENABLED: false,
    } as ReturnType<typeof getConfig>);

    const queues = createDownstreamQueues();
    expect(queues.graphSync).toBeNull();
    expect(queues.iocIndex).not.toBeNull();
    expect(queues.correlate).toBeNull();
  });

  it('closes all queues without error', async () => {
    createDownstreamQueues();
    await expect(closeDownstreamQueues()).resolves.toBeUndefined();
  });

  it('close is safe when queues not created', async () => {
    await expect(closeDownstreamQueues()).resolves.toBeUndefined();
  });
});
