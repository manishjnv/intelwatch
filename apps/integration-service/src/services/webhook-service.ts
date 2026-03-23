import { createHmac, randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type { WebhookConfig, TriggerEvent } from '../schemas/integration.js';
import type { IntegrationStore } from './integration-store.js';
import type { IntegrationConfig } from '../config.js';
import { getLogger } from '../logger.js';

/**
 * Outbound webhook service with retry logic and dead letter queue.
 * Sends configurable HTTP requests on alert/IOC events.
 */
export class WebhookService {
  private readonly timeoutMs: number;
  private readonly maxAttempts = 3;
  private readonly retryBaseMs: number;

  constructor(
    private readonly store: IntegrationStore,
    config: IntegrationConfig,
  ) {
    this.timeoutMs = config.TI_INTEGRATION_WEBHOOK_TIMEOUT_MS;
    this.retryBaseMs = config.TI_INTEGRATION_SIEM_RETRY_DELAY_MS;
  }

  /**
   * Send a webhook for an event. Creates a delivery record and retries on failure.
   * After max attempts, moves to dead letter queue.
   */
  async send(
    integrationId: string,
    tenantId: string,
    webhookConfig: WebhookConfig,
    event: TriggerEvent,
    payload: Record<string, unknown>,
  ): Promise<{ deliveryId: string; success: boolean; error?: string }> {
    const logger = getLogger();
    const delivery = this.store.createDelivery({
      integrationId,
      tenantId,
      event,
      payload,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      nextRetryAt: null,
      status: 'retrying',
      lastError: null,
    });

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const result = await this.executeWebhook(webhookConfig, event, payload);

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
          return { deliveryId: delivery.id, success: true };
        }

        throw new Error(`HTTP ${result.statusCode}: ${result.responseBody}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ integrationId, deliveryId: delivery.id, attempt, error: errorMsg }, 'Webhook delivery failed');

        this.store.updateDelivery(delivery.id, {
          attempts: attempt,
          lastError: errorMsg,
        });

        if (attempt === this.maxAttempts) {
          // Move to dead letter queue
          this.store.moveToDLQ(delivery.id);
          this.store.addLog(integrationId, tenantId, event, 'dead_letter', {
            errorMessage: `Exhausted ${this.maxAttempts} attempts: ${errorMsg}`,
            attempt,
            payload,
          });
          return { deliveryId: delivery.id, success: false, error: errorMsg };
        }

        this.store.addLog(integrationId, tenantId, event, 'retrying', {
          errorMessage: errorMsg,
          attempt,
          payload,
        });

        // Exponential backoff using configured base delay
        const backoff = this.retryBaseMs * Math.pow(2, attempt - 1);
        const nextRetry = new Date(Date.now() + backoff).toISOString();
        this.store.updateDelivery(delivery.id, { nextRetryAt: nextRetry });
        await this.delay(backoff);
      }
    }

    return { deliveryId: delivery.id, success: false, error: 'Max retries exceeded' };
  }

  /** Test a webhook configuration by sending a test payload. */
  async testWebhook(webhookConfig: WebhookConfig): Promise<{ success: boolean; message: string; statusCode?: number }> {
    try {
      const testPayload = {
        type: 'test',
        source: 'etip',
        message: 'ETIP webhook connection test',
        timestamp: new Date().toISOString(),
      };
      const result = await this.executeWebhook(webhookConfig, 'alert.created', testPayload);
      return {
        success: result.success,
        statusCode: result.statusCode,
        message: result.success ? 'Webhook test successful' : `Failed: HTTP ${result.statusCode}`,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Webhook test failed',
      };
    }
  }

  /** Execute the HTTP request for a webhook. */
  private async executeWebhook(
    config: WebhookConfig,
    event: TriggerEvent,
    payload: Record<string, unknown>,
  ): Promise<{ success: boolean; statusCode: number; responseBody: string }> {
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

    // HMAC signature if secret is configured
    if (config.secret) {
      const signature = createHmac('sha256', config.secret)
        .update(body, 'utf8')
        .digest('hex');
      headers['X-ETIP-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

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
        throw new AppError(408, `Webhook timed out after ${this.timeoutMs}ms`, 'WEBHOOK_TIMEOUT');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Async delay helper. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
