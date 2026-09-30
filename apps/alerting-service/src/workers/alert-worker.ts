import { Worker, Queue, type Job } from 'bullmq';
import { AppError } from '@etip/shared-utils';
import { QUEUES } from '@etip/shared-utils';
import type { RuleStore } from '../services/rule-store.js';
import { alertFingerprint, type AlertStore, type CreateAlertInput } from '../services/alert-store.js';
import type { ChannelStore } from '../services/channel-store.js';
import type { RuleEngine, EvaluationEvent } from '../services/rule-engine.js';
import type { Notifier } from '../services/notifier.js';
import type { AlertHistory } from '../services/alert-history.js';
import type { EscalationDispatcher } from '../services/escalation-dispatcher.js';
import type { AlertGroupStore } from '../services/alert-group-store.js';
import type { MaintenanceStore } from '../services/maintenance-store.js';
import { getLogger } from '../logger.js';

export interface AlertWorkerDeps {
  ruleStore: RuleStore;
  alertStore: AlertStore;
  channelStore: ChannelStore;
  ruleEngine: RuleEngine;
  notifier: Notifier;
  alertHistory: AlertHistory;
  escalationDispatcher: EscalationDispatcher;
  alertGroupStore: AlertGroupStore;
  maintenanceStore: MaintenanceStore;
  redisUrl: string;
  integrationPushEnabled?: boolean;
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
 *
 * Step 3 S155: no `prefix: 'etip'` — the correlation-engine and normalization producers
 * add jobs with BullMQ's default 'bull' prefix, so a worker on the 'etip' prefix never
 * received them. This was a live wiring bug; removing it makes the queue actually flow.
 */
export class AlertWorker {
  private worker: Worker | null = null;
  private queue: Queue;
  private integrationQueue: Queue | null = null;
  private readonly deps: AlertWorkerDeps;

  constructor(deps: AlertWorkerDeps) {
    this.deps = deps;
    const redisOpts = this.parseRedisUrl(deps.redisUrl);
    this.queue = new Queue(QUEUES.ALERT_EVALUATE, {
      connection: redisOpts,
    });

    // Downstream: INTEGRATION_PUSH queue
    if (deps.integrationPushEnabled !== false) {
      this.integrationQueue = new Queue(QUEUES.INTEGRATION_PUSH, {
        connection: redisOpts,
      });
      getLogger().info('Integration push queue initialized');
    }
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

    if (!payload || typeof payload.tenantId !== 'string' || payload.tenantId.length === 0
      || typeof payload.eventType !== 'string' || payload.eventType.length === 0) {
      logger.warn({ jobId: job.id }, 'Skipping malformed alert-evaluate job');
      return;
    }

    // A retry already pushed this event into the buffer — don't double-count it.
    if (job.attemptsMade === 0) {
      const event: EvaluationEvent = {
        tenantId: payload.tenantId,
        eventType: payload.eventType,
        metric: payload.metric,
        value: payload.value,
        field: payload.field,
        fieldValue: payload.fieldValue,
        timestamp: new Date(job.timestamp || Date.now()).toISOString(),
        source: payload.source,
      };
      this.deps.ruleEngine.pushEvent(event);
    }

    const rules = await this.deps.ruleStore.getEnabledRules(payload.tenantId);

    for (const rule of rules) {
      try {
        if (await this.deps.ruleStore.isInCooldown(rule.id)) continue;
        if (await this.deps.maintenanceStore.isRuleSuppressed(payload.tenantId, rule.id)) continue;

        const result = this.deps.ruleEngine.evaluate(rule);
        if (!result.triggered) continue;

        const fingerprint = alertFingerprint(rule.id, rule.severity, payload.source);
        const dup = await this.deps.alertStore.findDuplicate(rule.tenantId, fingerprint);
        if (dup) {
          // A retry must not double-count a duplicate it already recorded.
          if (job.attemptsMade === 0) await this.deps.alertStore.recordDuplicate(dup.id);
          logger.debug({ ruleId: rule.id, fingerprint, alertId: dup.id }, 'Alert deduplicated');
          continue;
        }

        const alertInput: CreateAlertInput = {
          ruleId: rule.id,
          ruleName: rule.name,
          tenantId: rule.tenantId,
          severity: rule.severity,
          title: `[${rule.severity.toUpperCase()}] ${rule.name}`,
          description: result.reason,
          source: payload.source,
          fingerprint,
        };

        const alert = await this.deps.alertStore.create(alertInput);
        await this.deps.ruleStore.markTriggered(rule.id);

        await this.deps.alertHistory.record({
          tenantId: rule.tenantId,
          alertId: alert.id,
          action: 'created',
          fromStatus: null,
          toStatus: 'open',
          actor: 'alert-worker',
          reason: result.reason,
          metadata: { ruleId: rule.id, fingerprint },
        });

        const groupResult = await this.deps.alertGroupStore.addAlert({
          alertId: alert.id,
          ruleId: rule.id,
          tenantId: rule.tenantId,
          severity: rule.severity,
          title: alert.title,
        });

        logger.info(
          {
            alertId: alert.id, ruleId: rule.id, severity: alert.severity,
            groupId: groupResult.group.id, groupIsNew: groupResult.isNew,
          },
          'Alert created from rule trigger',
        );

        if (rule.escalationPolicyId) {
          await this.deps.escalationDispatcher.track(alert.id, rule.escalationPolicyId, rule.tenantId);
        }

        if (rule.channelIds.length > 0) {
          const channels = await this.deps.channelStore.getByIds(rule.channelIds, rule.tenantId);
          const results = await this.deps.notifier.notifyAll(channels, alert);
          const failedNotifs = results.filter((r) => !r.success);
          if (failedNotifs.length > 0) {
            logger.warn({ alertId: alert.id, failedNotifs }, 'Some notifications failed');
          }
        }

        // Shape must match IntegrationPushJob: { tenantId, event, payload }
        if (this.integrationQueue) {
          this.integrationQueue.add('integration-push', {
            tenantId: alert.tenantId,
            event: 'alert.created',
            payload: {
              entityType: 'alert',
              entityId: alert.id,
              severity: alert.severity,
              title: alert.title,
              ruleId: rule.id,
              triggerEvent: 'alert_created',
            },
          }).catch((err) => logger.warn({ err: (err as Error).message, alertId: alert.id }, 'Failed to enqueue INTEGRATION_PUSH'));
        }
      } catch (err) {
        // A down DB must fail (and retry) the whole job — Postgres dedup makes the retry safe.
        if (err instanceof AppError && err.code === 'DB_UNAVAILABLE') throw err;
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
    if (this.integrationQueue) {
      await this.integrationQueue.close();
      this.integrationQueue = null;
    }
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
