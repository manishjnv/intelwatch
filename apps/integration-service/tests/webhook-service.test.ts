import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookService } from '../src/services/webhook-service.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import type { IntegrationConfig } from '../src/config.js';
import type { WebhookConfig } from '../src/schemas/integration.js';
import { safeFetch } from '../src/utils/safe-fetch.js';
import type { SafeFetchResponse } from '../src/utils/safe-fetch.js';

vi.mock('../src/utils/safe-fetch.js', () => ({ safeFetch: vi.fn() }));

const TEST_CONFIG = {
  TI_INTEGRATION_WEBHOOK_TIMEOUT_MS: 5000,
  TI_INTEGRATION_SIEM_RETRY_DELAY_MS: 10, // fast retries for tests
} as IntegrationConfig;

const webhookConfig: WebhookConfig = {
  url: 'https://hooks.example.com/webhook',
  secret: 'test-secret-12345678',
  headers: {},
  method: 'POST',
};

/** Build a minimal SafeFetchResponse for mocking. */
function fakeResponse(status: number, body = ''): SafeFetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: {},
    text: () => Promise.resolve(body),
    json: <T,>() => Promise.resolve(JSON.parse(body) as T),
  };
}

describe('WebhookService', () => {
  let store: IntegrationStore;
  let service: WebhookService;

  beforeEach(() => {
    store = new IntegrationStore();
    service = new WebhookService(store, TEST_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('send', () => {
    it('delivers webhook successfully on 200', async () => {
      vi.mocked(safeFetch).mockResolvedValue(fakeResponse(200, 'OK'));

      const result = await service.send(
        'int-1', 'tenant-1', webhookConfig,
        'alert.created', { alertId: 'a-1', severity: 'high' },
      );

      expect(result.success).toBe(true);
      expect(result.deliveryId).toBeDefined();
    });

    it('includes HMAC signature when secret configured', async () => {
      vi.mocked(safeFetch).mockResolvedValue(fakeResponse(200, 'OK'));

      await service.send(
        'int-1', 'tenant-1', webhookConfig,
        'alert.created', { test: true },
      );

      const call = vi.mocked(safeFetch).mock.calls[0]!;
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers['X-ETIP-Signature']).toMatch(/^sha256=/);
      expect(headers['X-ETIP-Event']).toBe('alert.created');
      expect(headers['X-ETIP-Delivery']).toBeDefined();
    });

    it('retries on failure and moves to DLQ after max attempts', async () => {
      vi.mocked(safeFetch).mockRejectedValue(new Error('Connection refused'));

      const result = await service.send(
        'int-1', 'tenant-1', webhookConfig,
        'alert.created', { test: true },
      );

      expect(result.success).toBe(false);
      expect(safeFetch).toHaveBeenCalledTimes(3); // 3 max attempts

      // Verify DLQ
      const dlq = await store.listDLQ('tenant-1', { page: 1, limit: 50 });
      expect(dlq.total).toBe(1);
      expect(dlq.data[0].status).toBe('dead_letter');
    });

    it('logs all attempts', async () => {
      vi.mocked(safeFetch)
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockResolvedValueOnce(fakeResponse(200, 'OK'));

      await service.send(
        'int-1', 'tenant-1', webhookConfig,
        'alert.created', { test: true },
      );

      // Should have retry log + success log
      const logs = await store.listLogs('int-1', 'tenant-1', { page: 1, limit: 50 });
      expect(logs.total).toBe(2);
    });

    it('skips HMAC when no secret configured', async () => {
      vi.mocked(safeFetch).mockResolvedValue(fakeResponse(200, 'OK'));

      const noSecretConfig: WebhookConfig = {
        url: 'https://hooks.example.com/webhook',
        headers: {},
        method: 'POST',
      };

      await service.send(
        'int-1', 'tenant-1', noSecretConfig,
        'alert.created', {},
      );

      const call = vi.mocked(safeFetch).mock.calls[0]!;
      const headers = call[1]?.headers as Record<string, string>;
      expect(headers['X-ETIP-Signature']).toBeUndefined();
    });
  });

  describe('testWebhook', () => {
    it('returns success on 200', async () => {
      vi.mocked(safeFetch).mockResolvedValue(fakeResponse(200, 'OK'));

      const result = await service.testWebhook(webhookConfig);
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    it('returns failure on 500', async () => {
      vi.mocked(safeFetch).mockResolvedValue(fakeResponse(500, 'Error'));

      const result = await service.testWebhook(webhookConfig);
      expect(result.success).toBe(false);
    });

    it('returns failure on network error', async () => {
      vi.mocked(safeFetch).mockRejectedValue(new Error('DNS failed'));

      const result = await service.testWebhook(webhookConfig);
      expect(result.success).toBe(false);
      expect(result.message).toContain('DNS failed');
    });
  });
});
