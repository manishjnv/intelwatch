import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventRouter } from '../src/services/event-router.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { FieldMapper } from '../src/services/field-mapper.js';
import { SiemAdapter } from '../src/services/siem-adapter.js';
import { WebhookService } from '../src/services/webhook-service.js';
import type { IntegrationConfig } from '../src/config.js';
import type { Job } from 'bullmq';
import { safeFetch } from '../src/utils/safe-fetch.js';
import type { SafeFetchResponse } from '../src/utils/safe-fetch.js';

vi.mock('../src/utils/safe-fetch.js', () => ({ safeFetch: vi.fn() }));

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

const TEST_CONFIG = {
  TI_INTEGRATION_SIEM_RETRY_MAX: 1,
  TI_INTEGRATION_SIEM_RETRY_DELAY_MS: 10,
  TI_INTEGRATION_WEBHOOK_TIMEOUT_MS: 5000,
} as IntegrationConfig;

describe('EventRouter', () => {
  let store: IntegrationStore;
  let siemAdapter: SiemAdapter;
  let webhookService: WebhookService;
  let router: EventRouter;

  beforeEach(() => {
    store = new IntegrationStore();
    const mapper = new FieldMapper();
    siemAdapter = new SiemAdapter(store, mapper, TEST_CONFIG);
    webhookService = new WebhookService(store, TEST_CONFIG);
    router = new EventRouter(store, siemAdapter, webhookService, 'redis://localhost:6379');
  });

  it('processJob dispatches to SIEM integrations', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeResponse(200, 'OK'));

    store.createIntegration('tenant-1', {
      name: 'Splunk',
      type: 'splunk_hec',
      triggers: ['alert.created'],
      fieldMappings: [],
      credentials: {},
      siemConfig: {
        type: 'splunk_hec',
        url: 'https://splunk.example.com',
        token: 'test',
        index: 'main',
        sourcetype: 'etip:alert',
        verifySsl: true,
      },
    });

    const job = {
      data: {
        tenantId: 'tenant-1',
        event: 'alert.created' as const,
        payload: { alertId: 'a-1', severity: 'high' },
      },
    } as Job;

    await router.processJob(job);
    expect(safeFetch).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('processJob dispatches to webhook integrations', async () => {
    vi.mocked(safeFetch).mockResolvedValue(fakeResponse(200, 'OK'));

    store.createIntegration('tenant-1', {
      name: 'Slack Webhook',
      type: 'webhook',
      triggers: ['alert.created'],
      fieldMappings: [],
      credentials: {},
      webhookConfig: {
        url: 'https://hooks.slack.com/test',
        method: 'POST',
        headers: {},
      },
    });

    const job = {
      data: {
        tenantId: 'tenant-1',
        event: 'alert.created' as const,
        payload: { alertId: 'a-1' },
      },
    } as Job;

    await router.processJob(job);
    expect(safeFetch).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('processJob skips when no integrations match', async () => {
    vi.mocked(safeFetch).mockClear();

    const job = {
      data: {
        tenantId: 'tenant-1',
        event: 'ioc.created' as const,
        payload: {},
      },
    } as Job;

    await router.processJob(job);
    expect(safeFetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('processJob handles mixed success/failure', async () => {
    vi.mocked(safeFetch)
      .mockResolvedValueOnce(fakeResponse(200, 'OK'))
      .mockRejectedValueOnce(new Error('fail'));

    store.createIntegration('tenant-1', {
      name: 'Success',
      type: 'webhook',
      triggers: ['alert.created'],
      fieldMappings: [],
      credentials: {},
      webhookConfig: { url: 'https://ok.example.com', method: 'POST', headers: {} },
    });
    store.createIntegration('tenant-1', {
      name: 'Fail',
      type: 'webhook',
      triggers: ['alert.created'],
      fieldMappings: [],
      credentials: {},
      webhookConfig: { url: 'https://fail.example.com', method: 'POST', headers: {} },
    });

    const job = {
      data: {
        tenantId: 'tenant-1',
        event: 'alert.created' as const,
        payload: { test: true },
      },
    } as Job;

    // Should not throw — handles failures gracefully
    await expect(router.processJob(job)).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });
});
