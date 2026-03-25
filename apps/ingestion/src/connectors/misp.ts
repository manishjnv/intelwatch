import { z } from 'zod';
import type pino from 'pino';
import type { FetchedArticle, ConnectorResult } from './rss.js';

/* ── MISP Event/Attribute Zod schemas ────────────────────────────────── */

const MispTagSchema = z.object({
  name: z.string(),
  colour: z.string().optional(),
}).passthrough();

const MispAttributeSchema = z.object({
  id: z.string().or(z.number()).transform(String),
  type: z.string(),
  value: z.string(),
  category: z.string().optional(),
  to_ids: z.boolean().or(z.number().transform(Boolean)).optional(),
  comment: z.string().optional(),
  timestamp: z.string().or(z.number()).optional(),
  first_seen: z.string().optional(),
  last_seen: z.string().optional(),
  Tag: z.array(MispTagSchema).optional(),
  /** P0-3: Warning list matches — array of matched warning list names/IDs */
  warnings: z.array(z.record(z.unknown())).optional(),
}).passthrough();

const MispObjectSchema = z.object({
  id: z.string().or(z.number()).transform(String),
  name: z.string(),
  meta_category: z.string().optional(),
  description: z.string().optional(),
  comment: z.string().optional(),
  Attribute: z.array(MispAttributeSchema).optional(),
}).passthrough();

const MispEventSchema = z.object({
  id: z.string().or(z.number()).transform(String),
  /** P2-14: MISP event UUID — universal cross-platform correlation ID */
  uuid: z.string().optional(),
  info: z.string(),
  date: z.string().optional(),
  timestamp: z.string().or(z.number()).optional(),
  publish_timestamp: z.string().or(z.number()).optional(),
  threat_level_id: z.string().or(z.number()).optional(),
  analysis: z.string().or(z.number()).optional(),
  Attribute: z.array(MispAttributeSchema).optional(),
  Object: z.array(MispObjectSchema).optional(),
  Tag: z.array(MispTagSchema).optional(),
  Orgc: z.object({ name: z.string().optional() }).optional(),
}).passthrough();

const MispRestSearchResponseSchema = z.object({
  response: z.array(z.object({ Event: MispEventSchema })),
});

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGES = 20;
const MAX_RETRIES_PER_PAGE = 3;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;
/** P1-8: Max response size per page (10 MB) — prevents OOM on large MISP instances */
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const USER_AGENT = 'ETIP-IntelWatch/1.0 (+https://intelwatch.in)';

/** Sentinel for IP types — resolved to ipv4/ipv6 at extraction time */
const IP_TYPE_SENTINEL = '__ip__';

/** MISP attribute types we map to ETIP IOC types */
const MISP_TYPE_MAP: Record<string, string> = {
  'ip-dst': IP_TYPE_SENTINEL,
  'ip-src': IP_TYPE_SENTINEL,
  'ip-dst|port': IP_TYPE_SENTINEL,
  'ip-src|port': IP_TYPE_SENTINEL,
  'domain': 'domain',
  'hostname': 'domain',
  'md5': 'md5',
  'sha1': 'sha1',
  'sha256': 'sha256',
  'ssdeep': 'ssdeep',
  'url': 'url',
  'email-src': 'email',
  'email-dst': 'email',
  'filename|md5': 'md5',
  'filename|sha256': 'sha256',
};

/** TLP tag name → canonical TLP level */
const TLP_MAP: Record<string, string> = {
  'tlp:white': 'TLP:WHITE',
  'tlp:clear': 'TLP:CLEAR',
  'tlp:green': 'TLP:GREEN',
  'tlp:amber': 'TLP:AMBER',
  'tlp:amber+strict': 'TLP:AMBER+STRICT',
  'tlp:red': 'TLP:RED',
};

/** Threat level id → human-readable */
const THREAT_LEVEL_MAP: Record<string, string> = {
  '1': 'high',
  '2': 'medium',
  '3': 'low',
  '4': 'undefined',
};

/* ── Types ────────────────────────────────────────────────────────────── */

/** Sighting type constants per MISP spec */
const SIGHTING_TYPE_POSITIVE = 0;
const SIGHTING_TYPE_FALSE_POSITIVE = 1;

