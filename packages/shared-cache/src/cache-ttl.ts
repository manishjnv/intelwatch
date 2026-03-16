export const CACHE_TTL = {
  dashboard: 48 * 3600, iocSearch: 3600,
  enrichment: { ip: 3600, domain: 86400, hash: 604800, cve: 43200 },
  userSession: 900, feedData: 1800,
} as const;
export const CACHE_PREFIX = 'etip' as const;
export const KEY_PATTERNS = {
  dashboard: (tenantId: string, widgetId: string) => `${CACHE_PREFIX}:${tenantId}:dashboard:${widgetId}`,
  iocSearch: (tenantId: string, queryHash: string) => `${CACHE_PREFIX}:${tenantId}:ioc-search:${queryHash}`,
  enrichment: (tenantId: string, iocType: string, value: string) => `${CACHE_PREFIX}:${tenantId}:enrich:${iocType}:${value}`,
  session: (sessionId: string) => `${CACHE_PREFIX}:session:${sessionId}`,
  feed: (tenantId: string, feedId: string) => `${CACHE_PREFIX}:${tenantId}:feed:${feedId}`,
  tenantWildcard: (tenantId: string) => `${CACHE_PREFIX}:${tenantId}:*`,
} as const;
