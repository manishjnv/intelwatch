import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalFeedMetrics, type FetchMetrics } from '../src/services/global-feed-metrics.js';

function mockPrisma() {
  return {
    globalFeedCatalog: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('GlobalFeedMetrics', () => {
  let prisma: ReturnType<typeof mockPrisma>;
  let metrics: GlobalFeedMetrics;

  beforeEach(() => {
    prisma = mockPrisma();
    metrics = new GlobalFeedMetrics(prisma);
  });

  // ─── recordFetchMetrics ──────────────────────────────────────

  it('stores metrics for a feed', async () => {
    prisma.globalFeedCatalog.findUnique.mockResolvedValue({ parseConfig: { records: [] } });

    const data: FetchMetrics = {
      fetchDurationMs: 500, articlesFound: 10, articlesNew: 8, articlesDuped: 2,
    };
    await metrics.recordFetchMetrics('feed-1', data);

    expect(prisma.globalFeedCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'feed-1' },
        data: { parseConfig: expect.objectContaining({ records: expect.any(Array) }) },
      }),
    );
    const saved = prisma.globalFeedCatalog.update.mock.calls[0][0].data.parseConfig;
    expect(saved.records).toHaveLength(1);
    expect(saved.records[0].articlesNew).toBe(8);
  });

  it('keeps last 10 records (rolling window)', async () => {
    const existing = Array.from({ length: 10 }, (_, i) => ({
      fetchDurationMs: 100, articlesFound: i, articlesNew: i, articlesDuped: 0,
      timestamp: new Date(Date.now() - (10 - i) * 3600_000).toISOString(),
    }));
    prisma.globalFeedCatalog.findUnique.mockResolvedValue({ parseConfig: { records: existing } });

    await metrics.recordFetchMetrics('feed-1', {
      fetchDurationMs: 200, articlesFound: 99, articlesNew: 99, articlesDuped: 0,
    });

    const saved = prisma.globalFeedCatalog.update.mock.calls[0][0].data.parseConfig;
    expect(saved.records).toHaveLength(10);
    expect(saved.records[9].articlesNew).toBe(99);
  });

  // ─── getFeedTrend ──────────────────────────────────────────

  it('returns correct date-aggregated data', async () => {
    const today = new Date().toISOString().slice(0, 10);
    prisma.globalFeedCatalog.findUnique.mockResolvedValue({
      parseConfig: {
        records: [
          { fetchDurationMs: 300, articlesFound: 5, articlesNew: 3, articlesDuped: 2, timestamp: `${today}T10:00:00Z` },
          { fetchDurationMs: 500, articlesFound: 8, articlesNew: 6, articlesDuped: 2, timestamp: `${today}T14:00:00Z` },
        ],
      },
    });

    const trend = await metrics.getFeedTrend('feed-1', 7);
    expect(trend.dates).toEqual([today]);
    expect(trend.articleCounts).toEqual([9]); // 3 + 6
    expect(trend.avgFetchDuration).toEqual([400]); // (300+500)/2
  });

  it('empty data returns empty arrays', async () => {
    prisma.globalFeedCatalog.findUnique.mockResolvedValue({ parseConfig: {} });
    const trend = await metrics.getFeedTrend('feed-1', 7);
    expect(trend.dates).toEqual([]);
    expect(trend.articleCounts).toEqual([]);
    expect(trend.iocCounts).toEqual([]);
    expect(trend.avgFetchDuration).toEqual([]);
  });
});
