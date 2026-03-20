import Parser from 'rss-parser';
import { AppError } from '@etip/shared-utils';
import type pino from 'pino';

/** Standard shape returned by all connectors */
export interface FetchedArticle {
  title: string;
  content: string;
  url: string | null;
  publishedAt: Date | null;
  author: string | null;
  rawMeta: Record<string, unknown>;
}

export interface ConnectorResult {
  articles: FetchedArticle[];
  fetchDurationMs: number;
  feedTitle: string | null;
  feedDescription: string | null;
}

export interface RSSConnectorOptions {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxItems?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ITEMS = 100;

export class RSSConnector {
  constructor(private readonly logger: pino.Logger) {}

  async fetch(opts: RSSConnectorOptions): Promise<ConnectorResult> {
    const { url, headers, timeoutMs, maxItems } = opts;

    if (!url) {
      throw new AppError(400, 'RSS connector requires a feed URL', 'CONNECTOR_INVALID_CONFIG');
    }

    const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const limit = maxItems ?? DEFAULT_MAX_ITEMS;

    const start = Date.now();

    const parser = new Parser({
      timeout,
      headers: {
        'User-Agent': 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)',
        ...(headers ?? {}),
      },
      maxRedirects: 5,
    });

    let feed: Parser.Output<Record<string, unknown>>;
    try {
      feed = await parser.parseURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ url, error: message }, 'RSS fetch failed');
      throw new AppError(502, `Failed to fetch RSS feed: ${message}`, 'CONNECTOR_FETCH_FAILED');
    }

    const fetchDurationMs = Date.now() - start;

    const items = (feed.items ?? []).slice(0, limit);
    const articles: FetchedArticle[] = items.map((item) => ({
      title: item.title ?? '(untitled)',
      content: item.contentSnippet ?? item.content ?? item.summary ?? '',
      url: item.link ?? null,
      publishedAt: parseDate(item.pubDate ?? item.isoDate),
      author: (item.creator ?? item.author ?? null) as string | null,
      rawMeta: {
        guid: item.guid,
        categories: item.categories,
        enclosure: item.enclosure,
      },
    }));

    this.logger.info(
      { url, itemCount: articles.length, feedTitle: feed.title, fetchDurationMs },
      'RSS feed fetched',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: feed.title ?? null,
      feedDescription: feed.description ?? null,
    };
  }
}

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}
