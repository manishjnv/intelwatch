import { gunzipSync } from 'node:zlib';
import { AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_URL = 'https://epss.cyentia.com/epss_scores-current.csv.gz';
const DEFAULT_TIMEOUT_MS = 120_000; // 120s — large file download
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB compressed
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/* ── Option types ────────────────────────────────────────────────────── */

export interface FirstEpssConnectorOptions {
  /** EPSS scores URL (default: FIRST.org gzipped CSV) */
  url?: string;
  /** Request timeout in ms (default: 120000) */
  timeoutMs?: number;
  /** Max rows to return (default: 300000) */
  maxItems?: number;
  /** Minimum EPSS score threshold to include (default: 0.001 to filter noise) */
  minEpssScore?: number;
  /** Set to false to skip gzip decompression (for testing with raw CSV) */
  gzip?: boolean;
}

/* ── Connector ───────────────────────────────────────────────────────── */

/** FIRST EPSS connector — fetches EPSS scores for all CVEs (gzipped CSV). */
export class FirstEpssConnector {
  constructor(private readonly logger: pino.Logger) {}

  async fetch(opts: FirstEpssConnectorOptions = {}): Promise<ConnectorResult> {
    const url = opts.url ?? DEFAULT_URL;
    const maxItems = opts.maxItems ?? 300_000;
    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const minScore = opts.minEpssScore ?? 0.001;
    const useGzip = opts.gzip !== false;
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ url, error: message }, 'EPSS download failed');
      throw new AppError(502, `EPSS download failed: ${message}`, 'CONNECTOR_FETCH_FAILED');
    }

    if (!res.ok) {
      this.logger.warn({ url, status: res.status }, 'EPSS HTTP error');
      throw new AppError(502, `EPSS HTTP ${res.status}`, 'CONNECTOR_HTTP_ERROR');
    }

    let bodyBuffer: Buffer;
    try {
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > MAX_RESPONSE_BYTES) {
        throw new AppError(413, `EPSS file exceeds ${MAX_RESPONSE_BYTES} bytes`, 'CONNECTOR_FILE_TOO_LARGE');
      }
      bodyBuffer = Buffer.from(arrayBuf);
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `EPSS download read failed: ${message}`, 'CONNECTOR_FETCH_FAILED');
    }

    // Decompress gzip
    let content: string;
    try {
      content = useGzip ? gunzipSync(bodyBuffer).toString('utf-8') : bodyBuffer.toString('utf-8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `EPSS gzip decompression failed: ${message}`, 'CONNECTOR_PARSE_FAILED');
    }

    // Parse CSV
    const { articles, modelDate } = parseEpssCSV(content, { maxItems, minScore });
    const fetchDurationMs = Date.now() - start;

    this.logger.info(
      { url, totalRows: articles.length, minScore, modelDate, fetchDurationMs },
      'EPSS scores fetched and parsed',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: 'FIRST EPSS Scores',
      feedDescription: `EPSS scores (model: ${modelDate ?? 'unknown'}) — ${articles.length} CVEs above threshold ${minScore}`,
    };
  }
}

/* ── CSV Parsing ─────────────────────────────────────────────────────── */

interface ParseOptions {
  maxItems: number;
  minScore: number;
}

interface ParseResult {
  articles: FetchedArticle[];
  modelDate: string | null;
}

/**
 * Parse EPSS CSV format:
 *   Line 1: #model_version:v2024.01.01,score_date:2026-03-31T00:00:00+0000
 *   Line 2: cve,epss,percentile
 *   Line 3+: CVE-YYYY-NNNN,0.12345,0.67890
 */
export function parseEpssCSV(content: string, opts: ParseOptions): ParseResult {
  const lines = content.split('\n');
  const articles: FetchedArticle[] = [];
  let modelDate: string | null = null;
  let headerSeen = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Extract model date from comment line
    if (trimmed.startsWith('#')) {
      const scoreDateMatch = trimmed.match(/score_date:([^,\s]+)/);
      if (scoreDateMatch) modelDate = scoreDateMatch[1]!;
      continue;
    }

    // Skip header row
    if (!headerSeen && trimmed.toLowerCase().startsWith('cve,')) {
      headerSeen = true;
      continue;
    }

    if (articles.length >= opts.maxItems) break;

    const parts = trimmed.split(',');
    if (parts.length < 3) continue;

    const cve = parts[0]!.trim();
    const epssScore = parseFloat(parts[1]!);
    const epssPercentile = parseFloat(parts[2]!);

    // Validate CVE format
    if (!/^CVE-\d{4}-\d{4,}$/i.test(cve)) continue;
    if (isNaN(epssScore) || isNaN(epssPercentile)) continue;

    // Filter below minimum score
    if (epssScore < opts.minScore) continue;

    articles.push({
      title: `[EPSS] ${cve}`,
      content: cve,
      url: `https://nvd.nist.gov/vuln/detail/${cve}`,
      publishedAt: null,
      author: 'FIRST.org',
      rawMeta: {
        bulkImport: true,
        iocValue: cve,
        iocType: 'cve',
        source: 'first_epss',
        epssScore,
        epssPercentile,
        epssModelDate: modelDate,
      },
    });
  }

  return { articles, modelDate };
}