const MispSightingSchema = z.object({
  attribute_id: z.string().or(z.number()).transform(String),
  type: z.string().or(z.number()).transform(String),
}).passthrough();

const MispSightingsResponseSchema = z.array(
  z.object({ Sighting: MispSightingSchema }),
);

/** P1-6: Extended connector result with incremental fetch cursor. */
export interface MISPConnectorResult extends ConnectorResult {
  /** Highest publish_timestamp seen across all fetched events (epoch seconds string).
   *  Pass this as `publishedAfter` on the next fetch to avoid re-fetching. */
  latestEventTimestamp: string | null;
}

/* ── MISP Feed (flat file) schemas ───────────────────────────────────── */

/** Manifest entry: { "uuid": { "timestamp": "...", "info": "..." } } */
const MispFeedManifestEntrySchema = z.object({
  timestamp: z.string().or(z.number()).optional(),
  info: z.string().optional(),
}).passthrough();

const MispFeedManifestSchema = z.record(z.string(), MispFeedManifestEntrySchema);

/** A single MISP feed event file wraps an Event object */
const MispFeedEventFileSchema = z.object({
  Event: MispEventSchema,
});

const MAX_FEED_EVENTS = 500; // Safety limit for flat file feeds

export interface MISPFeedOptions {
  /** Base URL of the MISP feed directory (contains manifest.json) */
  feedUrl: string;
  /** Optional auth header value */
  apiKey?: string;
  /** Only fetch events newer than this timestamp (epoch seconds). */
  publishedAfter?: string | number;
  /** P0-5: When true, only include attributes with to_ids=true. Default: false. */
  onlyIdsAttributes?: boolean;
  timeoutMs?: number;
}

export interface MISPConnectorOptions {
  /** MISP instance base URL (e.g. https://misp.example.org) */
  baseUrl: string;
  /** MISP API key for Authorization header */
  apiKey: string;
  /** Fetch events published after this timestamp (epoch seconds or ISO). Defaults to 24h ago. */
  publishedAfter?: string | number;
  /** Filter by tags (e.g. ['tlp:green', 'type:osint']) */
  tags?: string[];
  /** Max events per page (default 50) */
  limit?: number;
  /** Enable sighting-based confidence adjustment (extra API call per event). Default: false. */
  enableSightings?: boolean;
  /** P0-5: When true, only include attributes with to_ids=true (detection-grade IOCs). Default: false. */
  onlyIdsAttributes?: boolean;
  timeoutMs?: number;
}

/* ── Connector ────────────────────────────────────────────────────────── */

export class MISPConnector {
  constructor(private readonly logger: pino.Logger) {}

  /** Fetch events from MISP /events/restSearch with pagination. */
  async fetch(opts: MISPConnectorOptions): Promise<MISPConnectorResult> {
    const start = Date.now();
    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const limit = opts.limit ?? DEFAULT_PAGE_LIMIT;
    const baseUrl = opts.baseUrl.replace(/\/+$/, '');
    const url = `${baseUrl}/events/restSearch`;

    const now = Math.floor(Date.now() / 1000);
    const publishedAfter = opts.publishedAfter ?? String(now - 86_400);

    const allArticles: FetchedArticle[] = [];
    let page = 1;
    let maxTimestamp = 0; // P1-6: Track highest publish_timestamp

    while (page <= MAX_PAGES) {
      const body: Record<string, unknown> = {
        returnFormat: 'json',
        limit,
        page,
        published: true,
        timestamp: String(publishedAfter),
      };
      if (opts.tags && opts.tags.length > 0) {
        body.tags = opts.tags;
      }

      const pageResult = await this.fetchPage(url, opts.apiKey, body, timeout);
      if (!pageResult) break;

      const events = pageResult.response;
      if (events.length === 0) break;

      for (const item of events) {
        // P1-6: Track highest timestamp for incremental cursor
        const eventTs = Number(item.Event.publish_timestamp ?? item.Event.timestamp ?? 0);
        if (eventTs > maxTimestamp) maxTimestamp = eventTs;

        const article = this.mapEventToArticle(item.Event, baseUrl, opts.onlyIdsAttributes ?? false);

        // P0-2: Fetch sightings and adjust IOC confidence
        if (opts.enableSightings) {
          const sightings = await this.fetchSightings(
            baseUrl, opts.apiKey, item.Event.id, timeout,
          );
          if (sightings) {
            applySightingConfidence(
              article.rawMeta.iocs as MispIoc[],
              sightings,
            );
          }
        }

        allArticles.push(article);
      }

      // If we got fewer than limit, no more pages
      if (events.length < limit) break;
      page++;

      // Respect rate limit headers — handled in fetchPage via Retry-After
    }

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { itemCount: allArticles.length, pages: page, fetchDurationMs },
      'MISP feed fetched',
    );

