import { Queue } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';
import { getConfig } from './config.js';

let _enrichQueue: Queue | null = null;
let _graphSyncQueue: Queue | null = null;
let _iocIndexQueue: Queue | null = null;
let _correlateQueue: Queue | null = null;
let _cacheInvalidateQueue: Queue | null = null;

/** Parse Redis connection options from URL. */
function parseRedisUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  const password = decodeURIComponent(url.password || '');
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: password || undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

export function createEnrichQueue(): Queue {
  const config = getConfig();
  const connection = parseRedisUrl(config.TI_REDIS_URL);
  _enrichQueue = new Queue(QUEUES.ENRICH_REALTIME, { connection });
  return _enrichQueue;
}

export function getEnrichQueue(): Queue {
  if (!_enrichQueue) throw new Error('Enrich queue not initialized');
  return _enrichQueue;
}

/** Create downstream producer queues (called at startup). */
export function createDownstreamQueues(): { graphSync: Queue | null; iocIndex: Queue | null; correlate: Queue | null; cacheInvalidate: Queue | null } {
  const config = getConfig();
  const connection = parseRedisUrl(config.TI_REDIS_URL);

  _graphSyncQueue = config.TI_GRAPH_SYNC_ENABLED ? new Queue(QUEUES.GRAPH_SYNC, { connection }) : null;
  _iocIndexQueue = config.TI_IOC_INDEX_ENABLED ? new Queue(QUEUES.IOC_INDEX, { connection }) : null;
  _correlateQueue = config.TI_CORRELATE_ENABLED ? new Queue(QUEUES.CORRELATE, { connection }) : null;
  _cacheInvalidateQueue = new Queue(QUEUES.CACHE_INVALIDATE, { connection });

  return { graphSync: _graphSyncQueue, iocIndex: _iocIndexQueue, correlate: _correlateQueue, cacheInvalidate: _cacheInvalidateQueue };
}

export function getDownstreamQueues() {
  return { graphSync: _graphSyncQueue, iocIndex: _iocIndexQueue, correlate: _correlateQueue, cacheInvalidate: _cacheInvalidateQueue };
}

export async function closeEnrichQueue(): Promise<void> {
  if (_enrichQueue) { await _enrichQueue.close(); _enrichQueue = null; }
}

export async function closeDownstreamQueues(): Promise<void> {
  if (_graphSyncQueue) { await _graphSyncQueue.close(); _graphSyncQueue = null; }
  if (_iocIndexQueue) { await _iocIndexQueue.close(); _iocIndexQueue = null; }
  if (_correlateQueue) { await _correlateQueue.close(); _correlateQueue = null; }
  if (_cacheInvalidateQueue) { await _cacheInvalidateQueue.close(); _cacheInvalidateQueue = null; }
}
