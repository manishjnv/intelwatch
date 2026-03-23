import { createHmac } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type { SiemConfig, FieldMapping } from '../schemas/integration.js';
import type { FieldMapper } from './field-mapper.js';
import type { IntegrationStore } from './integration-store.js';
import type { IntegrationConfig } from '../config.js';
import { getLogger } from '../logger.js';

interface SiemPushResult {
  success: boolean;
  statusCode: number;
  responseBody: string;
  error?: string;
}

/**
 * SIEM integration adapters: push IOCs/alerts to Splunk HEC, Sentinel, or Elastic.
 * Each adapter formats the payload per the SIEM's ingestion API requirements.
 */
export class SiemAdapter {
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly store: IntegrationStore,
    private readonly fieldMapper: FieldMapper,
    config: IntegrationConfig,
  ) {
    this.maxRetries = config.TI_INTEGRATION_SIEM_RETRY_MAX;
    this.retryDelayMs = config.TI_INTEGRATION_SIEM_RETRY_DELAY_MS;
  }

  /** Push data to a SIEM. Retries on failure with exponential backoff. */
  async push(
    integrationId: string,
    tenantId: string,
    siemConfig: SiemConfig,
    payload: Record<string, unknown>,
    mappings: FieldMapping[],
    event: 'alert.created' | 'alert.updated' | 'alert.closed' | 'ioc.created' | 'ioc.updated' | 'correlation.match' | 'drp.alert.created' | 'hunt.completed',
  ): Promise<SiemPushResult> {
    const logger = getLogger();
    const mapped = this.fieldMapper.applyMappings(payload, mappings);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.sendToSiem(siemConfig, mapped);
        this.store.addLog(integrationId, tenantId, event, 'success', {
          statusCode: result.statusCode,
          attempt,
          payload: mapped,
          responseBody: result.responseBody,
        });
        this.store.touchIntegration(integrationId);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn({ integrationId, attempt, error: errorMsg }, 'SIEM push failed');

        if (attempt === this.maxRetries) {
          this.store.addLog(integrationId, tenantId, event, 'failure', {
            errorMessage: errorMsg,
            attempt,
            payload: mapped,
          });
          return { success: false, statusCode: 0, responseBody: '', error: errorMsg };
        }

        this.store.addLog(integrationId, tenantId, event, 'retrying', {
          errorMessage: errorMsg,
          attempt,
          payload: mapped,
        });

        await this.delay(this.retryDelayMs * Math.pow(2, attempt - 1));
      }
    }

    return { success: false, statusCode: 0, responseBody: '', error: 'Max retries exceeded' };
  }

  /** Test connection to a SIEM by sending an empty test event. */
  async testConnection(siemConfig: SiemConfig): Promise<{ success: boolean; message: string }> {
    try {
      const testPayload = {
        type: 'test',
        message: 'ETIP connection test',
        timestamp: new Date().toISOString(),
      };
      const result = await this.sendToSiem(siemConfig, testPayload);
      return {
        success: result.success,
        message: result.success ? 'Connection successful' : `Failed: ${result.responseBody}`,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      };
    }
  }

  /** Route to the correct SIEM-specific sender. */
  private async sendToSiem(
    config: SiemConfig,
    payload: Record<string, unknown>,
  ): Promise<SiemPushResult> {
    switch (config.type) {
      case 'splunk_hec':
        return this.sendToSplunk(config.url, config.token, payload, config.index, config.sourcetype);
      case 'sentinel':
        return this.sendToSentinel(config.workspaceId, config.sharedKey, config.logType, payload);
      case 'elastic_siem':
        return this.sendToElastic(config.url, config.apiKey, config.indexPattern, payload);
      default:
        throw new AppError(400, `Unsupported SIEM type`, 'UNSUPPORTED_SIEM');
    }
  }

  /** Push event to Splunk HTTP Event Collector. */
  private async sendToSplunk(
    url: string,
    token: string,
    payload: Record<string, unknown>,
    index: string,
    sourcetype: string,
  ): Promise<SiemPushResult> {
    const body = JSON.stringify({
      event: payload,
      index,
      sourcetype,
      time: Date.now() / 1000,
    });

    const response = await fetch(`${url}/services/collector/event`, {
      method: 'POST',
      headers: {
        Authorization: `Splunk ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const responseBody = await response.text();
    return {
      success: response.ok,
      statusCode: response.status,
      responseBody,
    };
  }

  /** Push event to Microsoft Sentinel Log Analytics workspace. */
  private async sendToSentinel(
    workspaceId: string,
    sharedKey: string,
    logType: string,
    payload: Record<string, unknown>,
  ): Promise<SiemPushResult> {
    const body = JSON.stringify([payload]);
    const date = new Date().toUTCString();
    const signature = this.buildSentinelSignature(body, date, sharedKey, workspaceId);
    const url = `https://${workspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Log-Type': logType,
        'x-ms-date': date,
        Authorization: signature,
      },
      body,
    });

    const responseBody = await response.text();
    return { success: response.ok, statusCode: response.status, responseBody };
  }

  /** Push event to Elastic SIEM index. */
  private async sendToElastic(
    url: string,
    apiKey: string,
    indexPattern: string,
    payload: Record<string, unknown>,
  ): Promise<SiemPushResult> {
    const index = indexPattern.replace('*', new Date().toISOString().slice(0, 10));
    const body = JSON.stringify({ ...payload, '@timestamp': new Date().toISOString() });

    const response = await fetch(`${url}/${index}/_doc`, {
      method: 'POST',
      headers: {
        Authorization: `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const responseBody = await response.text();
    return { success: response.ok, statusCode: response.status, responseBody };
  }

  /** Build HMAC-SHA256 authorization header for Sentinel. */
  private buildSentinelSignature(
    body: string,
    date: string,
    sharedKey: string,
    workspaceId: string,
  ): string {
    const contentLength = Buffer.byteLength(body, 'utf8');
    const stringToSign = `POST\n${contentLength}\napplication/json\nx-ms-date:${date}\n/api/logs`;
    const key = Buffer.from(sharedKey, 'base64');
    const hmac = createHmac('sha256', key).update(stringToSign, 'utf8').digest('base64');
    return `SharedKey ${workspaceId}:${hmac}`;
  }

  /** Async delay helper. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
