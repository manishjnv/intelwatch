import { Queue } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';
import { getConfig } from './config.js';

let _enrichQueue: Queue | null = null;

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
  });

  return _enrichQueue;
}

export function getEnrichQueue(): Queue {
  if (!_enrichQueue) throw new Error('Enrich queue not initialized');
  return _enrichQueue;
}

export async function closeEnrichQueue(): Promise<void> {
  if (_enrichQueue) {
    await _enrichQueue.close();
    _enrichQueue = null;
  }
}
