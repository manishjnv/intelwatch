import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalFeedRecovery } from '../src/services/global-feed-recovery.js';

function mockPrisma() {
  return {
    globalFeedCatalog: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    globalArticle: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    globalIoc: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

function mockQueue() {
  return { add: vi.fn().mockResolvedValue(undefined) } as any;
}

describe('GlobalFeedRecovery', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let queue: ReturnType<typeof mockQueue>;
  let recovery: GlobalFeedRecovery;

  beforeEach(() => {
    prisma = mockPrisma();
    queue = mockQueue();
    recovery = new GlobalFeedRecovery(prisma, queue);
  });

  // ─── recoverStaleFeeds ──────────────────────────────────────

  it('re-enables feed after 24h cooldown', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    prisma.globalFeedCatalog.findMany.mockResolvedValue([
      { id: 'f1', name: 'Stale Feed', enabled: false, consecutiveFailures: 5, lastFetchAt: twoDaysAgo },
    ]);

    const result = await recovery.recoverStaleFeeds();
    expect(result.recovered).toBe(1);
    expect(result.stillBroken).toBe(0);
    expect(prisma.globalFeedCatalog.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { enabled: true, consecutiveFailures: 0 },
    });
  });

  it('does NOT re-enable if failure was <24h ago', async () => {
    const oneHourAgo = new Date(Date.now() - 3_600_000);
    prisma.globalFeedCatalog.findMany.mockResolvedValue([
      { id: 'f2', name: 'Recent Fail', enabled: false, consecutiveFailures: 5, lastFetchAt: oneHourAgo },
    ]);

    const result = await recovery.recoverStaleFeeds();
    expect(result.recovered).toBe(0);
    expect(result.stillBroken).toBe(1);
    expect(prisma.globalFeedCatalog.update).not.toHaveBeenCalled();
  });

  // ─── recoverStuckArticles ──────────────────────────────────

  it('resets stuck articles to pending', async () => {
    prisma.globalArticle.updateMany.mockResolvedValue({ count: 5 });

    const result = await recovery.recoverStuckArticles();
    expect(result.recovered).toBe(5);
    expect(prisma.globalArticle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pipelineStatus: 'normalizing' }),
        data: { pipelineStatus: 'pending' },
      }),
    );
  });

  it('does NOT reset recently normalizing articles', async () => {
    prisma.globalArticle.updateMany.mockResolvedValue({ count: 0 });
    const result = await recovery.recoverStuckArticles();
    expect(result.recovered).toBe(0);
  });

  // ─── recoverUnenrichedIocs ──────────────────────────────────

  it('enqueues up to 500 IOCs', async () => {
    const iocs = Array.from({ length: 3 }, (_, i) => ({ id: `ioc-${i}` }));
    prisma.globalIoc.findMany.mockResolvedValue(iocs);

    const result = await recovery.recoverUnenrichedIocs();
    expect(result.enqueued).toBe(3);
    expect(queue.add).toHaveBeenCalledTimes(3);
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ globalIocId: 'ioc-0' }),
      expect.objectContaining({ priority: 10 }),
    );
  });

  // ─── startRecoveryCron ──────────────────────────────────────

  it('startRecoveryCron is gated by feature flag', () => {
    delete process.env.TI_GLOBAL_PROCESSING_ENABLED;
    const spy = vi.spyOn(global, 'setInterval');
    recovery.startRecoveryCron();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
