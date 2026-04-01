import { AppError } from '@etip/shared-utils';
import { parseCSV, type CSVColumnMap } from './bulk-file.js';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB (Feodo data is small)
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/* ── Option types ────────────────────────────────────────────────────── */

export interface FeodoConnectorOptions {
  /** CSV download URL (default: ipblocklist.csv) */
  url?: string;
  /** Max IOCs to return (default: 50000) */
  maxItems?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/* ── Feodo CSV column layout ─────────────────────────────────────────── */
// first_seen_utc(0), dst_ip(1), dst_port(2), last_online(3), malware(4)

const FEODO_COLUMN_MAP: CSVColumnMap = { value: 1 };

const DEFAULT_CSV_URL = 'https://feodotracker.abuse.ch/downloads/ipblocklist.csv';

/* ── Connector ───────────────────────────────────────────────────────── */

/** Feodo Tracker connector — fetches botnet C2 IPs from abuse.ch. */
export class FeodoConnector {
  constructor(private readonly logger: pino.Logger) {}

  async fetch(opts: FeodoConnectorOptions = {}): Promise<ConnectorResult> {
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
      this.logger.error({ url: csvUrl, error: message }, 'Feodo CSV fetch failed');
      throw new AppError(502, `Feodo CSV fetch failed: ${message}`, 'CONNECTOR_FETCH_FAILED');
    }

    if (!res.ok) {
      this.logger.warn({ url: csvUrl, status: res.status }, 'Feodo CSV HTTP error');
      throw new AppError(502, `Feodo CSV HTTP ${res.status}`, 'CONNECTOR_HTTP_ERROR');
    }

    // ── Read body ─────────────────────────────────────────────────
    let content: string;
    try {
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > MAX_RESPONSE_BYTES) {
        throw new AppError(413, 'Feodo CSV exceeds 10MB limit', 'CONNECTOR_FILE_TOO_LARGE');
      }
      content = Buffer.from(arrayBuf).toString('utf-8');
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `Failed to read Feodo CSV: ${message}`, 'CONNECTOR_READ_FAILED');
    }

    // ── Parse CSV (reuse BulkFileConnector parser) ────────────────
    const rawArticles = parseCSV(content, {
      hasHeaders: false,
      columnMap: FEODO_COLUMN_MAP,
      delimiter: ',',
      maxItems,
    });

    // Enrich rawMeta with Feodo-specific fields
    const articles = rawArticles.map((a) => enrichFeodoArticle(a));

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { url: csvUrl, itemCount: articles.length, fetchDurationMs },
      'Feodo CSV parsed',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: 'Feodo Tracker (abuse.ch)',
      feedDescription: 'Botnet C2 indicators from Feodo Tracker',
    };
  }
}

/* ── Mapping ─────────────────────────────────────────────────────────── */

/** Enrich a parsed article with Feodo-specific metadata. */
function enrichFeodoArticle(article: FetchedArticle): FetchedArticle {
  const columns = (article.rawMeta.columns as string[]) ?? [];
  // CSV columns: first_seen_utc(0), dst_ip(1), dst_port(2), last_online(3), malware(4)
  const firstSeen = columns[0] ?? null;
  const ipAddress = columns[1] ?? '';
  const port = columns[2] ?? null;
  const lastOnline = columns[3] ?? null;
  const malware = columns[4] ?? null;

  const malwareFamilies = malware ? [malware] : [];

  return {
    title: `[Feodo] ${malware ?? 'C2'} — ${ipAddress}:${port ?? '?'}`,
    content: ipAddress,
    url: `https://feodotracker.abuse.ch/browse/host/${ipAddress}/`,
    publishedAt: parseFeodoDate(firstSeen),
    author: 'abuse.ch',
    rawMeta: {
      bulkImport: true,
      iocValue: ipAddress,
      iocType: 'ip',
      source: 'feodo',
      sourceConfidence: 0.95,
      port: port ? parseInt(port, 10) : null,
      lastOnline,
      malware,
      malwareFamilies,
      tags: malware ? [malware.toLowerCase()] : [],
      firstSeen,
    },
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** Parse Feodo date format "2026-03-30 12:00:00" to Date. */
function parseFeodoDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}
