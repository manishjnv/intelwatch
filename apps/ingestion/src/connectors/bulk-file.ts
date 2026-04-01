import { parse as csvParse } from 'csv-parse/sync';
import { gunzipSync } from 'node:zlib';
import { AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024; // 100 MB (bulk files can be large)
const DEFAULT_MAX_ITEMS = 50_000;
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/* ── Option types ────────────────────────────────────────────────────── */

/** Column mapping — accepts column name (string) or index (number). */
export interface CSVColumnMap {
  value: string | number;
  type?: string | number;
}

export interface CSVParseOptions {
  delimiter?: string;
  hasHeaders?: boolean;
  columnMap: CSVColumnMap;
  maxItems?: number;
}

export interface JSONLFieldMap {
  value: string;
  type?: string;
}

export interface JSONLParseOptions {
  fieldMap: JSONLFieldMap;
  maxItems?: number;
}

export interface PlaintextParseOptions {
  maxItems?: number;
}

export interface BulkFileConnectorOptions {
  url: string;
  format: 'csv' | 'plaintext' | 'jsonl';
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxItems?: number;
  compression?: 'gzip' | 'none';
  /** CSV-specific */
  delimiter?: string;
  hasHeaders?: boolean;
  columnMap?: CSVColumnMap;
  /** JSONL-specific */
  fieldMap?: JSONLFieldMap;
}

/* ── Parse functions (exported for direct testing) ───────────────────── */

/**
 * Parse CSV content into FetchedArticles.
 * Skips lines starting with # (comments) and blank lines.
 */
export function parseCSV(content: string, opts: CSVParseOptions): FetchedArticle[] {
  if (!content.trim()) return [];

  // Pre-filter comment lines (csv-parse doesn't support # comments natively)
  const filtered = content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#');
    })
    .join('\n');

  if (!filtered.trim()) return [];

  const delimiter = opts.delimiter ?? ',';
  const hasHeaders = opts.hasHeaders ?? false;
  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;

  const records: string[][] = csvParse(filtered, {
    delimiter,
    columns: false,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  // If hasHeaders, extract header row and build name→index map
  let headerMap: Record<string, number> | null = null;
  let dataRows = records;
  if (hasHeaders && records.length > 0) {
    const headerRow = records[0]!;
    headerMap = {};
    for (let i = 0; i < headerRow.length; i++) {
      headerMap[headerRow[i]!] = i;
    }
    dataRows = records.slice(1);
  }

  const articles: FetchedArticle[] = [];
  for (const row of dataRows) {
    if (articles.length >= maxItems) break;

    const valueIdx = resolveColumnIndex(opts.columnMap.value, headerMap);
    const typeIdx = opts.columnMap.type != null
      ? resolveColumnIndex(opts.columnMap.type, headerMap)
      : undefined;

    const iocValue = row[valueIdx];
    if (!iocValue) continue;

    const iocType = typeIdx != null ? row[typeIdx] : undefined;

    articles.push(makeBulkArticle(iocValue, iocType, { columns: row }));
  }

  return articles;
}

/**
 * Parse plaintext IOC list — one IOC per line.
 * Skips lines starting with # and blank lines. Trims whitespace.
 */
export function parsePlaintext(
  content: string,
  opts: PlaintextParseOptions = {},
): FetchedArticle[] {
  if (!content.trim()) return [];

  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const articles: FetchedArticle[] = [];

  for (const rawLine of content.split('\n')) {
    if (articles.length >= maxItems) break;

    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    articles.push(makeBulkArticle(line, undefined, {}));
  }

  return articles;
}

/**
 * Parse JSONL (newline-delimited JSON) into FetchedArticles.
 * Each line must be a valid JSON object. Invalid lines are skipped.
 */
export function parseJSONL(content: string, opts: JSONLParseOptions): FetchedArticle[] {
  if (!content.trim()) return [];

  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const articles: FetchedArticle[] = [];

  for (const rawLine of content.split('\n')) {
    if (articles.length >= maxItems) break;

    const line = rawLine.trim();
    if (!line) continue;

    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // skip invalid JSON lines
    }

    const iocValue = navigateToPath(record, opts.fieldMap.value);
    if (iocValue == null) continue;

    const iocType = opts.fieldMap.type
      ? navigateToPath(record, opts.fieldMap.type)
      : undefined;

    articles.push(makeBulkArticle(
      String(iocValue),
      iocType != null ? String(iocType) : undefined,
      record,
    ));
  }

  return articles;
}

/* ── Connector class ─────────────────────────────────────────────────── */

