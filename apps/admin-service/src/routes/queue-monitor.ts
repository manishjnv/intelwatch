import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { ALL_QUEUE_NAMES } from '@etip/shared-utils';

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
  /**
   * Override Redis client — inject a mock in tests to avoid a real connection.
   * When provided, the route never creates its own Redis instance.
   */
  redisClient?: RedisQueueClient;
}

/** Read wait + active + failed + completed depths for one BullMQ queue. */
async function fetchQueueDepths(
  redis: RedisQueueClient,
  queueName: string,
): Promise<{ name: string; waiting: number; active: number; failed: number; completed: number }> {
  const [waiting, active, failed, completed] = await Promise.all([
    redis.llen(`${BULL_PREFIX}:${queueName}:wait`),
    redis.llen(`${BULL_PREFIX}:${queueName}:active`),
    redis.zcard(`${BULL_PREFIX}:${queueName}:failed`),
    redis.zcard(`${BULL_PREFIX}:${queueName}:completed`),
  ]);
  return { name: queueName, waiting, active, failed, completed };
}

/** Returns zero-filled entry for every queue (used when Redis is unreachable). */
function zeroEntry(name: string) {
  return { name, waiting: 0, active: 0, failed: 0, completed: 0 };
}

/**
 * Queue monitor routes.
 * Registered at prefix `/api/v1/admin`.
 *
 * GET /queues — returns real-time BullMQ queue depths for all 14 canonical queues.
 */
export function queueMonitorRoutes(deps: QueueMonitorDeps) {
  const { redisUrl } = deps;
  let _redis: RedisQueueClient | undefined = deps.redisClient;

  /** Lazy Redis connection — created on first request, reused thereafter. */
  function getRedis(): RedisQueueClient {
    if (!_redis) {
      _redis = new Redis(redisUrl, {
        lazyConnect: false,
        enableReadyCheck: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 5_000,
      });
    }
    return _redis;
  }

  return async function (app: FastifyInstance): Promise<void> {
    /** Close the Redis connection when Fastify shuts down (skip injected mocks). */
    app.addHook('onClose', async () => {
      if (_redis && !deps.redisClient) {
        await (_redis as Redis).quit().catch(() => {/* ignore close errors */});
      }
    });

    /**
     * GET /api/v1/admin/queues
     * Returns live BullMQ queue depths for all canonical ETIP queues.
     * Falls back to zeros if Redis is unreachable — never throws 500.
     */
    app.get('/queues', async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const r = getRedis();
        const queues = await Promise.all(
          ALL_QUEUE_NAMES.map((name) => fetchQueueDepths(r, name)),
        );
        return reply.send({ data: { queues, updatedAt: new Date().toISOString() } });
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
  };
}