    return {
      articles: allArticles,
      fetchDurationMs,
      feedTitle: `MISP (${baseUrl})`,
      feedDescription: `Events published after ${publishedAfter}`,
      latestEventTimestamp: maxTimestamp > 0 ? String(maxTimestamp) : null,
    };
  }

  /** Fetch a single page from MISP restSearch with retry on 429. Returns null on error. */
  private async fetchPage(
    url: string, apiKey: string, body: Record<string, unknown>, timeoutMs: number,
  ): Promise<z.infer<typeof MispRestSearchResponseSchema> | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES_PER_PAGE; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn({ url, error: message }, 'MISP network request failed');
        return null;
      }

      // P1-7: Rate limit handling with exponential backoff
      if (res.status === 429) {
        if (attempt >= MAX_RETRIES_PER_PAGE) {
          this.logger.warn({ status: 429, attempts: attempt + 1 }, 'MISP rate limited — max retries exhausted');
          return null;
        }
        const delayMs = parseRetryDelay(res.headers, attempt);
        this.logger.info(
          { status: 429, attempt: attempt + 1, delayMs },
          'MISP rate limited — retrying after delay',
        );
        await sleep(delayMs);
        continue;
      }

      if (res.status === 403) {
        this.logger.warn({ status: 403 }, 'MISP auth failed — check API key');
        return null;
      }

      if (!res.ok) {
        this.logger.warn({ status: res.status, url }, 'MISP API returned non-OK status');
        return null;
      }

      // P1-8: Check response size before reading body
      const contentLength = res.headers.get('content-length');
      if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
        this.logger.warn(
          { url, contentLength: Number(contentLength), maxBytes: MAX_RESPONSE_BYTES },
          'MISP response exceeds size limit (content-length)',
        );
        return null;
      }

      let bodyText: string;
      try {
        bodyText = await res.text();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn({ url, error: message }, 'MISP failed to read response body');
        return null;
      }

      if (bodyText.length > MAX_RESPONSE_BYTES) {
        this.logger.warn(
          { url, size: bodyText.length, maxBytes: MAX_RESPONSE_BYTES },
          'MISP response body exceeds size limit',
        );
        return null;
      }

      let json: unknown;
      try {
        json = JSON.parse(bodyText);
      } catch {
        this.logger.warn({ url }, 'MISP response is not valid JSON');
        return null;
      }

      const parsed = MispRestSearchResponseSchema.safeParse(json);
      if (!parsed.success) {
        this.logger.warn(
          { errors: parsed.error.issues.slice(0, 3) },
          'MISP response failed validation',
        );
        return null;
      }

      return parsed.data;
    }

    return null; // Should not reach here, but safety fallback
  }

  /** Map a MISP Event to FetchedArticle with IOC extraction metadata. */
  private mapEventToArticle(
    event: z.infer<typeof MispEventSchema>, baseUrl: string, onlyIds: boolean,
  ): FetchedArticle {
    const attributes = event.Attribute ?? [];
    const objects = event.Object ?? [];
    const tags = event.Tag ?? [];

    // Extract TLP from event-level tags
    const tlp = extractTlp(tags);

    // P0-4: Extract galaxy enrichment (threat actors, MITRE, malware, etc.)
    const galaxies = extractGalaxies(tags);

    // Extract IOCs from flat (event-level) attributes
    const flatIocs = extractIocsFromAttributes(attributes, null, onlyIds);

    // Extract IOCs from MISP Objects (grouped attributes)
    const objectIocs: MispIoc[] = [];
    const objectMeta: Array<{ name: string; category: string | null; comment: string | null; iocCount: number }> = [];
    for (const obj of objects) {
      const objAttrs = obj.Attribute ?? [];
      const objIocsBatch = extractIocsFromAttributes(objAttrs, obj.name, onlyIds);
      objectIocs.push(...objIocsBatch);
      if (objIocsBatch.length > 0) {
        objectMeta.push({
          name: obj.name,
          category: obj.meta_category ?? null,
          comment: obj.comment ?? null,
          iocCount: objIocsBatch.length,
        });
      }
    }

    // P1-9: Deduplicate IOCs by (type, value) — keep first occurrence
    const { unique: iocs, duplicatesRemoved } = deduplicateIocs([...flatIocs, ...objectIocs]);

    const threatLevel = event.threat_level_id
      ? THREAT_LEVEL_MAP[String(event.threat_level_id)] ?? null
      : null;

    const publishedAt = parseTimestamp(event.publish_timestamp ?? event.timestamp);

    // Build content from event info + attribute summary
    const attrSummary = iocs.length > 0
      ? `\n\nIOC Attributes (${iocs.length}): ${iocs.slice(0, 10).map((i) => `${i.type}:${i.value}`).join(', ')}${iocs.length > 10 ? ` (+${iocs.length - 10} more)` : ''}`
      : '';

    return {
      title: `MISP #${event.id} — ${event.info.slice(0, 200)}`,
      content: event.info + attrSummary,
      url: `${baseUrl}/events/view/${event.id}`,
      publishedAt,
      author: event.Orgc?.name ?? null,
      rawMeta: {
        sourceId: `misp-${event.id}`,
        mispEventId: event.id,
        mispEventUuid: event.uuid ?? null,
        threatLevel,
        tlp,
        analysisStatus: event.analysis != null ? String(event.analysis) : null,
        iocCount: iocs.length,
        iocDuplicatesRemoved: duplicatesRemoved > 0 ? duplicatesRemoved : undefined,
        iocs,
        objects: objectMeta.length > 0 ? objectMeta : undefined,
        galaxies: hasGalaxyData(galaxies) ? galaxies : undefined,
        tags: tags.map((t) => t.name),
      },
    };
  }

  /** P0-2: Fetch sightings for an event. Returns parsed array or null on error. */
  private async fetchSightings(
    baseUrl: string, apiKey: string, eventId: string, timeoutMs: number,
  ): Promise<z.infer<typeof MispSightingsResponseSchema> | null> {
    const url = `${baseUrl}/sightings/restSearch/event/${eventId}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ eventId, error: message }, 'MISP sightings fetch failed');
      return null;
    }

    if (!res.ok) {
      this.logger.warn({ eventId, status: res.status }, 'MISP sightings returned non-OK');
      return null;
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return null;
    }

    const parsed = MispSightingsResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  }

  /**
   * P1-10: Fetch events from a MISP flat-file feed (static JSON).
   * Reads manifest.json, then fetches individual {uuid}.json event files.
   */
  async fetchFeed(opts: MISPFeedOptions): Promise<MISPConnectorResult> {
    const start = Date.now();
    const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const feedUrl = opts.feedUrl.replace(/\/+$/, '');
    const onlyIds = opts.onlyIdsAttributes ?? false;

    const publishedAfterTs = opts.publishedAfter ? Number(opts.publishedAfter) : 0;

    // ── Fetch manifest.json ────────────────────────────────────────
    const manifest = await this.fetchFeedFile<z.infer<typeof MispFeedManifestSchema>>(
      `${feedUrl}/manifest.json`, opts.apiKey, timeout, MispFeedManifestSchema,
    );
    if (!manifest) {
      return { articles: [], fetchDurationMs: Date.now() - start, feedTitle: null, feedDescription: null, latestEventTimestamp: null };
    }

    // Filter by timestamp and limit
    const entries = Object.entries(manifest)
      .filter(([, meta]) => {
        if (!publishedAfterTs) return true;
        const ts = Number(meta.timestamp ?? 0);
        return ts > publishedAfterTs;
      })
      .slice(0, MAX_FEED_EVENTS);

    this.logger.info({ feedUrl, totalInManifest: Object.keys(manifest).length, filtered: entries.length }, 'MISP feed manifest loaded');

    // ── Fetch individual event files ───────────────────────────────
    const allArticles: FetchedArticle[] = [];
    let maxTimestamp = 0;

    for (const [uuid] of entries) {
      const eventData = await this.fetchFeedFile(
        `${feedUrl}/${uuid}.json`, opts.apiKey, timeout, MispFeedEventFileSchema as z.ZodType,
      ) as z.infer<typeof MispFeedEventFileSchema> | null;
      if (!eventData) continue;

      const event = eventData.Event;
      const eventTs = Number(event.publish_timestamp ?? event.timestamp ?? 0);
      if (eventTs > maxTimestamp) maxTimestamp = eventTs;

      allArticles.push(this.mapEventToArticle(event, feedUrl, onlyIds));
    }

    const fetchDurationMs = Date.now() - start;
    this.logger.info(
      { feedUrl, itemCount: allArticles.length, fetchDurationMs },
      'MISP flat feed fetched',
    );

    return {
      articles: allArticles,
      fetchDurationMs,
      feedTitle: `MISP Feed (${feedUrl})`,
      feedDescription: `Flat feed — ${entries.length} events`,
      latestEventTimestamp: maxTimestamp > 0 ? String(maxTimestamp) : null,
    };
  }

  /** Fetch and validate a single JSON file from a MISP feed. */
  private async fetchFeedFile<T>(
    url: string, apiKey: string | undefined, timeoutMs: number, schema: z.ZodType<T>,
  ): Promise<T | null> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (apiKey) headers['Authorization'] = apiKey;

    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ url, error: message }, 'MISP feed file fetch failed');
      return null;
    }

    if (!res.ok) {
      this.logger.warn({ url, status: res.status }, 'MISP feed file returned non-OK');
      return null;
    }

    // Size guard
    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      this.logger.warn({ url, contentLength: Number(contentLength) }, 'MISP feed file exceeds size limit');
      return null;
    }

    let bodyText: string;
    try {
      bodyText = await res.text();
    } catch {
      return null;
    }

    if (bodyText.length > MAX_RESPONSE_BYTES) {
      this.logger.warn({ url, size: bodyText.length }, 'MISP feed file body exceeds size limit');
      return null;
    }

    let json: unknown;
    try {
      json = JSON.parse(bodyText);
    } catch {
      this.logger.warn({ url }, 'MISP feed file is not valid JSON');
      return null;
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      this.logger.warn({ url, errors: parsed.error.issues.slice(0, 3) }, 'MISP feed file failed validation');
      return null;
    }

    return parsed.data;
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

interface MispIoc {
  type: string;
  mispType: string;
  value: string;
  toIds: boolean;
  comment: string | null;
  category: string | null;
  attrTlp: string | null;
  objectName: string | null;
  /** MISP attribute ID — used internally for sighting lookups */
  _attrId: string;
  /** P0-2: Confidence score derived from sightings (0-100). Only set when enableSightings=true. */
  sightingConfidence?: number;
  /** P0-3: True if attribute matched a MISP warning list (likely false positive). */
  warningListMatch: boolean;
  /** P0-3: Names of matched warning lists (empty if none). */
  warningLists: string[];
  /** Temporal bounds — when this IOC was first/last observed (ISO string or null). */
  firstSeen: string | null;
  lastSeen: string | null;
  /** Discarded part of composite MISP type (e.g. filename from filename|sha256, port from ip-dst|port). */
  originalContext: string | null;
}

/** Extract IOC-relevant attributes from an attribute array. */
function extractIocsFromAttributes(
  attributes: Array<z.infer<typeof MispAttributeSchema>>,
  objectName: string | null,
  onlyIds: boolean = false,
): MispIoc[] {
  return attributes
    .filter((attr) => attr.type in MISP_TYPE_MAP)
    .filter((attr) => !onlyIds || (attr.to_ids === true))
    .map((attr) => {
      const warningLists = extractWarningListNames(attr.warnings);
      const { value: iocValue, originalContext } = extractIocValue(attr.type, attr.value);
      const mappedType = MISP_TYPE_MAP[attr.type]!;
      const resolvedType = mappedType === IP_TYPE_SENTINEL
        ? (isIpv6(iocValue) ? 'ipv6' : 'ipv4')
        : mappedType;
      return {
        type: resolvedType,
        mispType: attr.type,
        value: iocValue,
        toIds: attr.to_ids ?? false,
        comment: attr.comment ?? null,
        category: attr.category ?? null,
        attrTlp: extractTlp(attr.Tag ?? []),
        objectName,
        _attrId: attr.id,
        warningListMatch: warningLists.length > 0,
        warningLists,
        firstSeen: attr.first_seen ?? null,
        lastSeen: attr.last_seen ?? null,
        originalContext,
      };
    });
}

/**
 * P1-9: Deduplicate IOCs by (type, value). Keeps the first occurrence.
 * Returns the unique list and count of removed duplicates.
 */
export function deduplicateIocs(iocs: MispIoc[]): { unique: MispIoc[]; duplicatesRemoved: number } {
  const seen = new Set<string>();
  const unique: MispIoc[] = [];
  for (const ioc of iocs) {
    const key = `${ioc.type}::${ioc.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(ioc);
    }
  }
  return { unique, duplicatesRemoved: iocs.length - unique.length };
}

