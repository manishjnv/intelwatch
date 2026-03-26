/**
 * @module plugins/error-alerting
 * @description Aggregates 5xx errors in a sliding window. When threshold is
 * exceeded, publishes QUEUE_ALERT event via Redis pub/sub so admin-service
 * picks it up through existing alerting infrastructure.
 */
import type { FastifyInstance } from 'fastify';
import { EVENTS } from '@etip/shared-utils';

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ALERT_THRESHOLD = 5;

interface ErrorEntry {
  timestamp: number;
  method: string;
  url: string;
  statusCode: number;
}

/** In-memory sliding-window error aggregator */
export class ErrorAggregator {
  private errors: ErrorEntry[] = [];
  private lastAlertAt = 0;
  private alertCount = 0;
  private onThreshold?: (stats: ErrorStats) => void;

  constructor(onThreshold?: (stats: ErrorStats) => void) {
    this.onThreshold = onThreshold;
  }

  /** Record a 5xx error and check threshold */
  record(entry: Omit<ErrorEntry, 'timestamp'>): void {
    const now = Date.now();
    this.errors.push({ ...entry, timestamp: now });
    this.prune(now);

    if (this.errors.length > ALERT_THRESHOLD && now - this.lastAlertAt > WINDOW_MS) {
      this.lastAlertAt = now;
      this.alertCount++;
      this.onThreshold?.(this.getStats());
    }
  }

  /** Get current window statistics */
  getStats(): ErrorStats {
    this.prune(Date.now());
    const byStatus: Record<number, number> = {};
    for (const e of this.errors) {
      byStatus[e.statusCode] = (byStatus[e.statusCode] ?? 0) + 1;
    }
    return {
      windowMs: WINDOW_MS,
      errorCount: this.errors.length,
      alertThreshold: ALERT_THRESHOLD,
      alertsFired: this.alertCount,
      lastAlertAt: this.lastAlertAt || null,
      byStatusCode: byStatus,
      recentErrors: this.errors.slice(-10).map((e) => ({
        method: e.method,
        url: e.url,
        statusCode: e.statusCode,
        timestamp: new Date(e.timestamp).toISOString(),
      })),
    };
  }

  /** Remove entries older than the window */
  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    this.errors = this.errors.filter((e) => e.timestamp > cutoff);
  }

  /** Reset for testing */
  reset(): void {
    this.errors = [];
    this.lastAlertAt = 0;
    this.alertCount = 0;
  }
}

export interface ErrorStats {
  windowMs: number;
  errorCount: number;
  alertThreshold: number;
  alertsFired: number;
  lastAlertAt: number | null;
  byStatusCode: Record<number, number>;
  recentErrors: Array<{ method: string; url: string; statusCode: number; timestamp: string }>;
}

let _aggregator: ErrorAggregator | null = null;

/** Get the singleton aggregator (for testing/stats route) */
export function getAggregator(): ErrorAggregator | null {
  return _aggregator;
}

/**
 * Register error alerting on the Fastify instance.
 * Hooks into onResponse to track 5xx errors.
 * Publishes QUEUE_ALERT via Redis when threshold exceeded.
 */
export function registerErrorAlerting(app: FastifyInstance, redisUrl?: string): void {
  let publishAlert: ((stats: ErrorStats) => void) | undefined;

  if (redisUrl) {
    // Lazy-load ioredis to avoid import issues in test
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require('ioredis');
      const pub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      pub.connect().catch(() => {
        app.log.warn('Error alerting: Redis connection failed — alerts will be logged only');
      });

      publishAlert = (stats: ErrorStats) => {
        const payload = JSON.stringify({
          event: EVENTS.QUEUE_ALERT,
          source: 'api-gateway',
          severity: 'high',
          message: `API Gateway: ${stats.errorCount} errors in 5-min window (threshold: ${ALERT_THRESHOLD})`,
          stats,
          timestamp: new Date().toISOString(),
        });
        pub.publish(EVENTS.QUEUE_ALERT, payload).catch(() => {
          app.log.warn('Failed to publish QUEUE_ALERT to Redis');
        });
      };

      // Clean up on close
      app.addHook('onClose', async () => {
        await pub.quit().catch(() => {});
      });
    } catch {
      app.log.warn('ioredis not available — error alerts will be logged only');
    }
  }

  _aggregator = new ErrorAggregator((stats) => {
    app.log.error(
      { event: EVENTS.QUEUE_ALERT, errorCount: stats.errorCount, alertsFired: stats.alertsFired },
      `Error threshold exceeded: ${stats.errorCount} errors in 5-min window`,
    );
    publishAlert?.(stats);
  });

  app.addHook('onResponse', async (req, reply) => {
    if (reply.statusCode >= 500) {
      _aggregator!.record({
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
      });
    }
  });
}

/** Route plugin: GET /error-stats for admin dashboard */
export async function errorAlertingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/error-stats', async (_req, reply) => {
    const aggregator = getAggregator();
    if (!aggregator) {
      return reply.status(503).send({ error: { code: 'NOT_INITIALIZED', message: 'Error alerting not initialized' } });
    }
    return reply.status(200).send({ data: aggregator.getStats() });
  });
}
