import { Worker, Queue, type Job } from 'bullmq';
import { QUEUES } from '@etip/shared-utils';
import type { RuleStore } from '../services/rule-store.js';
import type { AlertStore, CreateAlertInput } from '../services/alert-store.js';
import type { ChannelStore } from '../services/channel-store.js';
import type { RuleEngine, EvaluationEvent } from '../services/rule-engine.js';
import type { Notifier } from '../services/notifier.js';
import type { DedupStore } from '../services/dedup-store.js';
import type { AlertHistory } from '../services/alert-history.js';
import type { EscalationDispatcher } from '../services/escalation-dispatcher.js';
import { getLogger } from '../logger.js';

export interface AlertWorkerDeps {
  ruleStore: RuleStore;
  alertStore: AlertStore;
  channelStore: ChannelStore;
  ruleEngine: RuleEngine;
  notifier: Notifier;
  dedupStore: DedupStore;
  alertHistory: AlertHistory;
  escalationDispatcher: EscalationDispatcher;
  redisUrl: string;
}

interface AlertEvaluatePayload {
  tenantId: string;
  eventType: string;
  metric?: string;
  value?: number;
  field?: string;
  fieldValue?: string;
  source?: Record<string, unknown>;
}

/**
 * BullMQ worker that processes alert evaluation jobs.
 * Listens on QUEUES.ALERT_EVALUATE, pushes events into the rule engine,
 * evaluates all enabled rules, and creates alerts + notifications for triggered rules.
 */
export class AlertWorker {
  private worker: Worker | null = null;
  private queue: Queue;
  private readonly deps: AlertWorkerDeps;

  constructor(deps: AlertWorkerDeps) {
    this.deps = deps;
    const redisOpts = this.parseRedisUrl(deps.redisUrl);
    this.queue = new Queue(QUEUES.ALERT_EVALUATE, {
      connection: redisOpts,
      prefix: 'etip',
    });
  }

  /** Start the BullMQ worker. */
  start(): void {
    const logger = getLogger();
    const redisOpts = this.parseRedisUrl(this.deps.redisUrl);

    this.worker = new Worker(
      QUEUES.ALERT_EVALUATE,
      async (job: Job<AlertEvaluatePayload>) => {
        await this.processJob(job);
      },
      {
        connection: redisOpts,
        prefix: 'etip',
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      logger.debug({ jobId: job.id }, 'Alert evaluation job completed');
    });

    this.worker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err }, 'Alert evaluation job failed');
    });

    logger.info({ queue: QUEUES.ALERT_EVALUATE }, 'Alert worker started');
  }

  /** Enqueue an event for alert evaluation. */
  async enqueue(payload: AlertEvaluatePayload): Promise<string> {
    const job = await this.queue.add('evaluate', payload, {
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    return job.id ?? '';
  }

  /** Process a single evaluation job. */
  private async processJob(job: Job<AlertEvaluatePayload>): Promise<void> {
    const logger = getLogger();
    const payload = job.data;

    // 1. Push event into rule engine buffer
    const event: EvaluationEvent = {
      tenantId: payload.tenantId,
      eventType: payload.eventType,
      metric: payload.metric,
      value: payload.value,
      field: payload.field,
      fieldValue: payload.fieldValue,
      timestamp: new Date().toISOString(),
      source: payload.source,
    };
    this.deps.ruleEngine.pushEvent(event);

    // 2. Get all enabled rules for this tenant
    const rules = this.deps.ruleStore.getEnabledRules(payload.tenantId);

    // 3. Evaluate each rule
    for (const rule of rules) {
      if (this.deps.ruleStore.isInCooldown(rule.id)) continue;

      const result = this.deps.ruleEngine.evaluate(rule);
      if (!result.triggered) continue;

      // 4. Dedup check — skip if duplicate within window
      const fingerprint = this.deps.dedupStore.fingerprint(rule.id, rule.severity, payload.source);
      const dedupResult = this.deps.dedupStore.check(fingerprint);
      if (dedupResult) {
        // Duplicate — increment count but don't create new alert
        this.deps.dedupStore.record(fingerprint, dedupResult.alertId, rule.id);
        logger.debug({ ruleId: rule.id, fingerprint, count: dedupResult.count + 1 }, 'Alert deduplicated');
        continue;
      }

      // 5. Create alert
      const alertInput: CreateAlertInput = {
        ruleId: rule.id,
        ruleName: rule.name,
        tenantId: rule.tenantId,
        severity: rule.severity,
        title: `[${rule.severity.toUpperCase()}] ${rule.name}`,
        description: result.reason,
        source: payload.source,
      };

      try {
        const alert = this.deps.alertStore.create(alertInput);
        this.deps.ruleStore.markTriggered(rule.id);
        this.deps.dedupStore.record(fingerprint, alert.id, rule.id);

        // Record creation in history
        this.deps.alertHistory.record({
          alertId: alert.id,
          action: 'created',
          fromStatus: null,
          toStatus: 'open',
          actor: 'alert-worker',
          reason: result.reason,
          metadata: { ruleId: rule.id, fingerprint },
        });

        logger.info(
          { alertId: alert.id, ruleId: rule.id, severity: alert.severity },
          'Alert created from rule trigger',
        );

        // 6. Track for escalation if rule has an escalation policy
        if (rule.escalationPolicyId) {
          this.deps.escalationDispatcher.track(alert.id, rule.escalationPolicyId);
        }

        // 7. Send notifications
        if (rule.channelIds.length > 0) {
          const channels = this.deps.channelStore.getByIds(rule.channelIds);
          const results = await this.deps.notifier.notifyAll(channels, alert);
          const failedNotifs = results.filter((r) => !r.success);
          if (failedNotifs.length > 0) {
            logger.warn({ alertId: alert.id, failedNotifs }, 'Some notifications failed');
          }
        }
      } catch (err) {
        logger.error({ ruleId: rule.id, err }, 'Failed to create alert for triggered rule');
      }
    }
  }

  /** Stop the worker gracefully. */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
  }

  private parseRedisUrl(url: string): { host: string; port: number } {
    try {
      const parsed = new URL(url);
      return { host: parsed.hostname || 'localhost', port: parseInt(parsed.port, 10) || 6379 };
    } catch {
      return { host: 'localhost', port: 6379 };
    }
  }
}