/**
 * P0-2: Apply sighting-based confidence to IOCs.
 * Positive sightings (type=0) boost confidence; false-positive sightings (type=1) lower it.
 * Base confidence is 50. Each positive sighting adds 10 (max 100), each FP subtracts 15 (min 0).
 */
export function applySightingConfidence(
  iocs: MispIoc[],
  sightings: Array<{ Sighting: { attribute_id: string; type: string } }>,
): void {
  // Build per-attribute sighting counts
  const positiveMap = new Map<string, number>();
  const fpMap = new Map<string, number>();

  for (const s of sightings) {
    const attrId = s.Sighting.attribute_id;
    const type = s.Sighting.type;
    if (type === String(SIGHTING_TYPE_POSITIVE)) {
      positiveMap.set(attrId, (positiveMap.get(attrId) ?? 0) + 1);
    } else if (type === String(SIGHTING_TYPE_FALSE_POSITIVE)) {
      fpMap.set(attrId, (fpMap.get(attrId) ?? 0) + 1);
    }
  }

  // If no sightings data at all, don't set confidence (leave undefined)
  if (positiveMap.size === 0 && fpMap.size === 0) return;

  for (const ioc of iocs) {
    const base = 50;
    const posCount = positiveMap.get(ioc._attrId) ?? 0;
    const fpCount = fpMap.get(ioc._attrId) ?? 0;
    ioc.sightingConfidence = Math.max(0, Math.min(100, base + posCount * 10 - fpCount * 15));
  }
}

