import { Queue } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import { getConfig } from './config.js';

let _queue: Queue | null = null;

export function createFeedFetchQueue(): Queue {
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
  const password = decodeURIComponent(url.password || '');

  // BullMQ v5.71+ forbids ':' in queue names; use dashes instead
  const queueName = QUEUES.FEED_FETCH.replace(/:/g, '-');
  _queue = new Queue(queueName, {
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

export function getFeedFetchQueue(): Queue {
  if (!_queue) throw new AppError(500, 'Feed fetch queue not initialized — call createFeedFetchQueue() first', 'QUEUE_NOT_INITIALIZED');
  return _queue;
}

export async function closeFeedFetchQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
