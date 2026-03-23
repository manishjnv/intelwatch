import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventRouter } from '../src/services/event-router.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import { FieldMapper } from '../src/services/field-mapper.js';
import { SiemAdapter } from '../src/services/siem-adapter.js';
import { WebhookService } from '../src/services/webhook-service.js';
import type { IntegrationConfig } from '../src/config.js';
import type { Job } from 'bullmq';

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK', { status: 200 }));

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
    expect(fetch).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('processJob dispatches to webhook integrations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK', { status: 200 }));

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
    expect(fetch).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('processJob skips when no integrations match', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const job = {
      data: {
        tenantId: 'tenant-1',
        event: 'ioc.created' as const,
        payload: {},
      },
    } as Job;

    await router.processJob(job);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('processJob handles mixed success/failure', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('OK', { status: 200 }))
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