/** Galaxy tag prefix → structured field name mapping */
const GALAXY_PREFIX_MAP: Record<string, string> = {
  'misp-galaxy:threat-actor': 'threatActors',
  'misp-galaxy:mitre-attack-pattern': 'mitreTechniques',
  'misp-galaxy:tool': 'tools',
  'misp-galaxy:mitre-malware': 'malwareFamilies',
  'misp-galaxy:malware': 'malwareFamilies',
  'misp-galaxy:sector': 'sectors',
  'misp-galaxy:country': 'countries',
  'misp-galaxy:mitre-intrusion-set': 'threatActors',
};

export interface GalaxyEnrichment {
  threatActors: string[];
  mitreTechniques: string[];
  malwareFamilies: string[];
  tools: string[];
  sectors: string[];
  countries: string[];
}

/**
 * P0-4: Extract structured galaxy enrichment from MISP tags.
 * Parses tags like `misp-galaxy:threat-actor="APT28"` into categorized arrays.
 */
export function extractGalaxies(tags: Array<{ name: string }>): GalaxyEnrichment {
  const result: GalaxyEnrichment = {
    threatActors: [], mitreTechniques: [], malwareFamilies: [],
    tools: [], sectors: [], countries: [],
  };

  for (const tag of tags) {
    const name = tag.name;
    if (!name.startsWith('misp-galaxy:')) continue;

    // Find matching prefix
    for (const [prefix, field] of Object.entries(GALAXY_PREFIX_MAP)) {
      if (name.startsWith(prefix)) {
        // Extract value: misp-galaxy:threat-actor="APT28" → APT28
        const match = name.match(/="([^"]+)"/);
        const val = match?.[1];
        if (val) {
          const arr = result[field as keyof GalaxyEnrichment];
          if (!arr.includes(val)) {
            arr.push(val);
          }
        }
        break;
      }
    }
  }

  return result;
}

