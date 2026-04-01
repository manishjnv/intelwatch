import { AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/* ── Option types ────────────────────────────────────────────────────── */

export interface ThreatFoxConnectorOptions {
  /** API base URL (default: https://threatfox-api.abuse.ch/api/v1/) */
  apiUrl?: string;
  /** Number of days to look back for recent IOCs (default: 1) */
  days?: number;
  /** Max IOCs to return (default: 50000) */
  maxItems?: number;
  /** Request timeout in ms */
  timeoutMs?: number;
}

/* ── ThreatFox API response types ────────────────────────────────────── */

interface ThreatFoxIOC {
  id: string;
  ioc: string;
  ioc_type: string;
  ioc_type_desc?: string;
  threat_type: string;
  threat_type_desc?: string;
  malware: string;
  malware_printable: string;
  malware_alias?: string[];
  malware_malpedia?: string;
  confidence_level: number;
  first_seen: string;
  last_seen: string | null;
  reporter: string;
  reference: string | null;
  tags: string[] | null;
}

interface ThreatFoxAPIResponse {
  query_status: string;
  data?: ThreatFoxIOC[];
}

/* ── Connector ───────────────────────────────────────────────────────── */

const DEFAULT_API_URL = 'https://threatfox-api.abuse.ch/api/v1/';

/** ThreatFox connector — fetches IOCs from abuse.ch ThreatFox API. */
export class ThreatFoxConnector {
  constructor(private readonly logger: pino.Logger) {}

  async fetch(opts: ThreatFoxConnectorOptions = {}): Promise<ConnectorResult> {
    const apiUrl = opts.apiUrl ?? DEFAULT_API_URL;
    const days = opts.days ?? 1;
    const maxItems = opts.maxItems ?? 50_000;
    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const start = Date.now();

    let res: Response;
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({ query: 'get_iocs', days }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ apiUrl, error: message }, 'ThreatFox API request failed');
      throw new AppError(502, `ThreatFox API request failed: ${message}`, 'CONNECTOR_FETCH_FAILED');
    }

    if (!res.ok) {
      this.logger.warn({ apiUrl, status: res.status }, 'ThreatFox API HTTP error');
      throw new AppError(502, `ThreatFox API HTTP ${res.status}`, 'CONNECTOR_HTTP_ERROR');
    }

    let body: ThreatFoxAPIResponse;
    try {
      body = (await res.json()) as ThreatFoxAPIResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `ThreatFox API invalid JSON: ${message}`, 'CONNECTOR_PARSE_FAILED');
    }

    if (body.query_status !== 'ok' && body.query_status !== 'no_result') {
      throw new AppError(502, `ThreatFox API error: ${body.query_status}`, 'CONNECTOR_API_ERROR');
    }

    const rawData = body.data ?? [];
    const articles: FetchedArticle[] = [];

    for (const ioc of rawData) {
      if (articles.length >= maxItems) break;
      articles.push(mapThreatFoxToArticle(ioc));
    }

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { apiUrl, days, itemCount: articles.length, fetchDurationMs },
      'ThreatFox IOCs fetched',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: 'ThreatFox (abuse.ch)',
      feedDescription: `Recent IOCs from ThreatFox — last ${days} day(s)`,
    };
  }
}

/* ── Mapping ─────────────────────────────────────────────────────────── */

/** Map a ThreatFox IOC to a FetchedArticle with rich rawMeta. */
function mapThreatFoxToArticle(ioc: ThreatFoxIOC): FetchedArticle {
  const malwareFamilies = [ioc.malware_printable];
  if (ioc.malware_alias) malwareFamilies.push(...ioc.malware_alias);

  return {
    title: `[ThreatFox] ${ioc.malware_printable} — ${ioc.ioc}`,
    content: ioc.ioc,
    url: ioc.reference,
    publishedAt: parseAbusechDate(ioc.first_seen),
    author: ioc.reporter,
    rawMeta: {
      bulkImport: true,
      iocValue: extractIocValue(ioc.ioc, ioc.ioc_type),
      iocType: mapIocType(ioc.ioc_type),
      source: 'threatfox',
      sourceConfidence: normalizeConfidence(ioc.confidence_level),
      threatfoxId: ioc.id,
      threatType: ioc.threat_type,
      malwareFamily: ioc.malware,
      malwareFamilies,
      malpediaUrl: ioc.malware_malpedia ?? null,
      tags: ioc.tags ?? [],
      firstSeen: ioc.first_seen,
      lastSeen: ioc.last_seen,
    },
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** Extract the raw IOC value (strip port from ip:port format). */
function extractIocValue(raw: string, iocType: string): string {
  if (iocType === 'ip:port') return raw.split(':')[0]!;
  return raw;
}

/** Map ThreatFox ioc_type to ETIP canonical types. */
function mapIocType(tfType: string): string {
  switch (tfType) {
    case 'ip:port': return 'ip';
    case 'domain': return 'domain';
    case 'url': return 'url';
    case 'md5_hash': return 'md5';
    case 'sha256_hash': return 'sha256';
    case 'sha1_hash': return 'sha1';
    default: return tfType;
  }
}

/** Parse abuse.ch date format "2026-03-30 12:00:00 UTC" to Date. */
function parseAbusechDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(' UTC', 'Z').replace(' ', 'T');
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

/** Normalize ThreatFox confidence (0–100) to 0–1 range. */
function normalizeConfidence(level: number): number {
  return Math.max(0, Math.min(1, level / 100));
}
