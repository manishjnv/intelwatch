import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type { WebhookRetryConfig, RetryState, TriggerEvent } from '../schemas/integration.js';
import type { IntegrationStore } from './integration-store.js';
import type { WebhookService } from './webhook-service.js';
import { getLogger } from '../logger.js';

/**
 * P1 #6: Enhanced webhook retry engine with configurable exponential backoff,
 * jitter, max delay cap, and persistent retry state tracking.
 * Wraps WebhookService with per-integration retry configuration.
 */
export class WebhookRetryEngine {
  private readonly retryConfigs = new Map<string, WebhookRetryConfig>();
  private readonly retryStats = new Map<string, {
    totalAttempts: number;
    successfulRetries: number;
    failedRetries: number;
    lastRetryAt: string | null;
    dlqCount: number;
  }>();
  private readonly defaultConfig: WebhookRetryConfig;

  constructor(
    private readonly store: IntegrationStore,
    _webhookService: WebhookService,
    defaults: { maxRetries: number; baseDelayMs: number; maxDelayMs: number },
  ) {
    this.defaultConfig = {
      maxRetries: defaults.maxRetries,
      baseDelayMs: defaults.baseDelayMs,
      maxDelayMs: defaults.maxDelayMs,
      jitterEnabled: true,
    };
  }

  /** Get retry config for an integration. Returns default if none set. */
  getRetryConfig(integrationId: string): WebhookRetryConfig {
    return this.retryConfigs.get(integrationId) ?? { ...this.defaultConfig };
  }

  /** Set custom retry config for an integration. Validates constraints. */
  setRetryConfig(integrationId: string, config: Partial<WebhookRetryConfig>): WebhookRetryConfig {
    const merged: WebhookRetryConfig = {
      ...this.defaultConfig,
      ...this.retryConfigs.get(integrationId),
      ...config,
    };
    if (merged.baseDelayMs > merged.maxDelayMs) {
      throw new AppError(400, 'baseDelayMs cannot exceed maxDelayMs', 'INVALID_RETRY_CONFIG');
    }
    this.retryConfigs.set(integrationId, merged);
    return merged;
  }

  /** Get retry state for an integration (attempts, successes, failures, DLQ count). */
  getRetryState(integrationId: string): RetryState {
    const stats = this.retryStats.get(integrationId) ?? {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      lastRetryAt: null,
      dlqCount: 0,
    };
    return {
      integrationId,
      ...stats,
      config: this.getRetryConfig(integrationId),
    };
  }