/** Check if galaxy enrichment has any data */
function hasGalaxyData(g: GalaxyEnrichment): boolean {
  return g.threatActors.length > 0 || g.mitreTechniques.length > 0 ||
    g.malwareFamilies.length > 0 || g.tools.length > 0 ||
    g.sectors.length > 0 || g.countries.length > 0;
}

/** Extract TLP level from MISP tag array. Returns first match or null. */
export function extractTlp(tags: Array<{ name: string }>): string | null {
  for (const tag of tags) {
    const lower = tag.name.toLowerCase().trim();
    if (lower in TLP_MAP) return TLP_MAP[lower]!;
  }
  return null;
}

/** Detect whether an IP string is IPv6. Covers full, compressed, and ::ffff:x.x.x.x forms. */
export function isIpv6(value: string): boolean {
  return value.includes(':');
}

interface ExtractedIocValue {
  value: string;
  /** The discarded part of a composite type (e.g. filename, port). Null for simple types. */
  originalContext: string | null;
}

/**
 * Extract the IOC value from MISP composite types.
 * e.g. "ip-dst|port" value "1.2.3.4|443" → value "1.2.3.4", context "443"
 * e.g. "filename|sha256" value "evil.exe|abc123..." → value "abc123...", context "evil.exe"
 */
function extractIocValue(mispType: string, rawValue: string): ExtractedIocValue {
  if (!mispType.includes('|')) return { value: rawValue, originalContext: null };
  const parts = rawValue.split('|');
  // For "filename|hash" types, the hash is the IOC, filename is context
  if (mispType.startsWith('filename|')) {
    return { value: parts[1] ?? rawValue, originalContext: parts[0] ?? null };
  }
  // For "ip|port" types, the IP is the IOC, port is context
  return { value: parts[0] ?? rawValue, originalContext: parts[1] ?? null };
}

