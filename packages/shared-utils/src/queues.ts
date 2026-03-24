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
  FEED_PARSE:       'etip-feed-parse',
  NORMALIZE:        'etip-normalize',
  DEDUPLICATE:      'etip-deduplicate',
  ENRICH_REALTIME:  'etip-enrich-realtime',
  ENRICH_BATCH:     'etip-enrich-batch',
  GRAPH_SYNC:       'etip-graph-sync',
  CORRELATE:        'etip-correlate',
  ALERT_EVALUATE:   'etip-alert-evaluate',
  INTEGRATION_PUSH: 'etip-integration-push',
  ARCHIVE:          'etip-archive',
  REPORT_GENERATE:  'etip-report-generate',
  IOC_INDEX:        'etip-ioc-indexed',
} as const;

/** Union type of all queue name string literals */
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Array of all queue names (for iteration / setup) */
export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QUEUES);
