import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import {
  type DataSourceInput,
  type DataSourceRecord,
  type DataSourceType,
} from '../schemas/onboarding.js';
import type { WizardStore } from './wizard-store.js';

/** URL patterns for quick validation before actual connection test */
const URL_PATTERNS: Record<DataSourceType, RegExp | null> = {
  rss_feed: /^https?:\/\/.+/,
  stix_taxii: /^https?:\/\/.+\/taxii2?\/?/,
  rest_api: /^https?:\/\/.+/,
  csv_upload: null,
  siem_splunk: /^https?:\/\/.+:\d+/,
  siem_sentinel: /^https?:\/\/.+\.azure\.com/,
  siem_elastic: /^https?:\/\/.+:\d+/,
  webhook: /^https?:\/\/.+/,
};

/** Types that require a URL field */
const URL_REQUIRED: DataSourceType[] = [
  'rss_feed', 'stix_taxii', 'rest_api', 'siem_splunk',
  'siem_sentinel', 'siem_elastic', 'webhook',
];

/** Types that require an API key */
const API_KEY_REQUIRED: DataSourceType[] = [
  'stix_taxii', 'rest_api', 'siem_splunk', 'siem_sentinel', 'siem_elastic',
];

/**
 * Validates and tests data source connectors before saving them.
 */
export class ConnectorValidator {
  constructor(private wizardStore: WizardStore) {}

  /** Validate data source input (structural + URL format check). */
  validate(input: DataSourceInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (URL_REQUIRED.includes(input.type) && !input.url) {
      errors.push(`URL is required for ${input.type} data sources`);
    }

    if (input.url) {
      const pattern = URL_PATTERNS[input.type];
      if (pattern && !pattern.test(input.url)) {
        errors.push(`URL format invalid for ${input.type}: expected ${pattern.source}`);
      }
    }

    if (API_KEY_REQUIRED.includes(input.type) && !input.apiKey) {
      errors.push(`API key is required for ${input.type} data sources`);
    }

    return { valid: errors.length === 0, errors };
  }

  /** Add a data source and register it in the wizard state. */
  async addSource(tenantId: string, input: DataSourceInput): Promise<DataSourceRecord> {
    const validation = this.validate(input);
    if (!validation.valid) {
      throw new AppError(400, validation.errors.join('; '), 'DATA_SOURCE_INVALID');
    }

    const now = new Date().toISOString();
    const record: DataSourceRecord = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      type: input.type,
      url: input.url ?? null,
      status: 'pending',
      lastTestedAt: null,
      errorMessage: null,
      createdAt: now,
    };

    await this.wizardStore.addDataSource(tenantId, record);
    return record;
  }

  /** Test a data source connection (simulated in Phase 6 — no actual HTTP calls). */
  async testConnection(tenantId: string, sourceId: string): Promise<DataSourceRecord> {
    const wizard = await this.wizardStore.get(tenantId);
    const source = wizard.dataSources.find((s) => s.id === sourceId);
    if (!source) {
      throw new AppError(404, `Data source '${sourceId}' not found`, 'DATA_SOURCE_NOT_FOUND');
    }

    // Mark as testing
    await this.wizardStore.updateDataSourceStatus(tenantId, sourceId, 'testing');

    // Simulate connection test (in production, would make actual HTTP request)
    const success = this.simulateConnectionTest(source);

    if (success) {
      return await this.wizardStore.updateDataSourceStatus(tenantId, sourceId, 'connected');
    } else {
      return await this.wizardStore.updateDataSourceStatus(
        tenantId,
        sourceId,
        'failed',
        `Failed to connect to ${source.type}: connection timeout`,
      );
    }
  }

  /** List all data sources for a tenant. */
  async listSources(tenantId: string): Promise<DataSourceRecord[]> {
    const wizard = await this.wizardStore.get(tenantId);
    return wizard.dataSources;
  }

  /** Remove a data source. */
  async removeSource(tenantId: string, sourceId: string): Promise<void> {
    const wizard = await this.wizardStore.get(tenantId);
    const idx = wizard.dataSources.findIndex((s) => s.id === sourceId);
    if (idx === -1) {
      throw new AppError(404, `Data source '${sourceId}' not found`, 'DATA_SOURCE_NOT_FOUND');
    }
    await this.wizardStore.updateDataSourceStatus(tenantId, sourceId, 'failed', 'Removed');
  }

  /** Get supported data source types with metadata. */
  getSupportedTypes(): Array<{ type: DataSourceType; label: string; requiresUrl: boolean; requiresApiKey: boolean }> {
    return [
      { type: 'rss_feed', label: 'RSS/Atom Feed', requiresUrl: true, requiresApiKey: false },
      { type: 'stix_taxii', label: 'STIX/TAXII 2.1', requiresUrl: true, requiresApiKey: true },
      { type: 'rest_api', label: 'REST API', requiresUrl: true, requiresApiKey: true },
      { type: 'csv_upload', label: 'CSV Upload', requiresUrl: false, requiresApiKey: false },
      { type: 'siem_splunk', label: 'Splunk SIEM', requiresUrl: true, requiresApiKey: true },
      { type: 'siem_sentinel', label: 'Microsoft Sentinel', requiresUrl: true, requiresApiKey: true },
      { type: 'siem_elastic', label: 'Elastic SIEM', requiresUrl: true, requiresApiKey: true },
      { type: 'webhook', label: 'Webhook Endpoint', requiresUrl: true, requiresApiKey: false },
    ];
  }

  // ─── Private ──────────────────────────────────────────

  /** Simulated connection test. RSS feeds and webhooks always succeed; others need URL+key. */
  private simulateConnectionTest(source: DataSourceRecord): boolean {
    if (source.type === 'csv_upload') return true;
    if (source.type === 'webhook') return true;
    if (source.type === 'rss_feed' && source.url) return true;
    return source.url !== null;
  }
}
