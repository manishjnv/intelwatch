import { Queue } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import { getConfig } from './config.js';

let _queue: Queue | null = null;

export function createFeedFetchQueue(): Queue {
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);

  _queue = new Queue(QUEUES.FEED_FETCH, {
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
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