/** Bulk file connector — downloads CSV, plaintext, or JSONL feeds via HTTP. */
export class BulkFileConnector {
  constructor(private readonly logger: pino.Logger) {}

  /** Download, decompress, and parse a bulk IOC file. */
  async fetch(opts: BulkFileConnectorOptions): Promise<ConnectorResult> {
    if (!opts.url) {
      throw new AppError(400, 'Bulk file connector requires a URL', 'CONNECTOR_INVALID_CONFIG');
    }

    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const start = Date.now();

    // ── HTTP GET ──────────────────────────────────────────────────
    const fetchHeaders: Record<string, string> = {
      'User-Agent': USER_AGENT,
      ...(opts.headers ?? {}),
    };

    let res: Response;
    try {
      res = await fetch(opts.url, {
        method: 'GET',
        headers: fetchHeaders,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ url: opts.url, error: message }, 'Bulk file fetch failed');
      throw new AppError(502, `Bulk file fetch failed: ${message}`, 'CONNECTOR_FETCH_FAILED');
    }

    if (!res.ok) {
      this.logger.warn({ url: opts.url, status: res.status }, 'Bulk file HTTP error');
      throw new AppError(502, `Bulk file HTTP ${res.status}`, 'CONNECTOR_HTTP_ERROR');
    }

    // ── Read body ─────────────────────────────────────────────────
    let bodyBuffer: Buffer;
    try {
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > MAX_RESPONSE_BYTES) {
        throw new AppError(413, 'Bulk file exceeds 100MB limit', 'CONNECTOR_FILE_TOO_LARGE');
      }
      bodyBuffer = Buffer.from(arrayBuf);
    } catch (err) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ url: opts.url, error: message }, 'Failed to read bulk file body');
      throw new AppError(502, `Failed to read bulk file: ${message}`, 'CONNECTOR_READ_FAILED');
    }

    // ── Decompress ────────────────────────────────────────────────
    let content: string;
    if (opts.compression === 'gzip') {
      try {
        content = gunzipSync(bodyBuffer).toString('utf-8');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error({ url: opts.url, error: message }, 'Gzip decompression failed');
        throw new AppError(
          422, `Gzip decompression failed: ${message}`, 'CONNECTOR_DECOMPRESS_FAILED',
        );
      }
    } else {
      content = bodyBuffer.toString('utf-8');
    }

    // ── Parse ─────────────────────────────────────────────────────
    let articles: FetchedArticle[];
    switch (opts.format) {
      case 'csv':
        articles = parseCSV(content, {
          delimiter: opts.delimiter,
          hasHeaders: opts.hasHeaders,
          columnMap: opts.columnMap ?? { value: 0 },
          maxItems: opts.maxItems,
        });
        break;
      case 'plaintext':
        articles = parsePlaintext(content, { maxItems: opts.maxItems });
        break;
      case 'jsonl':
        articles = parseJSONL(content, {
          fieldMap: opts.fieldMap ?? { value: 'value' },
          maxItems: opts.maxItems,
        });
        break;
      default:
        throw new AppError(400, `Unsupported bulk format: ${opts.format}`, 'CONNECTOR_INVALID_FORMAT');
    }

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { url: opts.url, format: opts.format, itemCount: articles.length, fetchDurationMs },
      'Bulk file parsed',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: `Bulk ${opts.format} (${opts.url})`,
      feedDescription: null,
    };
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** Create a FetchedArticle for a bulk-imported IOC. */
function makeBulkArticle(
  iocValue: string,
  iocType: string | undefined,
  extra: Record<string, unknown>,
): FetchedArticle {
  return {
    title: iocValue,
    content: iocValue,
    url: null,
    publishedAt: null,
    author: null,
    rawMeta: {
      bulkImport: true,
      iocValue,
      ...(iocType != null ? { iocType } : {}),
      ...extra,
    },
  };
}

/**
 * Resolve a column reference to an index.
 * If the reference is a number, return it directly.
 * If it's a string and headerMap is available, look up by name.
 */
function resolveColumnIndex(
  ref: string | number,
  headerMap: Record<string, number> | null,
): number {
  if (typeof ref === 'number') return ref;
  if (headerMap && ref in headerMap) return headerMap[ref]!;
  // If headerMap not available but ref is a string, try parsing as number
  const parsed = parseInt(ref, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Navigate a JSON object using dot-notation path.
 * e.g. "data.indicator" on { data: { indicator: "1.2.3.4" } } returns "1.2.3.4"
 */
function navigateToPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
