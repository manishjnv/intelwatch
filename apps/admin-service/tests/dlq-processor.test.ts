import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { DlqRedisClient } from '../src/routes/dlq-processor.js';

const config = loadConfig({
  TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!',
  TI_SERVICE_JWT_SECRET: 'dev-service-secret!!',
});

// ── Mock Redis client ────────────────────────────────────────────────────────

function makeMockDlqRedis(overrides?: Partial<DlqRedisClient>): DlqRedisClient {
  return {
    zcard:  vi.fn().mockResolvedValue(0),
    zrange: vi.fn().mockResolvedValue([]),
    zrem:   vi.fn().mockResolvedValue(0),
    lpush:  vi.fn().mockResolvedValue(1),
    del:    vi.fn().mockResolvedValue(1),
    quit:   vi.fn().mockResolvedValue('OK'),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DLQ Processor Routes', () => {
  let app: FastifyInstance;
  let mockRedis: DlqRedisClient;

  beforeEach(async () => {
    mockRedis = makeMockDlqRedis();
    app = await buildApp({
      config,
      dlqProcessorDeps: { redisUrl: 'redis://localhost:6379', redisClient: mockRedis },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  // ── GET /api/v1/admin/dlq ─────────────────────────────────────────────────

  describe('GET /api/v1/admin/dlq', () => {
    it('returns 200 with data.queues array', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/dlq' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { queues: unknown[] } };
      expect(Array.isArray(body.data.queues)).toBe(true);
    });

    it('returns all 27 canonical queues', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/dlq' });
      const body = JSON.parse(res.body) as { data: { queues: { name: string; failed: number }[] } };
      expect(body.data.queues.length).toBe(29);
      body.data.queues.forEach((q) => {
        expect(q.name.startsWith('etip-')).toBe(true);
        expect(typeof q.failed).toBe('number');
      });
    });

    it('includes totalFailed sum', async () => {
      const redis = makeMockDlqRedis({ zcard: vi.fn().mockResolvedValue(3) });
      const app2 = await buildApp({
        config,
        dlqProcessorDeps: { redisUrl: 'x', redisClient: redis },
      });
      try {
        const res = await app2.inject({ method: 'GET', url: '/api/v1/admin/dlq' });
        const body = JSON.parse(res.body) as { data: { totalFailed: number } };
        expect(body.data.totalFailed).toBe(3 * 29); // 3 per queue × 29 queues
      } finally {
        await app2.close();
      }
    });

    it('includes updatedAt ISO timestamp', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/dlq' });
      const body = JSON.parse(res.body) as { data: { updatedAt: string } };
      expect(typeof body.data.updatedAt).toBe('string');
      expect(() => new Date(body.data.updatedAt)).not.toThrow();
    });

    it('returns zeros and redisUnavailable flag when Redis throws', async () => {
      const broken = makeMockDlqRedis({
        zcard: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });
      const app2 = await buildApp({
        config,
        dlqProcessorDeps: { redisUrl: 'x', redisClient: broken },
      });
      try {
        const res = await app2.inject({ method: 'GET', url: '/api/v1/admin/dlq' });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { data: { redisUnavailable?: boolean; queues: { failed: number }[] } };
        expect(body.data.redisUnavailable).toBe(true);
        body.data.queues.forEach((q) => expect(q.failed).toBe(0));
      } finally {
        await app2.close();
      }
    });
  });

  // ── POST /api/v1/admin/dlq/:queue/retry ──────────────────────────────────

  describe('POST /api/v1/admin/dlq/:queue/retry', () => {
    it('returns 400 for unknown queue name', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/dlq/unknown-queue-xyz/retry' });
      expect(res.statusCode).toBe(400);
    });

    it('returns retried=0 when queue has no failed jobs', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/dlq/etip-normalize/retry' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { retried: number } };
      expect(body.data.retried).toBe(0);
    });

    it('moves failed jobs to waiting and returns retried count', async () => {
      const redis = makeMockDlqRedis({
        zrange: vi.fn().mockResolvedValue(['job-1', 'job-2']),
      });
      const app2 = await buildApp({
        config,
        dlqProcessorDeps: { redisUrl: 'x', redisClient: redis },
      });
      try {
        const res = await app2.inject({ method: 'POST', url: '/api/v1/admin/dlq/etip-feed-fetch/retry' });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { data: { retried: number; queue: string } };
        expect(body.data.retried).toBe(2);
        expect(body.data.queue).toBe('etip-feed-fetch');
        expect(redis.zrem).toHaveBeenCalledTimes(2);
        expect(redis.lpush).toHaveBeenCalledTimes(2);
      } finally {
        await app2.close();
      }
    });

    it('uses correct bull: prefixed Redis keys', async () => {
      const redis = makeMockDlqRedis({ zrange: vi.fn().mockResolvedValue(['job-1']) });
      const app2 = await buildApp({ config, dlqProcessorDeps: { redisUrl: 'x', redisClient: redis } });
      try {
        await app2.inject({ method: 'POST', url: '/api/v1/admin/dlq/etip-normalize/retry' });
        expect(redis.zrange).toHaveBeenCalledWith('bull:etip-normalize:failed', 0, -1);
        const zremArgs = (redis.zrem as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
        expect(zremArgs[0]).toBe('bull:etip-normalize:failed');
        const lpushArgs = (redis.lpush as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
        expect(lpushArgs[0]).toBe('bull:etip-normalize:wait');
      } finally {
        await app2.close();
      }
    });
  });

  // ── POST /api/v1/admin/dlq/:queue/discard ────────────────────────────────

  describe('POST /api/v1/admin/dlq/:queue/discard', () => {
    it('returns 400 for unknown queue name', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/dlq/bad-queue/discard' });
      expect(res.statusCode).toBe(400);
    });

    it('discards all failed jobs and returns count', async () => {
      const redis = makeMockDlqRedis({ zcard: vi.fn().mockResolvedValue(5) });
      const app2 = await buildApp({ config, dlqProcessorDeps: { redisUrl: 'x', redisClient: redis } });
      try {
        const res = await app2.inject({ method: 'POST', url: '/api/v1/admin/dlq/etip-enrich-realtime/discard' });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { data: { discarded: number; queue: string } };
        expect(body.data.discarded).toBe(5);
        expect(body.data.queue).toBe('etip-enrich-realtime');
        expect(redis.del).toHaveBeenCalledWith('bull:etip-enrich-realtime:failed');
      } finally {
        await app2.close();
      }
    });

    it('returns discarded=0 and skips del when queue is already empty', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/dlq/etip-correlate/discard' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { discarded: number } };
      expect(body.data.discarded).toBe(0);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  // ── POST /api/v1/admin/dlq/retry-all ────────────────────────────────────

  describe('POST /api/v1/admin/dlq/retry-all', () => {
    it('returns 200 with results array and totalRetried', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/admin/dlq/retry-all' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { results: unknown[]; totalRetried: number } };
      expect(Array.isArray(body.data.results)).toBe(true);
      expect(body.data.totalRetried).toBe(0); // all zero in default mock
    });

    it('only processes queues that have failed jobs', async () => {
      let callCount = 0;
      const redis = makeMockDlqRedis({
        // Only first queue has failed jobs
        zcard: vi.fn().mockImplementation(() => Promise.resolve(callCount++ === 0 ? 2 : 0)),
        zrange: vi.fn().mockResolvedValue(['job-a', 'job-b']),
      });
      const app2 = await buildApp({ config, dlqProcessorDeps: { redisUrl: 'x', redisClient: redis } });
      try {
        const res = await app2.inject({ method: 'POST', url: '/api/v1/admin/dlq/retry-all' });
        const body = JSON.parse(res.body) as { data: { results: { name: string }[]; totalRetried: number } };
        expect(body.data.results.length).toBe(1);
        expect(body.data.totalRetried).toBe(2);
      } finally {
        await app2.close();
      }
    });
  });
});
