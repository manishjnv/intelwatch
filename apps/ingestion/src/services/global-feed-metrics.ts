/**
 * @module services/global-feed-metrics
 * @description Records and retrieves fetch metrics for global feeds.
 * Keeps a rolling window of last 10 fetch records per feed.
 */
import type { PrismaClient } from '@prisma/client';

export interface FetchMetrics {
  fetchDurationMs: number;
  articlesFound: number;
  articlesNew: number;
  articlesDuped: number;
  errorMessage?: string;
  timestamp?: string;
}

interface MetricsHistory {
  records: FetchMetrics[];
}

export interface FeedTrend {
  dates: string[];
  articleCounts: number[];
  iocCounts: number[];
  avgFetchDuration: number[];
}

const MAX_RECORDS = 10;

export class GlobalFeedMetrics {
  constructor(private readonly prisma: PrismaClient) {}

  async recordFetchMetrics(feedId: string, metrics: FetchMetrics): Promise<void> {
    const feed = await this.prisma.globalFeedCatalog.findUnique({
      where: { id: feedId },
      select: { parseConfig: true },
    });

    const existing: MetricsHistory = parseMetrics(feed?.parseConfig);
    const record = { ...metrics, timestamp: new Date().toISOString() };
    existing.records.push(record);

    // Rolling window: keep last 10
    if (existing.records.length > MAX_RECORDS) {
      existing.records = existing.records.slice(-MAX_RECORDS);
    }

    await this.prisma.globalFeedCatalog.update({
      where: { id: feedId },
      data: { parseConfig: existing as any },
    });
  }

  async getFeedTrend(feedId: string, days: number): Promise<FeedTrend> {
    const feed = await this.prisma.globalFeedCatalog.findUnique({
      where: { id: feedId },
      select: { parseConfig: true },
    });

    const history: MetricsHistory = parseMetrics(feed?.parseConfig);
    const cutoff = new Date(Date.now() - days * 86_400_000);

    const filtered = history.records.filter(
      r => r.timestamp && new Date(r.timestamp) >= cutoff,
    );

    if (filtered.length === 0) {
      return { dates: [], articleCounts: [], iocCounts: [], avgFetchDuration: [] };
    }

    // Aggregate by date
    const byDate = new Map<string, { articles: number; iocs: number; durations: number[] }>();
    for (const r of filtered) {
      const date = r.timestamp!.slice(0, 10);
      const entry = byDate.get(date) ?? { articles: 0, iocs: 0, durations: [] };
      entry.articles += r.articlesNew;
      entry.iocs += r.articlesFound; // best proxy
      entry.durations.push(r.fetchDurationMs);
      byDate.set(date, entry);
    }

    const dates = [...byDate.keys()].sort();
    return {
      dates,
      articleCounts: dates.map(d => byDate.get(d)!.articles),
      iocCounts: dates.map(d => byDate.get(d)!.iocs),
      avgFetchDuration: dates.map(d => {
        const dur = byDate.get(d)!.durations;
        return Math.round(dur.reduce((a, b) => a + b, 0) / dur.length);
      }),
    };
  }
}

function parseMetrics(raw: unknown): MetricsHistory {
  if (raw && typeof raw === 'object' && Array.isArray((raw as MetricsHistory).records)) {
    return raw as MetricsHistory;
  }
  return { records: [] };
}