/** P0-3: Extract warning list names from MISP attribute warnings array. */
function extractWarningListNames(warnings: Array<Record<string, unknown>> | undefined): string[] {
  if (!warnings || warnings.length === 0) return [];
  const names: string[] = [];
  for (const w of warnings) {
    // MISP warning list entries have varying shapes: { name: "..." } or { warninglist_name: "..." } or numeric-keyed
    const name = (w.name ?? w.warninglist_name ?? w.match) as string | undefined;
    if (name && typeof name === 'string') {
      names.push(name);
    } else {
      // Fallback: use first string value found
      for (const val of Object.values(w)) {
        if (typeof val === 'string' && val.length > 0) {
          names.push(val);
          break;
        }
      }
    }
  }
  return names;
}

/**
 * P1-7: Calculate retry delay from Retry-After header or exponential backoff.
 * Retry-After can be seconds (e.g. "60") or HTTP-date. Falls back to exponential backoff.
 */
export function parseRetryDelay(headers: Headers, attempt: number): number {
  const retryAfter = headers.get('Retry-After') ?? headers.get('X-RateLimit-Reset');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!isNaN(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }
  }
  // Exponential backoff: 5s, 10s, 20s
  return Math.min(DEFAULT_RETRY_DELAY_MS * Math.pow(2, attempt), MAX_RETRY_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTimestamp(raw: string | number | undefined | null): Date | null {
  if (raw == null) return null;
  const num = typeof raw === 'number' ? raw : Number(raw);
  // MISP timestamps are Unix epoch seconds
  if (!isNaN(num) && num > 0) {
    // If value is in seconds range (< 2e10), convert to ms
    const ms = num < 2e10 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  // Try as ISO string
  const d = new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}