  /**
   * Send a webhook with configurable retry logic.
   * Uses exponential backoff: min(baseDelay * 2^attempt, maxDelay) + optional jitter.
   * Persists retry state and moves to DLQ after exhaustion.
   */
  async sendWithRetry(
    integrationId: string,
    tenantId: string,
    webhookConfig: { url: string; secret?: string; headers: Record<string, string>; method: 'POST' | 'PUT' },
    event: TriggerEvent,
    payload: Record<string, unknown>,
  ): Promise<{ deliveryId: string; success: boolean; attempts: number; error?: string }> {
    const logger = getLogger();
    const retryConfig = this.getRetryConfig(integrationId);

    // Create delivery record
    const delivery = this.store.createDelivery({
      integrationId,
      tenantId,
      event,
      payload,
      attempts: 0,
      maxAttempts: retryConfig.maxRetries,
      nextRetryAt: null,
      status: 'retrying',
      lastError: null,
    });

    // Init stats
    if (!this.retryStats.has(integrationId)) {
      this.retryStats.set(integrationId, {
        totalAttempts: 0,
        successfulRetries: 0,
        failedRetries: 0,
        lastRetryAt: null,
        dlqCount: 0,
      });
    }
    const stats = this.retryStats.get(integrationId)!;

    for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
      stats.totalAttempts++;
      stats.lastRetryAt = new Date().toISOString();

      try {
        // Use the underlying webhook service's executeWebhook via test
        // We re-implement the HTTP call here to control retry behavior
        const result = await this.executeAttempt(webhookConfig, event, payload);

        if (result.success) {
          this.store.updateDelivery(delivery.id, {
            status: 'success',
            attempts: attempt,
          });
          this.store.addLog(integrationId, tenantId, event, 'success', {
            statusCode: result.statusCode,
            attempt,
            payload,
            responseBody: result.responseBody,
          });
          this.store.touchIntegration(integrationId);

          if (attempt > 1) stats.successfulRetries++;
          return { deliveryId: delivery.id, success: true, attempts: attempt };
        }

        throw new Error(`HTTP ${result.statusCode}: ${result.responseBody}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ integrationId, deliveryId: delivery.id, attempt, maxRetries: retryConfig.maxRetries, error: errorMsg }, 'Webhook retry attempt failed');

        this.store.updateDelivery(delivery.id, {
          attempts: attempt,
          lastError: errorMsg,
        });

        if (attempt === retryConfig.maxRetries) {
          // Exhausted — move to DLQ
          stats.failedRetries++;
          stats.dlqCount++;
          this.store.moveToDLQ(delivery.id);
          this.store.addLog(integrationId, tenantId, event, 'dead_letter', {
            errorMessage: `Exhausted ${retryConfig.maxRetries} attempts: ${errorMsg}`,
            attempt,
            payload,
          });
          return { deliveryId: delivery.id, success: false, attempts: attempt, error: errorMsg };
        }

        this.store.addLog(integrationId, tenantId, event, 'retrying', {
          errorMessage: errorMsg,
          attempt,
          payload,
        });

        // Calculate backoff: min(baseDelay * 2^(attempt-1), maxDelay)
        const exponentialDelay = retryConfig.baseDelayMs * Math.pow(2, attempt - 1);
        let delayMs = Math.min(exponentialDelay, retryConfig.maxDelayMs);

        // Add jitter: random 0-100% of calculated delay
        if (retryConfig.jitterEnabled) {
          delayMs = Math.floor(delayMs * (0.5 + Math.random() * 0.5));
        }

        const nextRetry = new Date(Date.now() + delayMs).toISOString();
        this.store.updateDelivery(delivery.id, { nextRetryAt: nextRetry });
        await this.delay(delayMs);
      }
    }

    return { deliveryId: delivery.id, success: false, attempts: retryConfig.maxRetries, error: 'Max retries exceeded' };
  }

  /** Calculate backoff delay for a given attempt (exposed for testing). */
  calculateBackoff(attempt: number, config: WebhookRetryConfig): number {
    const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt - 1);
    let delayMs = Math.min(exponentialDelay, config.maxDelayMs);
    if (config.jitterEnabled) {
      delayMs = Math.floor(delayMs * (0.5 + Math.random() * 0.5));
    }
    return delayMs;
  }

  /** Reset retry stats for an integration. */
  resetStats(integrationId: string): void {
    this.retryStats.delete(integrationId);
  }

  /** Remove retry config for an integration (reverts to default). */
  removeRetryConfig(integrationId: string): void {
    this.retryConfigs.delete(integrationId);
  }

  /** Execute a single webhook attempt. */
  private async executeAttempt(
    config: { url: string; secret?: string; headers: Record<string, string>; method: 'POST' | 'PUT' },
    event: TriggerEvent,
    payload: Record<string, unknown>,
  ): Promise<{ success: boolean; statusCode: number; responseBody: string }> {
    const { createHmac } = await import('crypto');
    const body = JSON.stringify({
      event,
      data: payload,
      timestamp: new Date().toISOString(),
      source: 'etip',
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-ETIP-Event': event,
      'X-ETIP-Delivery': randomUUID(),
      ...config.headers,
    };

    if (config.secret) {
      const signature = createHmac('sha256', config.secret)
        .update(body, 'utf8')
        .digest('hex');
      headers['X-ETIP-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers,
        body,
        signal: controller.signal,
      });

      const responseBody = await response.text();
      return {
        success: response.ok,
        statusCode: response.status,
        responseBody: responseBody.slice(0, 1000),
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AppError(408, 'Webhook timed out', 'WEBHOOK_TIMEOUT');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
