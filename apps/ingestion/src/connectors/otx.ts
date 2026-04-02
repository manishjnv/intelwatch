import { AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── Constants ───────────────────────────────���────────────────────────── */

const BASE_URL = 'https://otx.alienvault.com/api/v1';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_PAGES = 20;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2_000;
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';
const SOURCE_CONFIDENCE = 70;

/* ── OTX type → ETIP IOC type mapping ───────────────────────────────��── */

const OTX_TYPE_MAP: Record<string, string> = {
  'FileHash-MD5': 'md5',
  'FileHash-SHA1': 'sha1',
  'FileHash-SHA256': 'sha256',
  'IPv4': 'ip',
  'IPv6': 'ipv6',
  'domain': 'domain',
  'hostname': 'domain',
  'URL': 'url',
  'email': 'email',
  'CVE': 'cve',
};

/* ── Option types ───────────────────────────────────��────────────────── */

export interface OTXConnectorOptions {
  /** OTX API key (required for subscribed Pulses) */
  apiKey?: string;
  /** ISO datetime — only fetch Pulses modified after this timestamp (delta sync) */
  modifiedSince?: string;
  /** Max pages to paginate through (default: 20) */
  maxPages?: number;
  /** Max retries on 429 rate limit (default: 3) */
  maxRetries?: number;
  /** Base delay in ms between retries — doubled each attempt (default: 2000) */
  retryDelayMs?: number;
  /** Request timeout in ms (default: 60000) */
  timeoutMs?: number;
}

/* ── OTX API response types ──────────────────────────────��───────────── */

interface OTXAttackId {
  id: string;
  name: string;
  display_name: string;
}

interface OTXIndicator {
  id: number;
  type: string;
  indicator: string;
  title: string;
  description: string;
  created: string;
  is_active: number;
}

interface OTXPulse {
  id: string;
  name: string;
  description: string;
  author_name: string;
  created: string;
  modified: string;
  tags: string[];
  targeted_countries: string[];
  malware_families: string[];
  attack_ids: OTXAttackId[];
  references: string[];
  indicators: OTXIndicator[];
}

interface OTXPulseResponse {
  results: OTXPulse[];
  count: number;
  next: string | null;
}

/* ── Extended result with cursor ─────────────────────────────────────── */

export interface OTXConnectorResult extends ConnectorResult {
  /** Latest Pulse modified timestamp — use as modifiedSince cursor for next fetch */
  latestModified: string | null;
}

/* ── Connector ───────────────────────────────────────────────────────── */

/** AlienVault OTX DirectConnect connector — fetches subscribed Pulses and extracts IOCs. */
export class OTXConnector {
  constructor(private readonly logger: pino.Logger) {}

  async fetch(opts: OTXConnectorOptions = {}): Promise<OTXConnectorResult> {
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const start = Date.now();

    const articles: FetchedArticle[] = [];
    let latestModified: string | null = null;
    let pulsesProcessed = 0;
    let url = buildSubscribedUrl(opts.modifiedSince);

    for (let page = 0; page < maxPages; page++) {
      const data = await this.fetchPage(url, opts.apiKey, timeout, maxRetries, retryDelayMs);

      for (const pulse of data.results) {
        pulsesProcessed++;
        // Track latest modified for delta cursor
        if (!latestModified || pulse.modified > latestModified) {
          latestModified = pulse.modified;
        }
        const pulseArticles = mapPulseToArticles(pulse, this.logger);
        articles.push(...pulseArticles);
      }

      if (!data.next) break;
      url = data.next;
    }

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { pulsesProcessed, articlesReturned: articles.length, fetchDurationMs },
      'OTX Pulse sync completed',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: 'AlienVault OTX',
      feedDescription: `${pulsesProcessed} Pulses — ${articles.length} indicators`,
      latestModified,
    };
  }

  /** Fetch a single page with retry on 429. */
  private async fetchPage(
    url: string, apiKey: string | undefined, timeout: number,
    maxRetries: number, retryDelayMs: number,
  ): Promise<OTXPulseResponse> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            ...(apiKey ? { 'X-OTX-API-Key': apiKey } : {}),
          },
          signal: AbortSignal.timeout(timeout),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error({ url, error: message }, 'OTX request failed');
        throw new AppError(502, `OTX request failed: ${message}`, 'CONNECTOR_FETCH_FAILED');
      }

      if (res.status === 429) {
        this.logger.warn({ status: 429, attempt, maxRetries }, 'OTX rate limit hit — backing off');
        if (attempt >= maxRetries) {
          throw new AppError(429, `OTX rate limited after ${maxRetries} retries`, 'CONNECTOR_RATE_LIMITED');
        }
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
        continue;
      }

      if (!res.ok) {
        this.logger.warn({ url, status: res.status }, 'OTX HTTP error');
        throw new AppError(502, `OTX HTTP ${res.status}`, 'CONNECTOR_HTTP_ERROR');
      }

      let data: OTXPulseResponse;
      try {
        data = (await res.json()) as OTXPulseResponse;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new AppError(502, `OTX invalid JSON: ${message}`, 'CONNECTOR_PARSE_FAILED');
      }

      if (!Array.isArray(data.results)) {
        throw new AppError(502, 'OTX response missing results array', 'CONNECTOR_PARSE_FAILED');
      }

      return data;
    }

    // Should not reach here, but satisfy TypeScript
    throw new AppError(502, 'OTX fetch exhausted retries', 'CONNECTOR_FETCH_FAILED');
  }
}

/* ── Mapping ────────────────────────────��────────────────────────────── */

/** Map a single OTX Pulse to FetchedArticle[] — one article per supported indicator. */
function mapPulseToArticles(pulse: OTXPulse, logger: pino.Logger): FetchedArticle[] {
  const articles: FetchedArticle[] = [];
  const mitreIds = pulse.attack_ids.map((a) => a.id);

  for (const ind of pulse.indicators) {
    // Skip inactive indicators
    if (!ind.is_active) continue;

    const etipType = OTX_TYPE_MAP[ind.type];
    if (!etipType) {
      logger.warn(
        { type: ind.type, indicator: ind.indicator, pulseId: pulse.id },
        'Unsupported OTX indicator type — skipping',
      );
      continue;
    }

    articles.push({
      title: `[OTX] ${pulse.name} — ${ind.title || ind.indicator}`,
      content: ind.description || pulse.description,
      url: `https://otx.alienvault.com/pulse/${pulse.id}`,
      publishedAt: parseDate(ind.created),
      author: pulse.author_name,
      rawMeta: {
        bulkImport: true,
        iocValue: ind.indicator,
        iocType: etipType,
        source: 'alienvault-otx',
        sourceConfidence: SOURCE_CONFIDENCE,
        pulseId: pulse.id,
        pulseName: pulse.name,
        tags: pulse.tags,
        malwareFamilies: pulse.malware_families,
        mitreAttack: mitreIds,
        targetedCountries: pulse.targeted_countries,
      },
    });
  }

  return articles;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** Build the subscribed Pulses URL with optional modified_since param. */
function buildSubscribedUrl(modifiedSince?: string): string {
  const url = new URL(`${BASE_URL}/pulses/subscribed`);
  url.searchParams.set('limit', '50');
  if (modifiedSince) {
    url.searchParams.set('modified_since', modifiedSince);
  }
  return url.toString();
}

/** Parse ISO datetime string to Date. */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/** Promise-based sleep for backoff. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
