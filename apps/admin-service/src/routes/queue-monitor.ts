import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { ALL_QUEUE_NAMES } from '@etip/shared-utils';
import {
  QueueAlertEvaluator,
  type AlertRedisClient,
  type QueueDepthEntry,
} from '../services/queue-alert-evaluator.js';

/** BullMQ default key prefix — all queues use `bull:{queueName}:{list}` keys. */
const BULL_PREFIX = 'bull';

/**
 * Minimal interface for the Redis operations this route needs.
 * Allows test injection of a mock client without the full ioredis class.
 */
export interface RedisQueueClient {
  llen(key: string): Promise<number>;
  zcard(key: string): Promise<number>;
  quit(): Promise<string>;
}

export interface QueueMonitorDeps {
  redisUrl: string;
  redisClient?: RedisQueueClient;
  alertRedisClient?: AlertRedisClient;
  alertEvaluator?: QueueAlertEvaluator;
}

async function fetchQueueDepths(
  redis: RedisQueueClient,
  queueName: string,
): Promise<QueueDepthEntry> {
  const [waiting, active, failed, completed] = await Promise.all([
    redis.llen(`${BULL_PREFIX}:${queueName}:wait`),
    redis.llen(`${BULL_PREFIX}:${queueName}:active`),
    redis.zcard(`${BULL_PREFIX}:${queueName}:failed`),
    redis.zcard(`${BULL_PREFIX}:${queueName}:completed`),
  ]);
  return { name: queueName, waiting, active, failed, completed };
}

function zeroEntry(name: string): QueueDepthEntry {
  return { name, waiting: 0, active: 0, failed: 0, completed: 0 };
}

/**
 * Queue monitor routes — prefix `/api/v1/admin`.
 * GET /queues         — real-time BullMQ queue depths.
 * GET /queues/alerts  — currently-firing queue alerts.
 */
export function queueMonitorRoutes(deps: QueueMonitorDeps) {
  const { redisUrl } = deps;
  let _redis: RedisQueueClient | undefined = deps.redisClient;
  let _alertRedis: AlertRedisClient | undefined = deps.alertRedisClient;
  let _evaluator: QueueAlertEvaluator | undefined = deps.alertEvaluator;

  function getRedis(): RedisQueueClient {
    if (!_redis) {
      _redis = new Redis(redisUrl, {
        lazyConnect: false, enableReadyCheck: false,
        maxRetriesPerRequest: 1, connectTimeout: 5_000,
      });
    }
    return _redis;
  }

  function getAlertRedis(): AlertRedisClient {
    if (!_alertRedis) {
      _alertRedis = new Redis(redisUrl, {
        lazyConnect: false, enableReadyCheck: false,
        maxRetriesPerRequest: 1, connectTimeout: 5_000,
      }) as unknown as AlertRedisClient;
    }
    return _alertRedis;
  }

  function getEvaluator(logger?: FastifyInstance['log']): QueueAlertEvaluator {
    if (!_evaluator) {
      _evaluator = new QueueAlertEvaluator(getAlertRedis(), logger);
    }
    return _evaluator;
  }

  // ── 10s response cache to reduce Redis ops ──────────────────────────
  let cachedResponse: { queues: QueueDepthEntry[]; updatedAt: string } | null = null;
  let cacheTime = 0;
  const CACHE_TTL_MS = 10_000;

  return async function (app: FastifyInstance): Promise<void> {
    app.addHook('onClose', async () => {
      if (_redis && !deps.redisClient) {
        await (_redis as Redis).quit().catch(() => {/* ignore */});
      }
      if (_alertRedis && !deps.alertRedisClient) {
        await (_alertRedis as unknown as Redis).quit().catch(() => {/* ignore */});
      }
    });

    app.get('/queues', async (_req: FastifyRequest, reply: FastifyReply) => {
      // Return cached response if within TTL
      if (cachedResponse && Date.now() - cacheTime < CACHE_TTL_MS) {
        return reply.send({ data: cachedResponse });
      }
      try {
        const r = getRedis();
        const queues = await Promise.all(
          ALL_QUEUE_NAMES.map((name) => fetchQueueDepths(r, name)),
        );
        const evaluator = getEvaluator(app.log);
        evaluator.evaluate(queues).catch((err) => {
          app.log.warn({ err }, 'queue-monitor: alert evaluation failed (best-effort)');
        });
        cachedResponse = { queues, updatedAt: new Date().toISOString() };
        cacheTime = Date.now();
        return reply.send({ data: cachedResponse });
      } catch (err) {
        app.log.warn({ err }, 'queue-monitor: Redis unreachable, returning zeros');
        return reply.send({
          data: {
            queues: ALL_QUEUE_NAMES.map(zeroEntry),
            updatedAt: new Date().toISOString(),
            redisUnavailable: true,
          },
        });
      }
    });

    app.get('/queues/alerts', async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const r = getRedis();
        const queues = await Promise.all(
          ALL_QUEUE_NAMES.map((name) => fetchQueueDepths(r, name)),
        );
        const evaluator = getEvaluator(app.log);
        const alerts = await evaluator.getActiveAlerts(queues);
        return reply.send({ data: { alerts } });
      } catch (err) {
        app.log.warn({ err }, 'queue-monitor: failed to fetch active alerts');
        return reply.send({ data: { alerts: [] } });
      }
    });
  };
}
