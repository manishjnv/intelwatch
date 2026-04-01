import { AppError } from '@etip/shared-utils';
import { parseCSV, type CSVColumnMap } from './bulk-file.js';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024;
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/* ── Option types ────────────────────────────────────────────────────── */

export interface URLhausConnectorOptions {
  /** CSV download URL (default: recent URLs CSV) */
  url?: string;
  /** Max IOCs to return (default: 50000) */
  maxItems?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/* ── URLhaus CSV column layout ───────────────────────────────────────── */
// id, dateadded, url, url_status, last_online, threat, tags, urlhaus_link, reporter

const URLHAUS_COLUMN_MAP: CSVColumnMap = { value: 2, type: 5 };

const DEFAULT_CSV_URL = 'https://urlhaus.abuse.ch/downloads/csv_recent/';

/* ── Connector ───────────────────────────────────────────────────────── */

/** URLhaus connector — fetches malware distribution URLs from abuse.ch. */
export class URLhausConnector {
  constructor(private readonly logger: pino.Logger) {}

  async fetch(opts: URLhausConnectorOptions = {}): Promise<ConnectorResult> {
    const csvUrl = opts.url ?? DEFAULT_CSV_URL;
    const maxItems = opts.maxItems ?? 50_000;
    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const start = Date.now();

    // ── HTTP GET ──────────────────────────────────────────────────
    let res: Response;
    try {
      res = await fetch(csvUrl, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ url: csvUrl, error: message }, 'URLhaus CSV fetch failed');
      throw new AppError(502, `URLhaus CSV fetch failed: ${message}`, 'CONNECTOR_FETCH_FAILED');
    }

    if (!res.ok) {
      this.logger.warn({ url: csvUrl, status: res.status }, 'URLhaus CSV HTTP error');
      throw new AppError(502, `URLhaus CSV HTTP ${res.status}`, 'CONNECTOR_HTTP_ERROR');
    }

    // ── Read body ─────────────────────────────────────────────────
    let content: string;
    try {
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > MAX_RESPONSE_BYTES) {
        throw new AppError(413, 'URLhaus CSV exceeds 100MB limit', 'CONNECTOR_FILE_TOO_LARGE');
      }
      content = Buffer.from(arrayBuf).toString('utf-8');
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `Failed to read URLhaus CSV: ${message}`, 'CONNECTOR_READ_FAILED');
    }

    // ── Parse CSV (reuse BulkFileConnector parser) ────────────────
    const rawArticles = parseCSV(content, {
      hasHeaders: false,
      columnMap: URLHAUS_COLUMN_MAP,
      delimiter: ',',
      maxItems,
    });

    // Enrich rawMeta with URLhaus-specific fields
    const articles = rawArticles.map((a) => enrichURLhausArticle(a, content));

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { url: csvUrl, itemCount: articles.length, fetchDurationMs },
      'URLhaus CSV parsed',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: 'URLhaus (abuse.ch)',
      feedDescription: 'Malware distribution URLs from URLhaus',
    };
  }
}

/* ── Mapping ─────────────────────────────────────────────────────────── */

/** Enrich a parsed article with URLhaus-specific metadata. */
function enrichURLhausArticle(article: FetchedArticle, _csvContent: string): FetchedArticle {
  const columns = (article.rawMeta.columns as string[]) ?? [];
  // CSV columns: id(0), dateadded(1), url(2), url_status(3), last_online(4), threat(5), tags(6), urlhaus_link(7), reporter(8)
  const urlhausId = columns[0] ?? null;
  const dateAdded = columns[1] ?? null;
  const urlValue = columns[2] ?? '';
  const urlStatus = columns[3] ?? null;
  const lastOnline = columns[4] ?? null;
  const threat = columns[5] ?? null;
  const tagsRaw = columns[6] ?? '';
  const urlhausLink = columns[7] ?? null;
  const reporter = columns[8] ?? null;

  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const malwareFamilies = tags.length > 0 ? tags : (threat ? [threat] : []);

  return {
    title: `[URLhaus] ${threat ?? 'malware'} — ${urlValue}`,
    content: urlValue,
    url: urlhausLink,
    publishedAt: parseURLhausDate(dateAdded),
    author: reporter,
    rawMeta: {
      bulkImport: true,
      iocValue: urlValue,
      iocType: 'url',
      source: 'urlhaus',
      sourceConfidence: 0.8,
      urlhausId,
      urlStatus,
      lastOnline,
      threat,
      tags,
      malwareFamilies,
      urlhausLink,
    },
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** Parse URLhaus date format "2026-03-30 10:15:00" to Date. */
function parseURLhausDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}
