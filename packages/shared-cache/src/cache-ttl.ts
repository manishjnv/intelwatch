/**
 * @module @etip/shared-cache/cache-ttl
 * @description Cache TTL constants used across all services.
 * Source: 00-CLAUDE-INSTRUCTIONS.md
 *
 * Redis key format: `{tenantId}:{resourceType}:{identifier}`
 */

/** Cache TTL values in seconds */
export const CACHE_TTL = {
  /** Dashboard widget data — 48 hours */
  dashboard: 48 * 3600,
  /** IOC search result pages — 1 hour */
  iocSearch: 3600,
  /** Enrichment results — per IOC type */
  enrichment: {
    /** IP enrichment — 1 hour */
    ip: 3600,
    /** Domain enrichment — 24 hours */
    domain: 86400,
    /** Hash enrichment — 7 days */
    hash: 604800,
    /** CVE enrichment — 12 hours */
    cve: 43200,
  },
  /** User session data — 15 minutes */
  userSession: 900,
  /** Feed metadata — 30 minutes */
  feedData: 1800,
} as const;

/** Key prefix for all ETIP cache entries */
export const CACHE_PREFIX = 'etip' as const;

/** Cache key namespace separators and patterns */
export const KEY_PATTERNS = {
  /** Dashboard: etip:{tenantId}:dashboard:{widgetId} */
  dashboard: (tenantId: string, widgetId: string) =>
    `${CACHE_PREFIX}:${tenantId}:dashboard:${widgetId}`,

  /** IOC search: etip:{tenantId}:ioc-search:{queryHash} */
  iocSearch: (tenantId: string, queryHash: string) =>
    `${CACHE_PREFIX}:${tenantId}:ioc-search:${queryHash}`,

  /** Enrichment: etip:{tenantId}:enrich:{iocType}:{value} */
  enrichment: (tenantId: string, iocType: string, value: string) =>
    `${CACHE_PREFIX}:${tenantId}:enrich:${iocType}:${value}`,

  /** Session: etip:session:{sessionId} */
  session: (sessionId: string) =>
    `${CACHE_PREFIX}:session:${sessionId}`,

  /** Feed: etip:{tenantId}:feed:{feedId} */
  feed: (tenantId: string, feedId: string) =>
    `${CACHE_PREFIX}:${tenantId}:feed:${feedId}`,

  /** Tenant wildcard: etip:{tenantId}:* */
  tenantWildcard: (tenantId: string) =>
    `${CACHE_PREFIX}:${tenantId}:*`,
} as const;
