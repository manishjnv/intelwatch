/**
 * @module GlobalSTIXWorker
 * @description Global STIX/TAXII feed fetch worker. Thin wrapper around createGlobalFetchWorker.
 * DECISION-029 Phase B1.
 */
import { QUEUES } from '@etip/shared-utils';
import { createGlobalFetchWorker, type GlobalFetchWorkerDeps, type GlobalFetchWorkerResult } from './global-fetch-base.js';

export function createGlobalSTIXWorker(deps: GlobalFetchWorkerDeps): GlobalFetchWorkerResult {
  return createGlobalFetchWorker({
    queueName: QUEUES.FEED_FETCH_GLOBAL_STIX,
    connectorType: 'stix',
    concurrency: 2,
    rateLimitSeconds: 600,
  }, deps);
}
