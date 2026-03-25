import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── STIX/TAXII 2.1 response validation ──────────────────────────────── */

const StixIndicatorSchema = z.object({
  type: z.string(),
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  pattern: z.string().optional(),
  created: z.string().optional(),
  modified: z.string().optional(),
  confidence: z.number().optional(),
  labels: z.array(z.string()).optional(),
  kill_chain_phases: z.array(z.object({
    kill_chain_name: z.string(),
    phase_name: z.string(),
  })).optional(),
  external_references: z.array(z.object({
    source_name: z.string().optional(),
    url: z.string().optional(),
  })).optional(),
}).passthrough();

const TaxiiEnvelopeSchema = z.object({
  objects: z.array(z.record(z.unknown())).optional(),
  more: z.boolean().optional(),
  next: z.string().optional(),
});

const CollectionSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  can_read: z.boolean().optional(),
});

const CollectionsResponseSchema = z.object({
  collections: z.array(CollectionSchema).optional(),
});

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_TIMEOUT_MS = 30_000;
const TAXII_ACCEPT = 'application/taxii+json;version=2.1';
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/* ── Types ────────────────────────────────────────────────────────────── */

export interface TAXIIConnectorOptions {
  /** TAXII 2.1 server base URL (e.g. https://cti-taxii.mitre.org/taxii2) */
  taxiiUrl?: string;
  /** Basic auth username (optional) */
  username?: string;
  /** Basic auth password (optional) */
  password?: string;
  /** Specific collection ID to poll. If not set, uses first readable collection. */
  collectionId?: string;
  /** Only fetch indicators added after this ISO timestamp. */
  addedAfter?: string;
  timeoutMs?: number;
}

/* ── Connector ────────────────────────────────────────────────────────── */

export class TAXIIConnector {
  constructor(private readonly logger: pino.Logger) {}

  /** Fetch STIX indicators from a TAXII 2.1 server. */
  async fetch(opts: TAXIIConnectorOptions): Promise<ConnectorResult> {
    const { taxiiUrl, username, password, timeoutMs } = opts;

    if (!taxiiUrl) {
      this.logger.info('STIX/TAXII not configured — set TI_TAXII_URL');
      return emptyResult();
    }

    const start = Date.now();
    const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const headers = this.buildHeaders(username, password);

    // ── Resolve collection ID ────────────────────────────────────────
    let collectionId = opts.collectionId;
    if (!collectionId) {
      collectionId = await this.discoverFirstCollection(taxiiUrl, headers, timeout);
      if (!collectionId) {
        this.logger.warn({ taxiiUrl }, 'No readable TAXII collections found');
        return emptyResult();
      }
    }

    // ── Fetch indicators from collection ─────────────────────────────
    const objectsUrl = new URL(`${normalizeUrl(taxiiUrl)}/collections/${collectionId}/objects/`);
    objectsUrl.searchParams.set('type', 'indicator');
    if (opts.addedAfter) {
      objectsUrl.searchParams.set('added_after', opts.addedAfter);
    }

    let res: Response;
    try {
      res = await fetch(objectsUrl.toString(), {
        headers: { ...headers, Accept: TAXII_ACCEPT },
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ url: objectsUrl.toString(), error: message }, 'TAXII fetch failed');
      return emptyResult();
    }

    if (res.status === 401 || res.status === 403) {
      this.logger.warn({ status: res.status }, 'TAXII authentication failed');
      return emptyResult();
    }

    if (!res.ok) {
      this.logger.warn({ status: res.status }, 'TAXII API returned non-OK status');
      return emptyResult();
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      this.logger.warn('TAXII response is not valid JSON');
      return emptyResult();
    }

    const parsed = TaxiiEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      this.logger.warn({ errors: parsed.error.issues.slice(0, 3) }, 'TAXII envelope validation failed');
      return emptyResult();
    }

    const rawObjects = parsed.data.objects ?? [];
    const indicators = rawObjects
      .filter((obj) => (obj as Record<string, unknown>).type === 'indicator')
      .map((obj) => StixIndicatorSchema.safeParse(obj))
      .filter((r) => r.success)
      .map((r) => r.data);

    const articles = indicators.map((ind) => this.mapIndicatorToArticle(ind));

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { collectionId, itemCount: articles.length, rawObjectCount: rawObjects.length, fetchDurationMs },
      'TAXII feed fetched',
    );

    return {
      articles,
      fetchDurationMs,
      feedTitle: `TAXII Collection ${collectionId}`,
      feedDescription: null,
    };
  }

  /** Discover the first readable collection from the TAXII server. */
  private async discoverFirstCollection(
    baseUrl: string, headers: Record<string, string>, timeoutMs: number,
  ): Promise<string | null> {
    const url = `${normalizeUrl(baseUrl)}/collections/`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { ...headers, Accept: TAXII_ACCEPT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ url, error: message }, 'TAXII collection discovery failed');
      return null;
    }

    if (!res.ok) {
      this.logger.warn({ status: res.status, url }, 'TAXII collection discovery returned non-OK');
      return null;
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      this.logger.warn('TAXII collection discovery response is not valid JSON');
      return null;
    }

    const parsed = CollectionsResponseSchema.safeParse(body);
    if (!parsed.success) return null;

    const readable = (parsed.data.collections ?? []).find((c) => c.can_read !== false);
    return readable?.id ?? null;
  }

  /** Build common headers including basic auth if credentials are provided. */
  private buildHeaders(username?: string, password?: string): Record<string, string> {
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (username && password) {
      headers['Authorization'] = `Basic ${btoa(`${username}:${password}`)}`;
    }
    return headers;
  }

  /** Map a STIX indicator object to FetchedArticle. */
  private mapIndicatorToArticle(ind: z.infer<typeof StixIndicatorSchema>): FetchedArticle {
    return {
      title: ind.name ?? `STIX Indicator ${ind.id}`,
      content: ind.description ?? ind.pattern ?? '',
      url: ind.external_references?.[0]?.url ?? null,
      publishedAt: parseDate(ind.created),
      author: null,
      rawMeta: {
        sourceId: ind.id,
        stixPattern: ind.pattern ?? null,
        confidence: ind.confidence ?? null,
        labels: ind.labels ?? [],
        killChainPhases: ind.kill_chain_phases ?? [],
      },
    };
  }
}

function emptyResult(): ConnectorResult {
  return { articles: [], fetchDurationMs: 0, feedTitle: null, feedDescription: null };
}

function parseDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** Remove trailing slashes from URL for consistent path joining. */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
