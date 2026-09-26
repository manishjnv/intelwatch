import { Queue } from 'bullmq';
import { QUEUES, IOC_INDEX_JOB_OPTIONS } from '@etip/shared-utils';
import { getConfig } from './config.js';

let _iocIndexQueue: Queue | null = null;

/** Parse Redis connection options from URL (same convention as normalization/ai-enrichment). */
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

/**
 * Lazily creates the IOC search-index producer queue (called at startup).
 * Returns null when TI_IOC_INDEX_ENABLED=false — analyst writes then skip indexing.
 */
export function createIocIndexQueue(): Queue | null {
  const config = getConfig();
  if (!config.TI_IOC_INDEX_ENABLED) {
    _iocIndexQueue = null;
    return null;
  }
  _iocIndexQueue = new Queue(QUEUES.IOC_INDEX, {
    connection: parseRedisUrl(config.TI_REDIS_URL),
    defaultJobOptions: { ...IOC_INDEX_JOB_OPTIONS },
  });
  return _iocIndexQueue;
}

export function getIocIndexQueue(): Queue | null {
  return _iocIndexQueue;
}

export async function closeIocIndexQueue(): Promise<void> {
  if (_iocIndexQueue) {
    await _iocIndexQueue.close();
    _iocIndexQueue = null;
  }
}
