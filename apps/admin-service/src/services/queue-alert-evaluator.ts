/**
 * @module services/queue-alert-evaluator
 * @description Evaluates queue health transitions and fires QUEUE_ALERT /
 * QUEUE_ALERT_RESOLVED events when queues cross the red threshold.
 *
 * State tracking:
 *   - In-memory Map<queueName, previousStatus> for transition detection
 *   - Redis debounce key `queue-alert-fired:{queueName}` with 10-min TTL
 *
 * On admin-service restart the in-memory Map is empty, so all queues start
 * as "unknown". The evaluator only fires QUEUE_ALERT if a queue is currently
 * red AND the debounce key does not exist (covers restart scenario).
 */
import { EVENTS } from '@etip/shared-utils';
import { QUEUES } from '@etip/shared-utils';

// ── Types ──────────────────────────────────────────────────────────────────

export type QueueStatus = 'green' | 'yellow' | 'red';

export interface QueueDepthEntry {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  completed: number;
}

export interface QueueAlertPayload {
  queueName: string;
  severity: 'critical' | 'resolved';
  waitingCount: number;
  failedCount: number;
  threshold: { waitingMax: number; failedMax: number };
  timestamp: string;
  tenantId: 'system';
}

export interface ActiveAlert {
  queueName: string;
  severity: 'critical';
  waitingCount: number;
  failedCount: number;
  firedAt: string;
  threshold: { waitingMax: number; failedMax: number };
}

/**
 * Minimal Redis interface for alert evaluator operations.
 * Allows test injection of a mock client.
 */
export interface AlertRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: string, time: number): Promise<string | null>;
  del(key: string): Promise<number>;
  lpush(key: string, ...values: string[]): Promise<number>;
  quit(): Promise<string>;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEBOUNCE_PREFIX = 'queue-alert-fired';
const DEBOUNCE_TTL_SECONDS = 600; // 10 minutes
const ALERTING_QUEUE_KEY = `bull:${QUEUES.ALERT_EVALUATE}:wait`;

/** Thresholds matching the frontend queueStatus() logic. */
const RED_THRESHOLD = { waitingMax: 100, failedMax: 0 };

// ── Evaluator ──────────────────────────────────────────────────────────────

export class QueueAlertEvaluator {
  /** In-memory state: tracks the last-known status per queue. */
  private previousState = new Map<string, QueueStatus>();

  constructor(
    private redis: AlertRedisClient,
    private logger?: { warn: (obj: unknown, msg: string) => void; info: (obj: unknown, msg: string) => void },
  ) {}

  /** Classify a queue as green/yellow/red (same logic as frontend). */
  static classify(q: QueueDepthEntry): QueueStatus {
    if (q.failed > RED_THRESHOLD.failedMax || q.waiting > RED_THRESHOLD.waitingMax) return 'red';
    if (q.waiting > 0) return 'yellow';
    return 'green';
  }

  /**
   * Evaluate all queues and fire alert/resolved events on transitions.
   * Call this once per poll cycle (piggyback on GET /queues).
   */
  async evaluate(queues: QueueDepthEntry[]): Promise<void> {
    for (const q of queues) {
      const current = QueueAlertEvaluator.classify(q);
      const previous = this.previousState.get(q.name);

      // Always update state tracking
      this.previousState.set(q.name, current);

      try {
        if (current === 'red') {
          await this.handleRedState(q, previous);
        } else if (previous === 'red') {
          await this.handleResolvedState(q);
        }
      } catch (err) {
        // Alert evaluation is best-effort — log and continue
        this.logger?.warn({ err, queue: q.name }, 'queue-alert-evaluator: failed to process transition');
      }
    }
  }

  /** Returns currently-firing alerts (queues that are red AND have a debounce key). */
  async getActiveAlerts(queues: QueueDepthEntry[]): Promise<ActiveAlert[]> {
    const alerts: ActiveAlert[] = [];
    for (const q of queues) {
      if (QueueAlertEvaluator.classify(q) !== 'red') continue;
      const firedAt = await this.redis.get(`${DEBOUNCE_PREFIX}:${q.name}`).catch(() => null);
      if (firedAt) {
        alerts.push({
          queueName: q.name,
          severity: 'critical',
          waitingCount: q.waiting,
          failedCount: q.failed,
          firedAt,
          threshold: RED_THRESHOLD,
        });
      }
    }
    return alerts;
  }

  /** Expose state for testing. */
  getPreviousState(): Map<string, QueueStatus> {
    return this.previousState;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async handleRedState(q: QueueDepthEntry, previous: QueueStatus | undefined): Promise<void> {
    // Check debounce key — only fire if it doesn't exist
    const debounceKey = `${DEBOUNCE_PREFIX}:${q.name}`;
    const existing = await this.redis.get(debounceKey);
    if (existing) return; // Already fired, within debounce window

    // Fire QUEUE_ALERT
    const payload: QueueAlertPayload = {
      queueName: q.name,
      severity: 'critical',
      waitingCount: q.waiting,
      failedCount: q.failed,
      threshold: RED_THRESHOLD,
      timestamp: new Date().toISOString(),
      tenantId: 'system',
    };

    // Enqueue to alerting service (best-effort)
    await this.enqueueToAlerting(payload);

    // Set debounce key with TTL
    await this.redis.set(debounceKey, payload.timestamp, 'EX', DEBOUNCE_TTL_SECONDS);

    this.logger?.info(
      { queue: q.name, waiting: q.waiting, failed: q.failed, previous },
      'queue-alert-evaluator: QUEUE_ALERT fired',
    );
  }

  private async handleResolvedState(q: QueueDepthEntry): Promise<void> {
    const debounceKey = `${DEBOUNCE_PREFIX}:${q.name}`;

    const payload: QueueAlertPayload = {
      queueName: q.name,
      severity: 'resolved',
      waitingCount: q.waiting,
      failedCount: q.failed,
      threshold: RED_THRESHOLD,
      timestamp: new Date().toISOString(),
      tenantId: 'system',
    };

    // Enqueue resolved event to alerting service (best-effort)
    await this.enqueueToAlerting(payload);

    // Delete debounce key so the next red transition fires immediately
    await this.redis.del(debounceKey);

    this.logger?.info(
      { queue: q.name },
      'queue-alert-evaluator: QUEUE_ALERT_RESOLVED fired',
    );
  }

  /**
   * Push alert payload onto the alerting service's BullMQ inbound queue.
   * Best-effort: if the alerting queue is unavailable, log and continue.
   */
  private async enqueueToAlerting(payload: QueueAlertPayload): Promise<void> {
    const eventType = payload.severity === 'critical' ? EVENTS.QUEUE_ALERT : EVENTS.QUEUE_ALERT_RESOLVED;
    const jobData = JSON.stringify({
      tenantId: payload.tenantId,
      eventType,
      metric: 'queue_health',
      value: payload.severity === 'critical' ? payload.failedCount + payload.waitingCount : 0,
      field: 'queueName',
      fieldValue: payload.queueName,
      source: payload,
    });

    try {
      await this.redis.lpush(ALERTING_QUEUE_KEY, jobData);
    } catch (err) {
      this.logger?.warn(
        { err, queue: payload.queueName },
        'queue-alert-evaluator: alerting queue unavailable, skipping delivery',
      );
    }
  }
}
