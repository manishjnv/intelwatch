export const EVENTS = {
  FEED_FETCHED: 'feed.fetched', FEED_PARSED: 'feed.parsed', FEED_ERROR: 'feed.error',
  IOC_NORMALIZED: 'ioc.normalized', ENTITY_NORMALIZED: 'entity.normalized',
  IOC_ENRICHED: 'ioc.enriched', ENRICHMENT_FAILED: 'enrichment.failed',
  ENRICHMENT_BUDGET_WARNING: 'enrichment.budget.warning',
  IOC_CREATED: 'ioc.created', IOC_UPDATED: 'ioc.updated', IOC_EXPIRED: 'ioc.expired',
  ACTOR_UPDATED: 'actor.updated', MALWARE_DETECTED: 'malware.detected',
  VULN_PUBLISHED: 'vuln.published', CORRELATION_MATCH: 'correlation.match',
  DRP_ALERT_CREATED: 'drp.alert.created', GRAPH_NODE_CREATED: 'graph.node.created',
  HUNT_COMPLETED: 'hunt.completed',
} as const;
export type EventType = (typeof EVENTS)[keyof typeof EVENTS];
export const ALL_EVENT_TYPES: EventType[] = Object.values(EVENTS);
