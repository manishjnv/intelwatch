/**
 * @module GlobalIocAlertHandler
 * @description Fans out alerts to subscribed tenants when critical/updated global IOCs are detected.
 * Listens for GLOBAL_IOC_CRITICAL and GLOBAL_IOC_UPDATED events.
 * DECISION-029 Phase C.
 */
import type { EventEmitter } from 'node:events';
import { EVENTS } from '@etip/shared-utils';
import type { AlertStore, CreateAlertInput } from '../services/alert-store.js';
import type pino from 'pino';

const SEVERITY_ORDER = ['info', 'low', 'medium', 'high', 'critical'];

function severityIndex(s: string): number {
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx === -1 ? 0 : idx;
}

export interface AlertConfig {
  minSeverity?: string;
  minConfidence?: number;
  iocTypes?: string[];
}

export interface TenantSubscription {
  tenantId: string;
  globalFeedId: string;
  alertConfig: AlertConfig;
}

export interface CriticalIocPayload {
  globalIocId: string;
  globalFeedId?: string;
  iocType: string;
  value: string;
  confidence: number;
  severity: string;
  stixConfidenceTier?: string;
  crossFeedCorroboration?: number;
  enrichmentSummary?: string;
}

export interface UpdatedIocPayload {
  globalIocId: string;
  globalFeedId?: string;
  iocType: string;
  value: string;
  previousConfidence: number;
  newConfidence: number;
  severity: string;
  previousLifecycle?: string;
  newLifecycle?: string;
}

export interface SubscriptionRepository {
  getSubscriptionsForFeed(globalFeedId: string): Promise<TenantSubscription[]>;
  getAllSubscriptions(): Promise<TenantSubscription[]>;
}

export class GlobalIocAlertHandler {
  constructor(
    private readonly alertStore: AlertStore,
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly logger?: pino.Logger,
  ) {}

  async handleCriticalIoc(payload: CriticalIocPayload): Promise<number> {
    const subs = payload.globalFeedId
      ? await this.subscriptionRepo.getSubscriptionsForFeed(payload.globalFeedId)
      : await this.subscriptionRepo.getAllSubscriptions();

    let notified = 0;

    for (const sub of subs) {
      if (!this.passesFilters(sub.alertConfig, payload)) continue;

      const input: CreateAlertInput = {
        ruleId: 'global-ioc-critical',
        ruleName: 'Global IOC Critical Alert',
        tenantId: sub.tenantId,
        severity: payload.severity as CreateAlertInput['severity'],
        title: `[GLOBAL] Critical IOC: ${payload.iocType} ${payload.value}`,
        description: payload.enrichmentSummary ?? `Critical global IOC detected: ${payload.value}`,
        source: {
          globalIocId: payload.globalIocId,
          confidence: payload.confidence,
          stixTier: payload.stixConfidenceTier,
          corroboration: payload.crossFeedCorroboration,
          origin: 'global_pipeline',
        },
      };

      this.alertStore.create(input);
      notified++;
    }

    this.logger?.info(
      { globalIocId: payload.globalIocId, notified, total: subs.length },
      `Global IOC alert: ${payload.globalIocId} → notified ${notified}/${subs.length} tenants`,
    );

    return notified;
  }

  async handleUpdatedIoc(payload: UpdatedIocPayload): Promise<number> {
    const confidenceJump = payload.newConfidence - payload.previousConfidence;
    const lifecycleActivated = payload.previousLifecycle === 'new' && payload.newLifecycle === 'active';

    // Only alert if significant change
    if (confidenceJump < 20 && !lifecycleActivated) return 0;

    const subs = payload.globalFeedId
      ? await this.subscriptionRepo.getSubscriptionsForFeed(payload.globalFeedId)
      : await this.subscriptionRepo.getAllSubscriptions();

    let notified = 0;

    for (const sub of subs) {
      const filterPayload: CriticalIocPayload = {
        globalIocId: payload.globalIocId,
        iocType: payload.iocType,
        value: payload.value,
        confidence: payload.newConfidence,
        severity: payload.severity,
      };
      if (!this.passesFilters(sub.alertConfig, filterPayload)) continue;

      const reason = lifecycleActivated
        ? `Lifecycle changed: new → active`
        : `Confidence jumped: ${payload.previousConfidence} → ${payload.newConfidence}`;

      const input: CreateAlertInput = {
        ruleId: 'global-ioc-updated',
        ruleName: 'Global IOC Updated Alert',
        tenantId: sub.tenantId,
        severity: payload.severity as CreateAlertInput['severity'],
        title: `[GLOBAL] IOC Updated: ${payload.iocType} ${payload.value}`,
        description: reason,
        source: {
          globalIocId: payload.globalIocId,
          confidenceJump,
          lifecycleActivated,
          origin: 'global_pipeline',
        },
      };

      this.alertStore.create(input);
      notified++;
    }

    this.logger?.info(
      { globalIocId: payload.globalIocId, notified, total: subs.length },
      `Global IOC updated alert: ${payload.globalIocId} → notified ${notified}/${subs.length} tenants`,
    );

    return notified;
  }

  registerEventListeners(eventBus: EventEmitter): void {
    eventBus.on(EVENTS.GLOBAL_IOC_CRITICAL, (payload: CriticalIocPayload) => {
      void this.handleCriticalIoc(payload);
    });
    eventBus.on(EVENTS.GLOBAL_IOC_UPDATED, (payload: UpdatedIocPayload) => {
      void this.handleUpdatedIoc(payload);
    });
  }

  private passesFilters(config: AlertConfig, payload: CriticalIocPayload): boolean {
    // Severity filter
    if (config.minSeverity && severityIndex(payload.severity) < severityIndex(config.minSeverity)) {
      return false;
    }
    // Confidence filter
    if (config.minConfidence != null && payload.confidence < config.minConfidence) {
      return false;
    }
    // IOC type filter
    if (config.iocTypes && config.iocTypes.length > 0 && !config.iocTypes.includes(payload.iocType)) {
      return false;
    }
    return true;
  }
}
