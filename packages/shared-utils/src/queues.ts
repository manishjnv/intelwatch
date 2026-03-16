export const QUEUES = {
  FEED_FETCH: 'etip:feed-fetch', FEED_PARSE: 'etip:feed-parse',
  NORMALIZE: 'etip:normalize', DEDUPLICATE: 'etip:deduplicate',
  ENRICH_REALTIME: 'etip:enrich-realtime', ENRICH_BATCH: 'etip:enrich-batch',
  GRAPH_SYNC: 'etip:graph-sync', CORRELATE: 'etip:correlate',
  ALERT_EVALUATE: 'etip:alert-evaluate', INTEGRATION_PUSH: 'etip:integration-push',
  ARCHIVE: 'etip:archive', REPORT_GENERATE: 'etip:report-generate',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QUEUES);
