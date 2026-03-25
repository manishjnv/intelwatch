import { z } from 'zod';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── Feed meta validation ─────────────────────────────────────────────── */

const FieldMapSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  publishedAt: z.string().optional(),
  sourceId: z.string().optional(),
});

const RestFeedMetaSchema = z.object({
  url: z.string().min(1),
  method: z.enum(['GET', 'POST']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  responseArrayPath: z.string().default('data'),
  fieldMap: FieldMapSchema.default({}),
});

export type RestFeedMeta = z.infer<typeof RestFeedMetaSchema>;

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/* ── Types ────────────────────────────────────────────────────────────── */

export interface RestAPIConnectorOptions {
  /** Feed metadata from database (feedMeta JSON column) */
  feedMeta: unknown;
  timeoutMs?: number;
}

/* ── Connector ────────────────────────────────────────────────────────── */

export class RestAPIConnector {
  constructor(private readonly logger: pino.Logger) {}

  /** Fetch articles from a generic REST API endpoint. */
  async fetch(opts: RestAPIConnectorOptions): Promise<ConnectorResult> {
    // ── Validate feedMeta with Zod ─────────────────────────────────
    const metaParsed = RestFeedMetaSchema.safeParse(opts.feedMeta);
    if (!metaParsed.success) {
      const issues = metaParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      this.logger.warn({ issues }, 'REST_API feedMeta validation failed');
      return emptyResult();
    }

    const meta = metaParsed.data;
    if (!meta.url) {
      this.logger.info('REST_API feed has no URL configured');
      return emptyResult();
    }

    const start = Date.now();
    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // ── Make HTTP request ──────────────────────────────────────────
    const fetchHeaders: Record<string, string> = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      ...(meta.headers ?? {}),
    };

    let res: Response;
    try {
      res = await fetch(meta.url, {
        method: meta.method,
        headers: fetchHeaders,
        body: meta.method === 'POST' && meta.body ? JSON.stringify(meta.body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ url: meta.url, error: message }, 'REST_API fetch failed');
      return emptyResult();
    }

    if (!res.ok) {
      this.logger.warn({ url: meta.url, status: res.status }, 'REST_API returned non-OK status');
      return emptyResult();
    }

    // ── Check response size ────────────────────────────────────────
    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      this.logger.warn(
        { url: meta.url, contentLength },
        'REST_API response exceeds 10MB limit',
      );
      return emptyResult();
    }

    let bodyText: string;
    try {
      bodyText = await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ url: meta.url, error: message }, 'REST_API failed to read response body');
      return emptyResult();
    }

    if (bodyText.length > MAX_RESPONSE_BYTES) {
      this.logger.warn({ url: meta.url, size: bodyText.length }, 'REST_API response body exceeds 10MB limit');
      return emptyResult();
    }

    let json: unknown;
    try {
      json = JSON.parse(bodyText);
    } catch {
      this.logger.warn({ url: meta.url }, 'REST_API response is not valid JSON');
      return emptyResult();
    }

    // ── Navigate to array path ─────────────────────────────────────
    const items = navigateToPath(json, meta.responseArrayPath);
    if (!Array.isArray(items)) {
      this.logger.warn(
        { url: meta.url, path: meta.responseArrayPath },
        'REST_API responseArrayPath did not resolve to an array',
      );
      return emptyResult();
    }

    // ── Map items to FetchedArticle via fieldMap ───────────────────
    const fieldMap = meta.fieldMap;
    const articles: FetchedArticle[] = items.map((item) => {
      const rec = item as Record<string, unknown>;
      return {
        title: String(getField(rec, fieldMap.title) ?? '(untitled)'),
        content: String(getField(rec, fieldMap.content) ?? ''),
        url: fieldAsStringOrNull(getField(rec, fieldMap.url)),
        publishedAt: parseDate(getField(rec, fieldMap.publishedAt)),
        author: null,
        rawMeta: {
          sourceId: getField(rec, fieldMap.sourceId) ?? null,
          ...rec,
        },
      };
    });

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { url: meta.url, itemCount: articles.length, fetchDurationMs },
      'REST_API feed fetched',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: `REST API (${meta.url})`,
      feedDescription: null,
    };
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function emptyResult(): ConnectorResult {
  return { articles: [], fetchDurationMs: 0, feedTitle: null, feedDescription: null };
}

/**
 * Navigate a JSON object using dot-notation path.
 * e.g. "data.items" on { data: { items: [...] } } returns the array.
 * Empty string returns the root value.
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

/** Get a field from a record using an optional field name. */
function getField(rec: Record<string, unknown>, fieldName?: string): unknown {
  if (!fieldName) return undefined;
  return navigateToPath(rec, fieldName);
}

function fieldAsStringOrNull(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val);
  return s.length > 0 ? s : null;
}

function parseDate(raw: unknown): Date | null {
  if (raw == null) return null;
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}
