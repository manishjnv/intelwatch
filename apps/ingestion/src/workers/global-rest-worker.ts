/**
 * @module GlobalRESTWorker
 * @description Global REST API feed fetch worker. Thin wrapper around createGlobalFetchWorker.
 * DECISION-029 Phase B1.
 */
import { QUEUES } from '@etip/shared-utils';
import { createGlobalFetchWorker, type GlobalFetchWorkerDeps, type GlobalFetchWorkerResult } from './global-fetch-base.js';

export function createGlobalRESTWorker(deps: GlobalFetchWorkerDeps): GlobalFetchWorkerResult {
  return createGlobalFetchWorker({
    queueName: QUEUES.FEED_FETCH_GLOBAL_REST,
    connectorType: 'rest',
    concurrency: 3,
    rateLimitSeconds: 300,
  }, deps);
}
