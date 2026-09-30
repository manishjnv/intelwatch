import { describe, it, expect, vi } from 'vitest';

// Mock Prisma — persistence of the `integrations` cache itself is covered by
// integration-store.test.ts; this file exercises the logs/deliveries/tickets records repo.
vi.mock('../src/prisma.js', () => ({
  prisma: {
    integration: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  disconnectPrisma: vi.fn(),
}));

import { IntegrationStore } from '../src/services/integration-store.js';
import { MemoryRecordsRepo } from '../src/services/records-repo.js';
import type { IntegrationRecordsRepo } from '../src/services/records-repo.js';
import { WebhookService } from '../src/services/webhook-service.js';
import { safeFetch } from '../src/utils/safe-fetch.js';
import type { SafeFetchResponse } from '../src/utils/safe-fetch.js';
import type { IntegrationConfig } from '../src/config.js';
import type { WebhookConfig } from '../src/schemas/integration.js';

vi.mock('../src/utils/safe-fetch.js', () => ({ safeFetch: vi.fn() }));

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

/** Wrap a base repo, delegating every method to it except the ones overridden — class methods
 * live on the prototype, so a plain object spread would lose them; this binds them explicitly. */
function wrapRepo(base: MemoryRecordsRepo, overrides: Partial<IntegrationRecordsRepo>): IntegrationRecordsRepo {
  const methods: (keyof IntegrationRecordsRepo)[] = [
    'addLog', 'listLogs', 'countLogs', 'deleteLogsForIntegration',
    'insertDelivery', 'updateDelivery', 'getDelivery', 'listDeliveries', 'countDeliveries',
    'insertTicket', 'getTicket', 'updateTicket', 'listTickets', 'countTickets', 'purgeOlderThan',
  ];
  const wrapped = {} as IntegrationRecordsRepo;
  for (const m of methods) {
    (wrapped[m] as unknown) = base[m].bind(base);
  }
  return { ...wrapped, ...overrides };
}

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

describe('Integration records persistence (Step 3 S156)', () => {
  // ─── Restart: two IntegrationStore instances sharing one repo ────

  it('logs, DLQ and tickets written through store #1 are read back through a fresh store #2', async () => {
    const repo = new MemoryRecordsRepo();
    const store1 = new IntegrationStore(repo);
    const int = await store1.createIntegration(TENANT_A, {
      name: 'Restart Test', type: 'webhook', enabled: true, triggers: ['alert.created'],
      fieldMappings: [], credentials: {},
    });

    await store1.addLog(int.id, TENANT_A, 'alert.created', 'success', { statusCode: 200 });
    const delivery = await store1.createDelivery({
      integrationId: int.id, tenantId: TENANT_A, event: 'alert.created', payload: {},
      attempts: 3, maxAttempts: 3, nextRetryAt: null, status: 'failure', lastError: 'timeout',
    });
    await store1.moveToDLQ(delivery.id);
    const ticket = await store1.createTicket({
      integrationId: int.id, tenantId: TENANT_A, externalId: 'INC1', externalUrl: 'https://x',
      alertId: 'alert-1', title: 'T', status: 'open', priority: 'high',
    });

    // Simulate a redeploy: a brand new store instance, same underlying repo.
    const store2 = new IntegrationStore(repo);

    const logs = await store2.listLogs(int.id, TENANT_A, { page: 1, limit: 50 });
    expect(logs.total).toBe(1);

    const dlq = await store2.listDLQ(TENANT_A, { page: 1, limit: 50 });
    expect(dlq.total).toBe(1);
    expect(dlq.data[0]!.id).toBe(delivery.id);

    const gotTicket = await store2.getTicket(ticket.id, TENANT_A);
    expect(gotTicket?.externalId).toBe('INC1');
  });

  // ─── Cross-tenant isolation ───────────────────────────────────

  it('tenant B cannot getTicket or retryDLQ tenant A records', async () => {
    const repo = new MemoryRecordsRepo();
    const store = new IntegrationStore(repo);

    const ticket = await store.createTicket({
      integrationId: 'int-1', tenantId: TENANT_A, externalId: 'INC1', externalUrl: 'https://x',
      alertId: 'alert-1', title: 'T', status: 'open', priority: 'high',
    });
    expect(await store.getTicket(ticket.id, TENANT_B)).toBeUndefined();
    expect(await store.getTicket(ticket.id, TENANT_A)).toBeDefined();

    const delivery = await store.createDelivery({
      integrationId: 'int-1', tenantId: TENANT_A, event: 'alert.created', payload: {},
      attempts: 3, maxAttempts: 3, nextRetryAt: null, status: 'failure', lastError: 'err',
    });
    await store.moveToDLQ(delivery.id);
    expect(await store.retryDLQ(delivery.id, TENANT_B)).toBeUndefined();
    expect(await store.retryDLQ(delivery.id, TENANT_A)).toBeDefined();
  });

  // ─── Best-effort: a flaky write repo must not trigger a duplicate customer webhook ────

  it('WebhookService.send does not re-send when addLog/insertDelivery/updateDelivery reject', async () => {
    const memory = new MemoryRecordsRepo();
    const flaky = wrapRepo(memory, {
      addLog: vi.fn().mockRejectedValue(new Error('db down')),
      insertDelivery: vi.fn().mockRejectedValue(new Error('db down')),
      updateDelivery: vi.fn().mockRejectedValue(new Error('db down')),
    });
    const store = new IntegrationStore(flaky);
    const config = {
      TI_INTEGRATION_WEBHOOK_TIMEOUT_MS: 5000,
      TI_INTEGRATION_SIEM_RETRY_DELAY_MS: 10,
    } as IntegrationConfig;
    const service = new WebhookService(store, config);
    const webhookConfig: WebhookConfig = {
      url: 'https://hooks.example.com/webhook', headers: {}, method: 'POST',
    };

    vi.mocked(safeFetch).mockResolvedValueOnce(fakeResponse(200, 'OK'));

    const result = await service.send('int-1', TENANT_A, webhookConfig, 'alert.created', { test: true });

    expect(result.success).toBe(true);
    expect(safeFetch).toHaveBeenCalledTimes(1); // no retry / no duplicate send from the DB failure
  });

  // ─── Reads throw 503 on DB failure ───────────────────────────

  it('listLogs throws AppError 503 DB_UNAVAILABLE when the repo read rejects', async () => {
    const memory = new MemoryRecordsRepo();
    const flaky = wrapRepo(memory, { listLogs: vi.fn().mockRejectedValue(new Error('db down')) });
    const store = new IntegrationStore(flaky);

    await expect(store.listLogs('int-1', TENANT_A, { page: 1, limit: 50 })).rejects.toMatchObject({
      statusCode: 503,
      code: 'DB_UNAVAILABLE',
    });
  });
});
