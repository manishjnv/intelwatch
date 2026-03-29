/**
 * @module geoip
 * @description GeoIP lookup for session enrichment (I-16).
 * Uses MaxMind GeoLite2-City. Gracefully degrades when DB file is missing.
 */
import { isPrivateIP } from '@etip/shared-utils';
import { updateSessionGeo, findLastSessionByUser, createAuditLog } from './repository.js';

// Lazy-loaded MaxMind reader
let readerPromise: Promise<MaxMindReader | null> | null = null;

interface MaxMindReader {
  city(ip: string): GeoResult;
}

interface GeoResult {
  country?: { isoCode?: string };
  city?: { names?: { en?: string } };
  traits?: { isp?: string };
}

export interface GeoData {
  geoCountry: string | null;
  geoCity: string | null;
  geoIsp: string | null;
}

const NULL_GEO: GeoData = { geoCountry: null, geoCity: null, geoIsp: null };

// ── LRU Cache ──────────────────────────────────────────────────────────
const MAX_CACHE = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const geoCache = new Map<string, { data: GeoData; ts: number }>();

function getCached(ip: string): GeoData | null {
  const entry = geoCache.get(ip);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { geoCache.delete(ip); return null; }
  return entry.data;
}

function setCache(ip: string, data: GeoData): void {
  // FIFO eviction
  if (geoCache.size >= MAX_CACHE) {
    const firstKey = geoCache.keys().next().value;
    if (firstKey) geoCache.delete(firstKey);
  }
  geoCache.set(ip, { data, ts: Date.now() });
}

/** Clear cache (for testing) */
export function clearGeoCache(): void { geoCache.clear(); }

// ── GeoIP Reader ───────────────────────────────────────────────────────

/** Initialize MaxMind reader from TI_GEOIP_DB_PATH (lazy, singleton) */
export async function initGeoIP(): Promise<MaxMindReader | null> {
  const dbPath = process.env.TI_GEOIP_DB_PATH;
  if (!dbPath) {
    console.warn('[geoip] TI_GEOIP_DB_PATH not set — geo enrichment disabled');
    return null;
  }
  try {
    const maxmind = await import('maxmind');
    const reader = await maxmind.default.open(dbPath);
    return reader as unknown as MaxMindReader;
  } catch (err) {
    console.warn('[geoip] Failed to load GeoIP database:', err);
    return null;
  }
}

function getReader(): Promise<MaxMindReader | null> {
  if (!readerPromise) readerPromise = initGeoIP();
  return readerPromise;
}

/** Lookup IP address — returns geo data or null fields for private/unknown IPs */
export async function lookupIP(ip: string): Promise<GeoData> {
  if (!ip || isPrivateIP(ip)) return NULL_GEO;

  const cached = getCached(ip);
  if (cached) return cached;

  const reader = await getReader();
  if (!reader) return NULL_GEO;

  try {
    const result = reader.city(ip);
    const data: GeoData = {
      geoCountry: result.country?.isoCode ?? null,
      geoCity: result.city?.names?.en ?? null,
      geoIsp: result.traits?.isp ?? null,
    };
    setCache(ip, data);
    return data;
  } catch {
    return NULL_GEO;
  }
}

/** Enrich a session with GeoIP data and check for suspicious login */
export async function enrichSessionGeo(
  sessionId: string, userId: string, tenantId: string, ipAddress: string | null,
): Promise<void> {
  if (!ipAddress) return;

  const geo = await lookupIP(ipAddress);
  await updateSessionGeo(sessionId, geo);

  // Suspicious login detection: country change from previous session
  if (geo.geoCountry) {
    const previous = await findLastSessionByUser(userId, sessionId);
    if (previous?.geoCountry && previous.geoCountry !== geo.geoCountry) {
      await createAuditLog({
        tenantId, userId, action: 'auth.suspicious_geo_change',
        entityType: 'session', entityId: sessionId,
        changes: {
          previousCountry: previous.geoCountry,
          currentCountry: geo.geoCountry,
          ipAddress,
        },
      });
    }
  }
}
