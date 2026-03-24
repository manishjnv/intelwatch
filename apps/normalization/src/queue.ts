import { Queue } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import { getConfig } from './config.js';

let _queue: Queue | null = null;
let _enrichQueue: Queue | null = null;

/** Create the normalize queue (producer side — for enqueuing enrichment downstream) */
export function createNormalizeQueue(): Queue {
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  _queue = new Queue(QUEUES.NORMALIZE, {
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  return _queue;
}

export function getNormalizeQueue(): Queue {
  if (!_queue) throw new AppError(500, 'Normalize queue not initialized — call createNormalizeQueue() first', 'QUEUE_NOT_INITIALIZED');
  return _queue;
}

/** Create the enrichment queue (producer — normalization enqueues IOCs for enrichment) */
export function createEnrichQueue(): Queue {
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  _enrichQueue = new Queue(QUEUES.ENRICH_REALTIME, {
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: password || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
  return _enrichQueue;
}

export function getEnrichQueue(): Queue | null {
  return _enrichQueue;
}

export async function closeNormalizeQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  if (_enrichQueue) {
    await _enrichQueue.close();
    _enrichQueue = null;
  }
}
