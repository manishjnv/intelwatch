/**
 * @module GlobalNVDWorker
 * @description Global NVD feed fetch worker. Thin wrapper around createGlobalFetchWorker.
 * DECISION-029 Phase B1.
 */
import { QUEUES } from '@etip/shared-utils';
import { createGlobalFetchWorker, type GlobalFetchWorkerDeps, type GlobalFetchWorkerResult } from './global-fetch-base.js';

export function createGlobalNVDWorker(deps: GlobalFetchWorkerDeps): GlobalFetchWorkerResult {
  return createGlobalFetchWorker({
    queueName: QUEUES.FEED_FETCH_GLOBAL_NVD,
    connectorType: 'nvd',
    concurrency: 2,
    rateLimitSeconds: 600, // 10 minutes (NVD rate limits)
  }, deps);
}
