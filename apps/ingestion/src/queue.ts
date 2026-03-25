import { Queue } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import { getConfig } from './config.js';
import type { QueueName } from '@etip/shared-utils';

/** Per-feed-type queue instances (P3-4) */
const _queues = new Map<string, Queue>();

/** Legacy single queue reference (kept for backward compat) */
let _legacyQueue: Queue | null = null;

function getRedisConnection() {
  const config = getConfig();
  const url = new URL(config.TI_REDIS_URL);
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

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * Map feed type to the appropriate per-type queue name.
 * rss/atom -> RSS, nvd -> NVD, stix/taxii -> STIX, rest_api -> REST, default -> RSS
 */
export function mapFeedTypeToQueue(feedType: string): QueueName {
  switch (feedType) {
    case 'rss':
    case 'atom':
      return QUEUES.FEED_FETCH_RSS;
    case 'nvd':
      return QUEUES.FEED_FETCH_NVD;
    case 'stix':
    case 'taxii':
      return QUEUES.FEED_FETCH_STIX;
    case 'rest_api':
    case 'misp':
      return QUEUES.FEED_FETCH_REST;
    default:
      return QUEUES.FEED_FETCH_RSS;
  }
}

/** All per-type queue names used for feed fetching */
export const FEED_FETCH_QUEUE_NAMES = [
  QUEUES.FEED_FETCH_RSS,
  QUEUES.FEED_FETCH_NVD,
  QUEUES.FEED_FETCH_STIX,
  QUEUES.FEED_FETCH_REST,
] as const;

/**
 * Create all 4 per-feed-type Queue producers.
 * Also creates the legacy FEED_FETCH queue for backward compat (monitoring).
 */
export function createFeedFetchQueues(): Map<string, Queue> {
  const connection = getRedisConnection();

  for (const queueName of FEED_FETCH_QUEUE_NAMES) {
    const queue = new Queue(queueName, {
      connection: { ...connection },
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    _queues.set(queueName, queue);
  }

  _legacyQueue = new Queue(QUEUES.FEED_FETCH, {
    connection: { ...connection },
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
  });

  return _queues;
}

/** Get a specific per-type queue by name */
export function getFeedFetchQueue(queueName?: string): Queue {
  if (!queueName) {
    if (!_legacyQueue) throw new AppError(500, 'Feed fetch queues not initialized', 'QUEUE_NOT_INITIALIZED');
    return _legacyQueue;
  }
  const q = _queues.get(queueName);
  if (!q) throw new AppError(500, `Queue not found: ${queueName}`, 'QUEUE_NOT_INITIALIZED');
  return q;
}

/** Get the queue for a specific feed type */
export function getQueueForFeedType(feedType: string): Queue {
  const queueName = mapFeedTypeToQueue(feedType);
  return getFeedFetchQueue(queueName);
}

/** Close all feed fetch queues */
export async function closeFeedFetchQueues(): Promise<void> {
  for (const [, queue] of _queues) {
    await queue.close();
  }
  _queues.clear();
  if (_legacyQueue) {
    await _legacyQueue.close();
    _legacyQueue = null;
  }
}

// Backward-compatible aliases
export const createFeedFetchQueue = createFeedFetchQueues;
export const closeFeedFetchQueue = closeFeedFetchQueues;
