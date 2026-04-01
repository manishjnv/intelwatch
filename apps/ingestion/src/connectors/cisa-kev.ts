import { AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const DEFAULT_TIMEOUT_MS = 60_000;
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/* ── Option types ────────────────────────────────────────────────────── */

export interface CisaKevConnectorOptions {
  /** KEV catalog URL (default: CISA JSON feed) */
  url?: string;
  /** Request timeout in ms (default: 60000) */
  timeoutMs?: number;
  /** Max CVEs to return (default: 50000) */
  maxItems?: number;
  /** ISO date string for delta sync — only process entries with dateAdded > this value */
  lastDateAdded?: string;
}

/* ── CISA KEV response types ─────────────────────────────────────────── */

interface KevVulnerability {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
  notes: string;
}

interface KevCatalog {
  title: string;
  catalogVersion: string;
  dateReleased: string;
  count: number;
  vulnerabilities: KevVulnerability[];
}

/* ── Connector ───────────────────────────────────────────────────────── */

/** CISA KEV connector — fetches Known Exploited Vulnerabilities catalog. */
export class CisaKevConnector {
  constructor(private readonly logger: pino.Logger) {}

  async fetch(opts: CisaKevConnectorOptions = {}): Promise<ConnectorResult> {
    const url = opts.url ?? DEFAULT_URL;
    const maxItems = opts.maxItems ?? 50_000;
    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
      this.logger.error({ url, error: message }, 'CISA KEV request failed');
      throw new AppError(502, `CISA KEV request failed: ${message}`, 'CONNECTOR_FETCH_FAILED');
    }

    if (!res.ok) {
      this.logger.warn({ url, status: res.status }, 'CISA KEV HTTP error');
      throw new AppError(502, `CISA KEV HTTP ${res.status}`, 'CONNECTOR_HTTP_ERROR');
    }

    let catalog: KevCatalog;
    try {
      catalog = (await res.json()) as KevCatalog;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `CISA KEV invalid JSON: ${message}`, 'CONNECTOR_PARSE_FAILED');
    }

    if (!Array.isArray(catalog.vulnerabilities)) {
      throw new AppError(502, 'CISA KEV catalog missing vulnerabilities array', 'CONNECTOR_PARSE_FAILED');
    }

    let vulns = catalog.vulnerabilities;

    // Delta sync: only process entries added after lastDateAdded
    if (opts.lastDateAdded) {
      const cursor = opts.lastDateAdded;
      vulns = vulns.filter((v) => v.dateAdded > cursor);
      this.logger.info(
        { cursor, totalInCatalog: catalog.vulnerabilities.length, afterDelta: vulns.length },
        'CISA KEV delta sync applied',
      );
    }

    const articles: FetchedArticle[] = [];
    for (const vuln of vulns) {
      if (articles.length >= maxItems) break;
      articles.push(mapKevToArticle(vuln));
    }

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { url, totalInCatalog: catalog.count, articlesReturned: articles.length, fetchDurationMs },
      'CISA KEV catalog fetched',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: 'CISA Known Exploited Vulnerabilities',
      feedDescription: `KEV catalog v${catalog.catalogVersion} — ${catalog.count} total CVEs`,
    };
  }
}

/* ── Mapping ─────────────────────────────────────────────────────────── */

/** Map a KEV vulnerability to a FetchedArticle with rich rawMeta. */
function mapKevToArticle(vuln: KevVulnerability): FetchedArticle {
  return {
    title: `[CISA-KEV] ${vuln.cveID} — ${vuln.vulnerabilityName}`,
    content: vuln.shortDescription,
    url: `https://nvd.nist.gov/vuln/detail/${vuln.cveID}`,
    publishedAt: parseDate(vuln.dateAdded),
    author: 'CISA',
    rawMeta: {
      bulkImport: true,
      iocValue: vuln.cveID,
      iocType: 'cve',
      source: 'cisa_kev',
      sourceConfidence: 95,
      isKEV: true,
      vendorProject: vuln.vendorProject,
      product: vuln.product,
      requiredAction: vuln.requiredAction,
      dueDate: vuln.dueDate,
      knownRansomwareCampaignUse: vuln.knownRansomwareCampaignUse,
      dateAdded: vuln.dateAdded,
    },
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** Parse YYYY-MM-DD date string to Date. */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}
