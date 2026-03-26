import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { RedisQueueClient } from '../src/routes/queue-monitor.js';

const config = loadConfig({
  TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!',
  TI_SERVICE_JWT_SECRET: 'dev-service-secret!!',
});

function makeMockRedis(overrides?: Partial<RedisQueueClient>): RedisQueueClient {
  return {
    llen: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0),
    quit: vi.fn().mockResolvedValue('OK'),
    ...overrides,
  };
}

describe('Queue Monitor Cache', () => {
  let app: FastifyInstance;
  let mockRedis: RedisQueueClient;

  beforeEach(async () => {
    mockRedis = makeMockRedis({ llen: vi.fn().mockResolvedValue(3) });
    app = await buildApp({
      config,
      queueMonitorDeps: { redisUrl: 'redis://localhost:6379', redisClient: mockRedis },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('queries Redis on first request (fresh cache)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
    expect(res.statusCode).toBe(200);
    expect((mockRedis.llen as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('returns cached response on second request within 10s', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
    const callsAfterFirst = (mockRedis.llen as ReturnType<typeof vi.fn>).mock.calls.length;

    const res2 = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
    expect(res2.statusCode).toBe(200);
    // No additional Redis calls on second request
    expect((mockRedis.llen as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });

  it('cache expires after 10s and queries Redis again', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
    const callsAfterFirst = (mockRedis.llen as ReturnType<typeof vi.fn>).mock.calls.length;

    // Fast-forward time past cache TTL
    const originalNow = Date.now;
    Date.now = () => originalNow() + 11_000;
    try {
      await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      // Should have made new Redis calls
      expect((mockRedis.llen as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterFirst);
    } finally {
      Date.now = originalNow;
    }
  });

  it('sequential requests within TTL return identical updatedAt', async () => {
    const r1 = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
    const r2 = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
    const r3 = await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
    const b1 = JSON.parse(r1.body) as { data: { updatedAt: string } };
    const b2 = JSON.parse(r2.body) as { data: { updatedAt: string } };
    const b3 = JSON.parse(r3.body) as { data: { updatedAt: string } };
    // 2nd and 3rd must return same cached timestamp as 1st
    expect(b2.data.updatedAt).toBe(b1.data.updatedAt);
    expect(b3.data.updatedAt).toBe(b1.data.updatedAt);
  });

  it('returns zeros on Redis error without caching the error', async () => {
    const brokenRedis = makeMockRedis({
      llen: vi.fn().mockRejectedValue(new Error('Connection refused')),
      zcard: vi.fn().mockRejectedValue(new Error('Connection refused')),
    });
    const brokenApp = await buildApp({
      config,
      queueMonitorDeps: { redisUrl: 'redis://localhost:6379', redisClient: brokenRedis },
    });
    try {
      const res = await brokenApp.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      const body = JSON.parse(res.body) as { data: { redisUnavailable?: boolean } };
      expect(body.data.redisUnavailable).toBe(true);

      // Second request should also try Redis (error response is not cached)
      await brokenApp.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      // llen was called again (error responses aren't cached)
      expect((brokenRedis.llen as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1);
    } finally {
      await brokenApp.close();
    }
  });
});
