import { z } from 'zod';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── NVD 2.0 API response validation ─────────────────────────────────── */

const CvssMetricSchema = z.object({
  cvssData: z.object({
    baseScore: z.number().optional(),
    baseSeverity: z.string().optional(),
  }).optional(),
}).passthrough();

const CveItemSchema = z.object({
  id: z.string(),
  published: z.string(),
  lastModified: z.string(),
  descriptions: z.array(z.object({
    lang: z.string(),
    value: z.string(),
  })),
  metrics: z.object({
    cvssMetricV31: z.array(CvssMetricSchema).optional(),
    cvssMetricV30: z.array(CvssMetricSchema).optional(),
  }).passthrough().optional(),
  weaknesses: z.array(z.object({
    description: z.array(z.object({ lang: z.string(), value: z.string() })),
  })).optional(),
  references: z.array(z.object({
    url: z.string(),
    source: z.string().optional(),
  })).optional(),
}).passthrough();

const NvdResponseSchema = z.object({
  resultsPerPage: z.number(),
  startIndex: z.number(),
  totalResults: z.number(),
  vulnerabilities: z.array(z.object({ cve: CveItemSchema })),
});

/* ── Constants ────────────────────────────────────────────────────────── */

const NVD_BASE_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RESULTS_PER_PAGE = 50;
/** Rate limit delays (ms): unauthenticated 6s, authenticated 0.6s */
const DELAY_NO_KEY_MS = 6_000;
const DELAY_WITH_KEY_MS = 600;
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/* ── Types ────────────────────────────────────────────────────────────── */

export interface NVDConnectorOptions {
  /** NVD API key (optional — higher rate limits when present) */
  apiKey?: string;
  /** Fetch window start (ISO string). Defaults to 24h ago. */
  pubStartDate?: string;
  /** Fetch window end (ISO string). Defaults to now. */
  pubEndDate?: string;
  /** Max results per page (default 50, NVD max 2000) */
  resultsPerPage?: number;
  timeoutMs?: number;
}

/* ── Connector ────────────────────────────────────────────────────────── */

export class NVDConnector {
  constructor(private readonly logger: pino.Logger) {}

  /** Fetch CVEs from NVD 2.0 REST API within the given date window. */
  async fetch(opts: NVDConnectorOptions): Promise<ConnectorResult> {
    const start = Date.now();
    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const perPage = opts.resultsPerPage ?? DEFAULT_RESULTS_PER_PAGE;
    const delay = opts.apiKey ? DELAY_WITH_KEY_MS : DELAY_NO_KEY_MS;

    const now = new Date();
    const pubStart = opts.pubStartDate ?? new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const pubEnd = opts.pubEndDate ?? now.toISOString();

    const allArticles: FetchedArticle[] = [];
    let startIndex = 0;
    let totalResults = Infinity;

    while (startIndex < totalResults) {
      const url = new URL(NVD_BASE_URL);
      url.searchParams.set('pubStartDate', pubStart);
      url.searchParams.set('pubEndDate', pubEnd);
      url.searchParams.set('resultsPerPage', String(perPage));
      url.searchParams.set('startIndex', String(startIndex));
      if (opts.apiKey) {
        url.searchParams.set('apiKey', opts.apiKey);
      }

      const page = await this.fetchPage(url.toString(), timeout);
      if (!page) break; // error already logged — return what we have

      totalResults = page.totalResults;
      const articles = page.vulnerabilities.map((v) => this.mapCveToArticle(v.cve));
      allArticles.push(...articles);
      startIndex += page.resultsPerPage;

      // Respect NVD rate limits between pages
      if (startIndex < totalResults) {
        await sleep(delay);
      }
    }

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { itemCount: allArticles.length, totalResults, fetchDurationMs },
      'NVD feed fetched',
    );

    return {
      articles: allArticles,
      fetchDurationMs,
      feedTitle: 'NVD - National Vulnerability Database',
      feedDescription: `CVEs published ${pubStart} to ${pubEnd}`,
    };
  }

  /** Fetch a single page from NVD API. Returns null on error. */
  private async fetchPage(url: string, timeoutMs: number): Promise<z.infer<typeof NvdResponseSchema> | null> {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ url, error: message }, 'NVD network request failed');
      return null;
    }

    if (res.status === 403) {
      this.logger.warn({ status: 403 }, 'NVD rate limited — stopping pagination');
      return null;
    }

    if (!res.ok) {
      this.logger.warn({ status: res.status, url }, 'NVD API returned non-OK status');
      return null;
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      this.logger.warn({ url }, 'NVD response is not valid JSON');
      return null;
    }

    const parsed = NvdResponseSchema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn({ errors: parsed.error.issues.slice(0, 3) }, 'NVD response failed validation');
      return null;
    }

    return parsed.data;
  }

  /** Map a single CVE item to FetchedArticle. */
  private mapCveToArticle(cve: z.infer<typeof CveItemSchema>): FetchedArticle {
    const enDesc = cve.descriptions.find((d) => d.lang === 'en');
    const descText = enDesc?.value ?? cve.descriptions[0]?.value ?? '';
    const cvssMetrics = cve.metrics?.cvssMetricV31?.[0] ?? cve.metrics?.cvssMetricV30?.[0];
    const cweIds = (cve.weaknesses ?? [])
      .flatMap((w) => w.description)
      .filter((d) => d.lang === 'en')
      .map((d) => d.value);

    return {
      title: `${cve.id} — ${descText.slice(0, 120)}`,
      content: descText,
      url: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
      publishedAt: parseDate(cve.published),
      author: null,
      rawMeta: {
        sourceId: cve.id,
        cvssV3BaseScore: cvssMetrics?.cvssData?.baseScore ?? null,
        severity: cvssMetrics?.cvssData?.baseSeverity ?? null,
        cweIds,
        references: (cve.references ?? []).map((r) => r.url),
      },
    };
  }
}

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
