import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { RedisQueueClient } from '../src/routes/queue-monitor.js';
import {
  QueueAlertEvaluator,
  type AlertRedisClient,
  type QueueDepthEntry,
} from '../src/services/queue-alert-evaluator.js';

const config = loadConfig({
  TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!',
  TI_SERVICE_JWT_SECRET: 'dev-service-secret!!',
});

// ── Mock factories ────────────────────────────────────────────────────────────

function makeMockRedis(overrides?: Partial<RedisQueueClient>): RedisQueueClient {
  return {
    llen: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0),
    quit: vi.fn().mockResolvedValue('OK'),
    ...overrides,
  };
}

function makeMockAlertRedis(overrides?: Partial<AlertRedisClient>): AlertRedisClient {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    lpush: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    ...overrides,
  };
}

function makeQueue(name: string, overrides?: Partial<QueueDepthEntry>): QueueDepthEntry {
  return { name, waiting: 0, active: 0, failed: 0, completed: 0, ...overrides };
}

const mockLogger = {
  warn: vi.fn(),
  info: vi.fn(),
};

// ── Unit tests: QueueAlertEvaluator ───────────────────────────────────────────

describe('QueueAlertEvaluator', () => {
  let alertRedis: AlertRedisClient;
  let evaluator: QueueAlertEvaluator;

  beforeEach(() => {
    alertRedis = makeMockAlertRedis();
    evaluator = new QueueAlertEvaluator(alertRedis, mockLogger);
    vi.clearAllMocks();
  });

  describe('classify', () => {
    it('returns red when failed > 0', () => {
      expect(QueueAlertEvaluator.classify(makeQueue('q', { failed: 1 }))).toBe('red');
    });

    it('returns red when waiting > 100', () => {
      expect(QueueAlertEvaluator.classify(makeQueue('q', { waiting: 101 }))).toBe('red');
    });

    it('returns yellow when waiting > 0 but < 100 and no failures', () => {
      expect(QueueAlertEvaluator.classify(makeQueue('q', { waiting: 5 }))).toBe('yellow');
    });

    it('returns green when idle', () => {
      expect(QueueAlertEvaluator.classify(makeQueue('q'))).toBe('green');
    });
  });

  describe('evaluate — green→red transition', () => {
    it('fires QUEUE_ALERT event when queue transitions to red', async () => {
      // First poll: queue is green
      await evaluator.evaluate([makeQueue('etip-feed-fetch')]);
      expect(alertRedis.lpush).not.toHaveBeenCalled();

      // Second poll: queue turns red (failed > 0)
      await evaluator.evaluate([makeQueue('etip-feed-fetch', { failed: 3 })]);
      expect(alertRedis.lpush).toHaveBeenCalledTimes(1);
      const jobData = JSON.parse((alertRedis.lpush as ReturnType<typeof vi.fn>).mock.calls[0][1]);
      expect(jobData.eventType).toBe('queue.alert');
      expect(jobData.fieldValue).toBe('etip-feed-fetch');
      expect(jobData.source.severity).toBe('critical');
    });

    it('sets debounce key with EX after firing', async () => {
      await evaluator.evaluate([makeQueue('etip-feed-fetch', { failed: 5 })]);
      expect(alertRedis.set).toHaveBeenCalledWith(
        'queue-alert-fired:etip-feed-fetch',
        expect.any(String),
        'EX',
        600,
      );
    });
  });

  describe('evaluate — debounce prevents duplicate alerts', () => {
    it('does not fire again when debounce key exists', async () => {
      // Simulate debounce key already exists
      (alertRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue('2026-03-25T12:00:00.000Z');

      await evaluator.evaluate([makeQueue('etip-normalize', { failed: 2 })]);
      expect(alertRedis.lpush).not.toHaveBeenCalled();
    });
  });

  describe('evaluate — red→green transition (resolved)', () => {
    it('fires QUEUE_ALERT_RESOLVED and deletes debounce key', async () => {
      // First poll: red
      await evaluator.evaluate([makeQueue('etip-correlate', { failed: 1 })]);
      vi.clearAllMocks();

      // Second poll: green (resolved)
      await evaluator.evaluate([makeQueue('etip-correlate')]);
      expect(alertRedis.lpush).toHaveBeenCalledTimes(1);
      const jobData = JSON.parse((alertRedis.lpush as ReturnType<typeof vi.fn>).mock.calls[0][1]);
      expect(jobData.eventType).toBe('queue.alert.resolved');
      expect(alertRedis.del).toHaveBeenCalledWith('queue-alert-fired:etip-correlate');
    });
  });

  describe('evaluate — stays red, no duplicate (debounce)', () => {
    it('fires once then stops on consecutive red polls', async () => {
      // First poll: queue goes red
      await evaluator.evaluate([makeQueue('etip-feed-parse', { waiting: 200 })]);
      expect(alertRedis.lpush).toHaveBeenCalledTimes(1);

      // Simulate debounce key now exists
      (alertRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue('2026-03-25T12:00:00.000Z');
      vi.clearAllMocks();

      // Second poll: still red — debounce key exists
      await evaluator.evaluate([makeQueue('etip-feed-parse', { waiting: 250 })]);
      expect(alertRedis.lpush).not.toHaveBeenCalled();
    });
  });

  describe('evaluate — resolved then re-red fires immediately', () => {
    it('deletes debounce key on resolved, next red fires again', async () => {
      // First: red (fires)
      await evaluator.evaluate([makeQueue('etip-graph-sync', { failed: 1 })]);
      expect(alertRedis.lpush).toHaveBeenCalledTimes(1);
      vi.clearAllMocks();

      // Second: green (resolves, deletes key)
      await evaluator.evaluate([makeQueue('etip-graph-sync')]);
      expect(alertRedis.del).toHaveBeenCalledWith('queue-alert-fired:etip-graph-sync');
      vi.clearAllMocks();

      // Reset debounce mock to return null (key deleted)
      (alertRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      // Third: red again — should fire immediately
      await evaluator.evaluate([makeQueue('etip-graph-sync', { failed: 2 })]);
      expect(alertRedis.lpush).toHaveBeenCalledTimes(1);
    });
  });

  describe('getActiveAlerts', () => {
    it('returns alerts for red queues with debounce key', async () => {
      (alertRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue('2026-03-25T12:00:00.000Z');
      const alerts = await evaluator.getActiveAlerts([
        makeQueue('etip-feed-fetch', { failed: 3 }),
        makeQueue('etip-normalize'), // green — should not appear
      ]);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].queueName).toBe('etip-feed-fetch');
      expect(alerts[0].severity).toBe('critical');
      expect(alerts[0].firedAt).toBe('2026-03-25T12:00:00.000Z');
    });

    it('returns empty array when all queues healthy', async () => {
      const alerts = await evaluator.getActiveAlerts([
        makeQueue('etip-feed-fetch'),
        makeQueue('etip-normalize'),
      ]);
      expect(alerts).toHaveLength(0);
    });

    it('returns empty for red queue without debounce key', async () => {
      (alertRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const alerts = await evaluator.getActiveAlerts([
        makeQueue('etip-feed-fetch', { failed: 5 }),
      ]);
      expect(alerts).toHaveLength(0);
    });
  });

  describe('best-effort error handling', () => {
    it('logs warning and continues when alerting queue lpush fails', async () => {
      (alertRedis.lpush as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection lost'));
      await evaluator.evaluate([makeQueue('etip-archive', { failed: 1 })]);
      // Should not throw — best effort
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});

// ── Integration tests: GET /queues/alerts endpoint ────────────────────────────

describe('Queue Alert Routes', () => {
  let app: FastifyInstance;
  let mockRedis: RedisQueueClient;
  let mockAlertRedis: AlertRedisClient;

  beforeEach(async () => {
    mockRedis = makeMockRedis();
    mockAlertRedis = makeMockAlertRedis();
    app = await buildApp({
      config,
      queueMonitorDeps: {
        redisUrl: 'redis://localhost:6379',
        redisClient: mockRedis,
        alertRedisClient: mockAlertRedis,
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/admin/queues/alerts', () => {
    it('returns 200 with empty alerts when all queues healthy', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/queues/alerts' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { alerts: unknown[] } };
      expect(body.data.alerts).toHaveLength(0);
    });

    it('returns alerts for red queues with debounce key', async () => {
      // Make one queue red (failed = 5)
      (mockRedis.zcard as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key.includes('etip-feed-fetch:failed')) return 5;
        return 0;
      });
      // Debounce key exists
      (mockAlertRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue('2026-03-25T12:00:00.000Z');

      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/queues/alerts' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { data: { alerts: Array<{ queueName: string; severity: string }> } };
      expect(body.data.alerts.length).toBeGreaterThanOrEqual(1);
      const feedAlert = body.data.alerts.find(a => a.queueName === 'etip-feed-fetch');
      expect(feedAlert).toBeDefined();
      expect(feedAlert!.severity).toBe('critical');
    });

    it('returns empty alerts array when Redis is unreachable', async () => {
      const brokenRedis = makeMockRedis({
        llen: vi.fn().mockRejectedValue(new Error('Connection refused')),
        zcard: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      const brokenApp = await buildApp({
        config,
        queueMonitorDeps: {
          redisUrl: 'redis://localhost:6379',
          redisClient: brokenRedis,
          alertRedisClient: mockAlertRedis,
        },
      });
      try {
        const res = await brokenApp.inject({ method: 'GET', url: '/api/v1/admin/queues/alerts' });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { data: { alerts: unknown[] } };
        expect(body.data.alerts).toHaveLength(0);
      } finally {
        await brokenApp.close();
      }
    });
  });

  describe('GET /api/v1/admin/queues — alert evaluation piggyback', () => {
    it('triggers alert evaluation on each queue health poll', async () => {
      // Make a queue red
      (mockRedis.zcard as ReturnType<typeof vi.fn>).mockImplementation(async (key: string) => {
        if (key.includes('etip-normalize:failed')) return 10;
        return 0;
      });

      await app.inject({ method: 'GET', url: '/api/v1/admin/queues' });
      // Give the async evaluate() a tick to complete
      await new Promise(r => setTimeout(r, 50));

      // Alert should have been fired (lpush called)
      expect(mockAlertRedis.lpush).toHaveBeenCalled();
    });
  });
});
