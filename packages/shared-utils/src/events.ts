/**
 * @module @etip/shared-utils/events
 * @description Canonical cross-module event types. Dot-notation naming.
 * All services MUST import from here — never invent event names.
 *
 * Source: 00-MASTER.md (Strategic Architecture Review v1.0 — Update 2)
 */

/** All cross-module event types */
export const EVENTS = {
  // Ingestion (04)
  FEED_FETCHED:              'feed.fetched',
  FEED_PARSED:               'feed.parsed',
  FEED_ERROR:                'feed.error',
  // Normalization (05)
  IOC_NORMALIZED:            'ioc.normalized',
  ENTITY_NORMALIZED:         'entity.normalized',
  // Enrichment (06)
  IOC_ENRICHED:              'ioc.enriched',
  ENRICHMENT_FAILED:         'enrichment.failed',
  ENRICHMENT_BUDGET_WARNING: 'enrichment.budget.warning',
  // Core Intel (07–10)
  IOC_CREATED:               'ioc.created',
  IOC_UPDATED:               'ioc.updated',
  IOC_EXPIRED:               'ioc.expired',
  ACTOR_UPDATED:             'actor.updated',
  MALWARE_DETECTED:          'malware.detected',
  VULN_PUBLISHED:            'vuln.published',
  // Advanced Intel (11–14)
  CORRELATION_MATCH:         'correlation.match',
  DRP_ALERT_CREATED:         'drp.alert.created',
  GRAPH_NODE_CREATED:        'graph.node.created',
  HUNT_COMPLETED:            'hunt.completed',
  // Admin / Infrastructure (22)
  QUEUE_ALERT:               'queue.alert',
  QUEUE_ALERT_RESOLVED:      'queue.alert.resolved',
} as const;

/** Union type of all event type string literals */
export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

/** Array of all event types (for subscription setup) */
export const ALL_EVENT_TYPES: EventType[] = Object.values(EVENTS);
