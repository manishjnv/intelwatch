import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SiemAdapter } from '../src/services/siem-adapter.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { FieldMapper } from '../src/services/field-mapper.js';
import type { IntegrationConfig } from '../src/config.js';
import type { FieldMapping } from '../src/schemas/integration.js';

const TEST_CONFIG = {
  TI_INTEGRATION_SIEM_RETRY_MAX: 2,
  TI_INTEGRATION_SIEM_RETRY_DELAY_MS: 10, // fast for tests
} as IntegrationConfig;

describe('SiemAdapter', () => {
  let store: IntegrationStore;
  let mapper: FieldMapper;
  let adapter: SiemAdapter;

  beforeEach(() => {
    store = new IntegrationStore();
    mapper = new FieldMapper();
    adapter = new SiemAdapter(store, mapper, TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mappings: FieldMapping[] = [
    { sourceField: 'type', targetField: 'ioc_type', transform: 'none' },
    { sourceField: 'value', targetField: 'indicator', transform: 'none' },
  ];

  describe('push to Splunk HEC', () => {
    it('sends data and logs success on 200', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{"text":"Success","code":0}', { status: 200 }),
      );

      const result = await adapter.push(
        'int-1', 'tenant-1',
        { type: 'splunk_hec', url: 'https://splunk.example.com', token: 'tok', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
        { type: 'ip', value: '1.2.3.4' },
        mappings,
        'ioc.created',
      );

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('retries on failure and eventually returns failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

      const result = await adapter.push(
        'int-1', 'tenant-1',
        { type: 'splunk_hec', url: 'https://splunk.example.com', token: 'tok', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
        { type: 'ip', value: '1.2.3.4' },
        mappings,
        'ioc.created',
      );

      expect(result.success).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(2); // maxRetries = 2
    });
  });

  describe('push to Sentinel', () => {
    it('sends data with HMAC auth header', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('', { status: 200 }),
      );

      const result = await adapter.push(
        'int-1', 'tenant-1',
        { type: 'sentinel', workspaceId: 'ws-123', sharedKey: Buffer.from('testkey').toString('base64'), logType: 'ETIP_TI' },
        { type: 'domain', value: 'evil.com' },
        mappings,
        'alert.created',
      );

      expect(result.success).toBe(true);
      const call = vi.mocked(fetch).mock.calls[0];
      expect(call[0]).toContain('opinsights.azure.com');
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toMatch(/^SharedKey/);
    });
  });

  describe('push to Elastic', () => {
    it('sends data with ApiKey auth', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{"_id":"doc1"}', { status: 201 }),
      );

      const result = await adapter.push(
        'int-1', 'tenant-1',
        { type: 'elastic_siem', url: 'https://elastic.example.com', apiKey: 'key123', indexPattern: 'etip-alerts-*', verifySsl: true },
        { type: 'ip', value: '10.0.0.1' },
        mappings,
        'alert.created',
      );

      expect(result.success).toBe(true);
      const call = vi.mocked(fetch).mock.calls[0];
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('ApiKey key123');
    });
  });

  describe('testConnection', () => {
    it('returns success on 200', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 }),
      );

      const result = await adapter.testConnection(
        { type: 'splunk_hec', url: 'https://splunk.example.com', token: 'tok', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful');
    });

    it('returns failure on error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('DNS error'));

      const result = await adapter.testConnection(
        { type: 'splunk_hec', url: 'https://splunk.example.com', token: 'tok', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('DNS error');
    });
  });
});
