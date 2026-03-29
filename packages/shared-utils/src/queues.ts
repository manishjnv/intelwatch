/**
 * @module @etip/shared-utils/queues
 * @description Canonical BullMQ queue names. All services MUST import from here.
 * Never hardcode queue name strings — always reference QUEUES.
 *
 * Source: 00-MASTER.md (Strategic Architecture Review v1.0 — Update 2)
 */

/** All BullMQ queues use the `etip-` prefix (RCA #42: BullMQ 5.71+ forbids colons in queue names) */
export const QUEUES = {
  FEED_FETCH:       'etip-feed-fetch',
  /** Per-feed-type queue lanes (P3-4) — isolate slow connectors from fast ones */
  FEED_FETCH_RSS:   'etip-feed-fetch-rss',
  FEED_FETCH_NVD:   'etip-feed-fetch-nvd',
  FEED_FETCH_STIX:  'etip-feed-fetch-stix',
  FEED_FETCH_REST:  'etip-feed-fetch-rest',
  FEED_PARSE:       'etip-feed-parse',
  NORMALIZE:        'etip-normalize',
  DEDUPLICATE:      'etip-deduplicate',
  ENRICH_REALTIME:  'etip-enrich-realtime',
  ENRICH_BATCH:     'etip-enrich-batch',
  GRAPH_SYNC:       'etip-graph-sync',
  CORRELATE:        'etip-correlate',
  ALERT_EVALUATE:   'etip-alert-evaluate',
  INTEGRATION_PUSH: 'etip-integration-push',
  ARCHIVE:            'etip-archive',
  REPORT_GENERATE:    'etip-report-generate',
  IOC_INDEX:          'etip-ioc-indexed',
  CACHE_INVALIDATE:   'etip-cache-invalidate',
  // Global feed processing (DECISION-029)
  FEED_FETCH_GLOBAL_RSS:  'etip-feed-fetch-global-rss',
  FEED_FETCH_GLOBAL_NVD:  'etip-feed-fetch-global-nvd',
  FEED_FETCH_GLOBAL_STIX: 'etip-feed-fetch-global-stix',
  FEED_FETCH_GLOBAL_REST: 'etip-feed-fetch-global-rest',
  NORMALIZE_GLOBAL:       'etip-normalize-global',
  ENRICH_GLOBAL:          'etip-enrich-global',
  // User lifecycle (I-13)
  EMAIL_SEND:             'etip-email-send',
  // Billing (I-14)
  BILLING_PLAN_CHANGED:   'etip-billing-plan-changed',
  // Audit replication (I-15)
  AUDIT_REPLICATION:      'etip-audit-replication',
} as const;

/** Union type of all queue name string literals */
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Array of all queue names (for iteration / setup) */
export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QUEUES);
