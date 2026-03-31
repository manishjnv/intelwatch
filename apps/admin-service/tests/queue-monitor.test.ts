import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { RedisQueueClient } from '../src/routes/queue-monitor.js';

const config = loadConfig({
  TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!',
  TI_SERVICE_JWT_SECRET: 'dev-service-secret!!',
});

// ── Mock Redis client (no real connection) ──────────────────────────────────────

function makeMockRedis(overrides?: Partial<RedisQueueClient>): RedisQueueClient {
  return {
    llen:  vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0),
    quit:  vi.fn().mockResolvedValue('OK'),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('Queue Monitor Routes', () => {
  let app: FastifyInstance;
  let mockRedis: RedisQueueClient;

  beforeEach(async () => {
    mockRedis = makeMockRedis();
    app = await buildApp({
      config,
      queueMonitorDeps: { redisUrl: 'redis://localhost:6379', redisClient: mockRedis },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/admin/queues', () => {
    it('returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      expect(res.statusCode).toBe(200);
    });

    it('response body has data.queues array', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      const body = JSON.parse(res.body) as { data: { queues: unknown[] } };
      expect(Array.isArray(body.data.queues)).toBe(true);
    });

    it('returns all 30 canonical queues', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      const body = JSON.parse(res.body) as { data: { queues: unknown[] } };
      expect(body.data.queues.length).toBe(31);
    });

    it('each entry has name, waiting, active, failed, completed', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      const body = JSON.parse(res.body) as {
        data: { queues: { name: string; waiting: number; active: number; failed: number; completed: number }[] }
      };
      for (const q of body.data.queues) {
        expect(typeof q.name).toBe('string');
        expect(q.name.startsWith('etip-')).toBe(true);
        expect(typeof q.waiting).toBe('number');
        expect(typeof q.active).toBe('number');
        expect(typeof q.failed).toBe('number');
        expect(typeof q.completed).toBe('number');
      }
    });

    it('includes updatedAt ISO timestamp', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      const body = JSON.parse(res.body) as { data: { updatedAt: string } };
      expect(typeof body.data.updatedAt).toBe('string');
      expect(() => new Date(body.data.updatedAt)).not.toThrow();
    });

    it('reflects non-zero llen values from Redis', async () => {
      const hotMock = makeMockRedis({ llen: vi.fn().mockResolvedValue(7) });
      const hotApp = await buildApp({
        config,
        queueMonitorDeps: { redisUrl: 'redis://localhost:6379', redisClient: hotMock },
      });
      try {
        const res = await hotApp.inject({ method: 'GET', url: '/api/v1/admin/queues' });
        const body = JSON.parse(res.body) as {
          data: { queues: { waiting: number; active: number }[] }
        };
        // Every waiting and active should be 7 (our mock returns 7 for all llen calls)
        for (const q of body.data.queues) {
          expect(q.waiting).toBe(7);
          expect(q.active).toBe(7);
        }
      } finally {
        await hotApp.close();
      }
    });

    it('reflects non-zero zcard values (failed/completed) from Redis', async () => {
      const failedMock = makeMockRedis({ zcard: vi.fn().mockResolvedValue(3) });
      const failApp = await buildApp({
        config,
        queueMonitorDeps: { redisUrl: 'redis://localhost:6379', redisClient: failedMock },
      });
      try {
        const res = await failApp.inject({ method: 'GET', url: '/api/v1/admin/queues' });
        const body = JSON.parse(res.body) as {
          data: { queues: { failed: number; completed: number }[] }
        };
        for (const q of body.data.queues) {
          expect(q.failed).toBe(3);
          expect(q.completed).toBe(3);
        }
      } finally {
        await failApp.close();
      }
    });

    it('returns zeros and redisUnavailable flag when Redis throws', async () => {
      const brokenMock = makeMockRedis({
        llen:  vi.fn().mockRejectedValue(new Error('Connection refused')),
        zcard: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      const brokenApp = await buildApp({
        config,
        queueMonitorDeps: { redisUrl: 'redis://localhost:6379', redisClient: brokenMock },
      });
      try {
        const res = await brokenApp.inject({ method: 'GET', url: '/api/v1/admin/queues' });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as {
          data: { queues: { waiting: number }[]; redisUnavailable?: boolean }
        };
        expect(body.data.redisUnavailable).toBe(true);
        for (const q of body.data.queues) {
          expect(q.waiting).toBe(0);
        }
      } finally {
        await brokenApp.close();
      }
    });

    it('calls llen for wait and active keys', async () => {
      await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      const calls = (mockRedis.llen as ReturnType<typeof vi.fn>).mock.calls as string[][];
      const keys = calls.map(c => c[0]);
      expect(keys.some(k => k.endsWith(':wait'))).toBe(true);
      expect(keys.some(k => k.endsWith(':active'))).toBe(true);
    });

    it('calls zcard for failed and completed keys', async () => {
      await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      const calls = (mockRedis.zcard as ReturnType<typeof vi.fn>).mock.calls as string[][];
      const keys = calls.map(c => c[0]);
      expect(keys.some(k => k.endsWith(':failed'))).toBe(true);
      expect(keys.some(k => k.endsWith(':completed'))).toBe(true);
    });

    it('uses bull: prefix on all Redis keys', async () => {
      await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      const llenKeys = (mockRedis.llen as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: string[]) => c[0],
      );
      const zcardKeys = (mockRedis.zcard as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: string[]) => c[0],
      );
      for (const key of [...llenKeys, ...zcardKeys]) {
        expect(key.startsWith('bull:')).toBe(true);
      }
    });
  });
});
