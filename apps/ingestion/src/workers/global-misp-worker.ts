/**
 * @module GlobalMISPWorker
 * @description Global MISP feed fetch worker. Thin wrapper around createGlobalFetchWorker.
 * MISP uses REST transport but has its own connector.
 * DECISION-029 Phase B1.
 */
import { QUEUES } from '@etip/shared-utils';
import { createGlobalFetchWorker, type GlobalFetchWorkerDeps, type GlobalFetchWorkerResult } from './global-fetch-base.js';

/** MISP worker uses FEED_FETCH_GLOBAL_REST queue (MISP uses REST transport) */
export function createGlobalMISPWorker(deps: GlobalFetchWorkerDeps): GlobalFetchWorkerResult {
  return createGlobalFetchWorker({
    queueName: QUEUES.FEED_FETCH_GLOBAL_REST,
    connectorType: 'misp',
    concurrency: 2,
    rateLimitSeconds: 600,
  }, deps);
}
