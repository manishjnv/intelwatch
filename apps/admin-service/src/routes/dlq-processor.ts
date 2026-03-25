/**
 * @module routes/dlq-processor
 * @description Dead-letter queue (DLQ) management routes for BullMQ failed jobs.
 *
 * Endpoints (all under /api/v1/admin prefix):
 *   GET  /dlq                   — Failed job counts per queue
 *   POST /dlq/:queue/retry      — Move failed jobs back to waiting
 *   POST /dlq/:queue/discard    — Delete all failed jobs for a queue
 *   POST /dlq/retry-all         — Retry every queue with >0 failed jobs
 *
 * BullMQ key structure:
 *   bull:{queueName}:failed  → ZSET of failed jobIds (score = timestamp)
 *   bull:{queueName}:wait    → LIST of waiting jobIds (LPUSH to re-enqueue)
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { ALL_QUEUE_NAMES } from '@etip/shared-utils';

const BULL_PREFIX = 'bull';

// ── Redis interface ───────────────────────────────────────────────────────────

/**
 * Minimal Redis interface for DLQ operations.
 * Allows test injection of a mock client without a real connection.
 */
export interface DlqRedisClient {
  zcard(key: string): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrem(key: string, ...members: string[]): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  del(key: string): Promise<number>;
  quit(): Promise<string>;
}

export interface DlqProcessorDeps {
  redisUrl: string;
  /** Override Redis client — inject a mock in tests. */
  redisClient?: DlqRedisClient;
}

// ── Key helpers ───────────────────────────────────────────────────────────────

function failedKey(queueName: string): string {
  return `${BULL_PREFIX}:${queueName}:failed`;
}

function waitKey(queueName: string): string {
  return `${BULL_PREFIX}:${queueName}:wait`;
}

// ── Redis operations ──────────────────────────────────────────────────────────

/** Read failed job count for every canonical queue. */
async function getFailedCounts(
  redis: DlqRedisClient,
): Promise<{ name: string; failed: number }[]> {
  return Promise.all(
    ALL_QUEUE_NAMES.map(async (name) => ({
      name,
      failed: await redis.zcard(failedKey(name)),
    })),
  );
}

/**
 * Move all failed jobs for `queueName` back to the waiting list.
 * Returns the number of jobs retried.
 */
async function retryQueue(redis: DlqRedisClient, queueName: string): Promise<number> {
  const jobIds = await redis.zrange(failedKey(queueName), 0, -1);
  for (const jobId of jobIds) {
    await redis.zrem(failedKey(queueName), jobId);
    await redis.lpush(waitKey(queueName), jobId);
  }
  return jobIds.length;
}

/**
 * Delete the failed ZSET for `queueName`.
 * Returns the count of jobs discarded.
 */
async function discardQueue(redis: DlqRedisClient, queueName: string): Promise<number> {
  const count = await redis.zcard(failedKey(queueName));
  if (count > 0) {
    await redis.del(failedKey(queueName));
  }
  return count;
}

// ── Route factory ─────────────────────────────────────────────────────────────

/** Returns true when `name` is one of the 14 canonical BullMQ queues. */
function isValidQueue(name: string): boolean {
  return (ALL_QUEUE_NAMES as readonly string[]).includes(name);
}

export function dlqProcessorRoutes(deps: DlqProcessorDeps) {
  const { redisUrl } = deps;
  let _redis: DlqRedisClient | undefined = deps.redisClient;

  function getRedis(): DlqRedisClient {
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
    /** Close our Redis connection on Fastify shutdown (skip injected mocks). */
    app.addHook('onClose', async () => {
      if (_redis && !deps.redisClient) {
        await (_redis as Redis).quit().catch(() => { /* ignore */ });
      }
    });

    /**
     * GET /api/v1/admin/dlq
     * Returns failed job counts for all 14 canonical queues.
     * Falls back to zeros if Redis is unreachable — never throws 500.
     */
    app.get('/dlq', async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const r = getRedis();
        const queues = await getFailedCounts(r);
        const totalFailed = queues.reduce((sum, q) => sum + q.failed, 0);
        return reply.send({
          data: { queues, totalFailed, updatedAt: new Date().toISOString() },
        });
      } catch (err) {
        app.log.warn({ err }, 'dlq-processor: Redis unreachable, returning zeros');
        return reply.send({
          data: {
            queues: ALL_QUEUE_NAMES.map((name) => ({ name, failed: 0 })),
            totalFailed: 0,
            updatedAt: new Date().toISOString(),
            redisUnavailable: true,
          },
        });
      }
    });

    /**
     * POST /api/v1/admin/dlq/:queue/retry
     * Moves all failed jobs for :queue back to the waiting list.
     */
    app.post<{ Params: { queue: string } }>(
      '/dlq/:queue/retry',
      async (req: FastifyRequest<{ Params: { queue: string } }>, reply: FastifyReply) => {
        const { queue } = req.params;
        if (!isValidQueue(queue)) {
          return reply.status(400).send({
            error: { code: 'INVALID_QUEUE', message: `Unknown queue: ${queue}` },
          });
        }
        try {
          const r = getRedis();
          const retried = await retryQueue(r, queue);
          return reply.send({
            data: { queue, retried, message: `${retried} job(s) moved back to waiting` },
          });
        } catch (err) {
          app.log.error({ err, queue }, 'dlq-processor: retry failed');
          return reply.status(500).send({
            error: { code: 'REDIS_ERROR', message: 'Failed to retry jobs' },
          });
        }
      },
    );

    /**
     * POST /api/v1/admin/dlq/:queue/discard
     * Deletes all failed jobs for :queue from the dead-letter store.
     */
    app.post<{ Params: { queue: string } }>(
      '/dlq/:queue/discard',
      async (req: FastifyRequest<{ Params: { queue: string } }>, reply: FastifyReply) => {
        const { queue } = req.params;
        if (!isValidQueue(queue)) {
          return reply.status(400).send({
            error: { code: 'INVALID_QUEUE', message: `Unknown queue: ${queue}` },
          });
        }
        try {
          const r = getRedis();
          const discarded = await discardQueue(r, queue);
          return reply.send({
            data: { queue, discarded, message: `${discarded} job(s) discarded` },
          });
        } catch (err) {
          app.log.error({ err, queue }, 'dlq-processor: discard failed');
          return reply.status(500).send({
            error: { code: 'REDIS_ERROR', message: 'Failed to discard jobs' },
          });
        }
      },
    );

    /**
     * POST /api/v1/admin/dlq/retry-all
     * Retries failed jobs across all queues that have >0 failures.
     */
    app.post('/dlq/retry-all', async (_req: FastifyRequest, reply: FastifyReply) => {
      try {
        const r = getRedis();
        const counts = await getFailedCounts(r);
        const results: { name: string; retried: number }[] = [];
        for (const { name, failed } of counts) {
          if (failed > 0) {
            const retried = await retryQueue(r, name);
            results.push({ name, retried });
          }
        }
        const totalRetried = results.reduce((sum, x) => sum + x.retried, 0);
        return reply.send({
          data: {
            results,
            totalRetried,
            message: `${totalRetried} job(s) retried across ${results.length} queue(s)`,
          },
        });
      } catch (err) {
        app.log.error({ err }, 'dlq-processor: retry-all failed');
        return reply.status(500).send({
          error: { code: 'REDIS_ERROR', message: 'Failed to retry all jobs' },
        });
      }
    });
  };
}
