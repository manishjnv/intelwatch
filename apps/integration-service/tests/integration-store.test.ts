import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma — same pattern as apps/user-service/__tests__/mfa-service.test.ts
// (vi.hoisted so the mock fns exist before vi.mock's factory runs).
const { mockCreate, mockUpdateMany, mockDeleteMany, mockFindMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdateMany: vi.fn(),
  mockDeleteMany: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock('../src/prisma.js', () => ({
  prisma: {
    integration: {
      create: mockCreate,
      updateMany: mockUpdateMany,
      deleteMany: mockDeleteMany,
      findMany: mockFindMany,
    },
  },
  disconnectPrisma: vi.fn(),
}));

import { IntegrationStore } from '../src/services/integration-store.js';
import { CredentialEncryption } from '../src/services/credential-encryption.js';
import type { CreateIntegrationInput } from '../src/schemas/integration.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const makeInput = (overrides: Partial<CreateIntegrationInput> = {}): CreateIntegrationInput => ({
  name: 'Test Splunk',
  type: 'splunk_hec',
  enabled: true,
  triggers: ['alert.created'],
  fieldMappings: [],
  credentials: {},
  ...overrides,
});

describe('IntegrationStore', () => {
  let store: IntegrationStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockFindMany.mockResolvedValue([]);
    store = new IntegrationStore();
  });

  // ─── CRUD ───────────────────────────────────────────────────

  it('creates an integration', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    expect(int.id).toBeDefined();
    expect(int.name).toBe('Test Splunk');
    expect(int.tenantId).toBe(TENANT);
    expect(int.type).toBe('splunk_hec');
    expect(int.enabled).toBe(true);
  });

  it('gets an integration by ID and tenant', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    expect(store.getIntegration(int.id, TENANT)).toEqual(int);
  });

  it('returns undefined for wrong tenant', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    expect(store.getIntegration(int.id, TENANT_B)).toBeUndefined();
  });

  it('returns undefined for nonexistent ID', () => {
    expect(store.getIntegration('no-such-id', TENANT)).toBeUndefined();
  });

  it('lists integrations filtered by tenant', async () => {
    await store.createIntegration(TENANT, makeInput());
    await store.createIntegration(TENANT, makeInput({ name: 'Second' }));
    await store.createIntegration(TENANT_B, makeInput({ name: 'Other tenant' }));

    const result = store.listIntegrations(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it('filters by type', async () => {
    await store.createIntegration(TENANT, makeInput());
    await store.createIntegration(TENANT, makeInput({ name: 'Jira', type: 'jira' }));

    const result = store.listIntegrations(TENANT, { type: 'jira', page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0].type).toBe('jira');
  });

  it('filters by enabled status', async () => {
    await store.createIntegration(TENANT, makeInput({ enabled: true }));
    await store.createIntegration(TENANT, makeInput({ name: 'Disabled', enabled: false }));

    const result = store.listIntegrations(TENANT, { enabled: false, page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0].enabled).toBe(false);
  });

  it('paginates correctly', async () => {
    for (let i = 0; i < 5; i++) {
      await store.createIntegration(TENANT, makeInput({ name: `Int-${i}` }));
    }
    const page1 = store.listIntegrations(TENANT, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = store.listIntegrations(TENANT, { page: 3, limit: 2 });
    expect(page3.data).toHaveLength(1);
  });

  it('updates an integration', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    const updated = await store.updateIntegration(int.id, TENANT, { name: 'Updated Name' });
    expect(updated?.name).toBe('Updated Name');
    expect(updated?.type).toBe('splunk_hec'); // unchanged
  });

  it('returns undefined when updating nonexistent', async () => {
    expect(await store.updateIntegration('no-id', TENANT, { name: 'X' })).toBeUndefined();
  });

  it('deletes an integration', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    expect(await store.deleteIntegration(int.id, TENANT)).toBe(true);
    expect(store.getIntegration(int.id, TENANT)).toBeUndefined();
  });

  it('returns false when deleting nonexistent', async () => {
    expect(await store.deleteIntegration('no-id', TENANT)).toBe(false);
  });

  // ─── Trigger matching ──────────────────────────────────────

  it('returns enabled integrations matching a trigger', async () => {
    await store.createIntegration(TENANT, makeInput({ triggers: ['alert.created'] }));
    await store.createIntegration(TENANT, makeInput({ name: 'IOC only', triggers: ['ioc.created'] }));
    await store.createIntegration(TENANT, makeInput({ name: 'Disabled', enabled: false, triggers: ['alert.created'] }));

    const matches = store.getEnabledForTrigger(TENANT, 'alert.created');
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Test Splunk');
  });

  // ─── Logs ──────────────────────────────────────────────────

  it('adds and lists logs', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    await store.addLog(int.id, TENANT, 'alert.created', 'success', { statusCode: 200 });
    await store.addLog(int.id, TENANT, 'alert.created', 'failure', { errorMessage: 'timeout' });

    const logs = await store.listLogs(int.id, TENANT, { page: 1, limit: 50 });
    expect(logs.total).toBe(2);
    const statuses = logs.data.map(l => l.status);
    expect(statuses).toContain('success');
    expect(statuses).toContain('failure');
  });

  // ─── DLQ ───────────────────────────────────────────────────

  it('manages dead letter queue', async () => {
    const delivery = await store.createDelivery({
      integrationId: 'int-1',
      tenantId: TENANT,
      event: 'alert.created',
      payload: { test: true },
      attempts: 3,
      maxAttempts: 3,
      nextRetryAt: null,
      status: 'failure',
      lastError: 'timeout',
    });

    await store.moveToDLQ(delivery.id);
    const dlq = await store.listDLQ(TENANT, { page: 1, limit: 50 });
    expect(dlq.total).toBe(1);
    expect(dlq.data[0].status).toBe('dead_letter');

    const retried = await store.retryDLQ(delivery.id, TENANT);
    expect(retried?.status).toBe('retrying');
    expect(retried?.attempts).toBe(0);

    const dlqAfter = await store.listDLQ(TENANT, { page: 1, limit: 50 });
    expect(dlqAfter.total).toBe(0);
  });

  it('returns undefined when retrying DLQ from wrong tenant', async () => {
    const delivery = await store.createDelivery({
      integrationId: 'int-1',
      tenantId: TENANT,
      event: 'alert.created',
      payload: {},
      attempts: 3,
      maxAttempts: 3,
      nextRetryAt: null,
      status: 'failure',
      lastError: 'err',
    });
    await store.moveToDLQ(delivery.id);
    expect(await store.retryDLQ(delivery.id, TENANT_B)).toBeUndefined();
  });

  // ─── Tickets ───────────────────────────────────────────────

  it('creates and lists tickets', async () => {
    await store.createTicket({
      integrationId: 'int-1',
      tenantId: TENANT,
      externalId: 'INC001',
      externalUrl: 'https://snow.example.com/INC001',
      alertId: 'alert-1',
      title: 'Security Alert',
      status: 'open',
      priority: 'high',
    });

    const result = await store.listTickets(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0].externalId).toBe('INC001');
  });

  it('updates ticket status', async () => {
    const ticket = await store.createTicket({
      integrationId: 'int-1',
      tenantId: TENANT,
      externalId: 'INC001',
      externalUrl: 'https://example.com',
      alertId: 'alert-1',
      title: 'Test',
      status: 'open',
      priority: 'medium',
    });

    const updated = await store.updateTicketStatus(ticket.id, TENANT, 'resolved');
    expect(updated?.status).toBe('resolved');
  });

  // ─── Stats ─────────────────────────────────────────────────

  it('computes stats for a tenant', async () => {
    await store.createIntegration(TENANT, makeInput({ enabled: true }));
    await store.createIntegration(TENANT, makeInput({ name: 'Disabled', enabled: false }));
    await store.addLog('int-1', TENANT, 'alert.created', 'success', {});
    await store.addLog('int-1', TENANT, 'alert.created', 'failure', {});

    const stats = await store.getStats(TENANT);
    expect(stats.totalIntegrations).toBe(2);
    expect(stats.enabledIntegrations).toBe(1);
    expect(stats.totalLogs).toBe(2);
    expect(stats.failedLogs).toBe(1);
  });

  // ─── Touch ─────────────────────────────────────────────────

  it('touchIntegration updates lastUsedAt', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    expect(int.lastUsedAt).toBeNull();
    store.touchIntegration(int.id);
    const updated = store.getIntegration(int.id, TENANT);
    expect(updated?.lastUsedAt).toBeDefined();
  });

  it('touchIntegration fires a DB write but does not block on it', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    mockUpdateMany.mockClear();
    store.touchIntegration(int.id); // synchronous — must return before the DB promise settles
    expect(store.getIntegration(int.id, TENANT)?.lastUsedAt).toBeDefined();
    await Promise.resolve(); // let the fire-and-forget microtask run
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: int.id, tenantId: TENANT } }),
    );
  });

  // ─── Postgres persistence (S166 PR B) ───────────────────────

  describe('Postgres persistence', () => {
    it('createIntegration writes to the DB before updating the cache', async () => {
      const int = await store.createIntegration(TENANT, makeInput());
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const data = mockCreate.mock.calls[0]![0].data;
      expect(data.id).toBe(int.id);
      expect(data.tenantId).toBe(TENANT);
      expect(data.name).toBe('Test Splunk');
    });

    it('createIntegration: DB failure throws AppError(503) and leaves the cache unchanged', async () => {
      mockCreate.mockRejectedValueOnce(new Error('connection refused'));
      await expect(store.createIntegration(TENANT, makeInput())).rejects.toMatchObject({ statusCode: 503 });
      expect(store.listIntegrations(TENANT, { page: 1, limit: 50 }).total).toBe(0);
    });

    it('updateIntegration scopes the DB write by (id, tenantId) and leaves the cache unchanged on failure', async () => {
      const int = await store.createIntegration(TENANT, makeInput());

      await store.updateIntegration(int.id, TENANT, { name: 'Scoped Update' });
      const updateCall = mockUpdateMany.mock.calls.at(-1)![0];
      expect(updateCall.where).toEqual({ id: int.id, tenantId: TENANT });
      expect(updateCall.data.name).toBe('Scoped Update');
      // Immutable columns are not re-sent on update.
      expect(updateCall.data.id).toBeUndefined();
      expect(updateCall.data.tenantId).toBeUndefined();
      expect(updateCall.data.createdAt).toBeUndefined();

      mockUpdateMany.mockRejectedValueOnce(new Error('timeout'));
      await expect(store.updateIntegration(int.id, TENANT, { name: 'Should Not Land' })).rejects.toMatchObject({ statusCode: 503 });
      expect(store.getIntegration(int.id, TENANT)?.name).toBe('Scoped Update');
    });

    it('deleteIntegration scopes the DB delete by (id, tenantId) and leaves the cache unchanged on failure', async () => {
      const int = await store.createIntegration(TENANT, makeInput());

      mockDeleteMany.mockRejectedValueOnce(new Error('timeout'));
      await expect(store.deleteIntegration(int.id, TENANT)).rejects.toMatchObject({ statusCode: 503 });
      expect(store.getIntegration(int.id, TENANT)).toBeDefined();

      await store.deleteIntegration(int.id, TENANT);
      const deleteCall = mockDeleteMany.mock.calls.at(-1)![0];
      expect(deleteCall.where).toEqual({ id: int.id, tenantId: TENANT });
      expect(store.getIntegration(int.id, TENANT)).toBeUndefined();
    });

    it('writes ciphertext (enc:v1:) to the DB, never plaintext secrets', async () => {
      const encStore = new IntegrationStore();
      encStore.setCredentialEncryption(new CredentialEncryption('etip-test-encryption-key-32chars!'));

      await encStore.createIntegration(TENANT, makeInput({
        siemConfig: { type: 'splunk_hec', url: 'https://s.example', token: 'db-plaintext-token', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
        credentials: { apiKey: 'db-plaintext-key' },
      }));

      const written = JSON.stringify(mockCreate.mock.calls.at(-1)![0].data);
      expect(written).toContain('enc:v1:');
      expect(written).not.toContain('db-plaintext-token');
      expect(written).not.toContain('db-plaintext-key');
    });

    it('hydrate() populates the cache from DB rows', async () => {
      const row = {
        id: 'row-1',
        tenantId: TENANT,
        name: 'From DB',
        type: 'webhook',
        enabled: true,
        triggers: ['ioc.created'],
        fieldMappings: [],
        config: { credentials: {}, lastUsedAt: null },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      mockFindMany.mockResolvedValueOnce([row]);

      await store.hydrate();

      const got = store.getIntegration('row-1', TENANT);
      expect(got?.name).toBe('From DB');
      expect(got?.type).toBe('webhook');
      expect(got?.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('round-trips: a created integration survives a DB row -> hydrate() cycle unchanged', async () => {
      const encStore = new IntegrationStore();
      encStore.setCredentialEncryption(new CredentialEncryption('etip-test-encryption-key-32chars!'));

      const created = await encStore.createIntegration(TENANT, makeInput({
        siemConfig: { type: 'splunk_hec', url: 'https://s.example', token: 'rt-token', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
      }));

      // Exactly what "Postgres" received for this row.
      const writtenRow = mockCreate.mock.calls.at(-1)![0].data;

      // A fresh service instance (post-redeploy) loading that same row back.
      mockFindMany.mockResolvedValueOnce([writtenRow]);
      const freshStore = new IntegrationStore();
      freshStore.setCredentialEncryption(new CredentialEncryption('etip-test-encryption-key-32chars!'));
      await freshStore.hydrate();

      expect(freshStore.getIntegration(created.id, TENANT)).toEqual(created);
    });

    it('hydrateWithRetry retries on failure and succeeds without throwing', async () => {
      vi.useFakeTimers();
      mockFindMany.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([]);
      const logger = { info: vi.fn(), error: vi.fn() };

      const pending = store.hydrateWithRetry(logger, { retryMs: 10, maxAttempts: 3 });
      await vi.advanceTimersByTimeAsync(10);
      await expect(pending).resolves.toBeUndefined();

      expect(mockFindMany).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('hydrateWithRetry gives up after max attempts without throwing or crashing', async () => {
      vi.useFakeTimers();
      mockFindMany.mockRejectedValue(new Error('still down'));
      const logger = { info: vi.fn(), error: vi.fn() };

      const pending = store.hydrateWithRetry(logger, { retryMs: 10, maxAttempts: 2 });
      await vi.advanceTimersByTimeAsync(10);
      await expect(pending).resolves.toBeUndefined();

      expect(mockFindMany).toHaveBeenCalledTimes(2);
      expect(logger.info).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  // ─── Credential encryption (SSRF guard task, Part 4) ────────

  describe('credential encryption', () => {
    const KEY = 'etip-test-encryption-key-32chars!';

    it('encrypts secret fields at rest but returns plaintext to callers', async () => {
      const encStore = new IntegrationStore();
      encStore.setCredentialEncryption(new CredentialEncryption(KEY));

      const created = await encStore.createIntegration(TENANT, makeInput({
        siemConfig: { type: 'splunk_hec', url: 'https://s.example', token: 'super-secret-token', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
        credentials: { apiKey: 'cred-secret' },
      }));

      // Caller (create response) sees plaintext.
      expect(created.siemConfig?.token).toBe('super-secret-token');
      expect(created.credentials.apiKey).toBe('cred-secret');

      // GET also decrypts transparently.
      const got = encStore.getIntegration(created.id, TENANT);
      expect(got?.siemConfig?.token).toBe('super-secret-token');

      // LIST also decrypts transparently.
      const list = encStore.listIntegrations(TENANT, { page: 1, limit: 50 });
      expect(list.data[0]?.siemConfig?.token).toBe('super-secret-token');

      // getEnabledForTrigger (used by services that actually connect) decrypts too.
      const enabled = encStore.getEnabledForTrigger(TENANT, 'alert.created');
      expect(enabled[0]?.siemConfig?.token).toBe('super-secret-token');
    });

    it('does not double-encrypt on repeated updates (idempotent)', async () => {
      const encStore = new IntegrationStore();
      const encryption = new CredentialEncryption(KEY);
      encStore.setCredentialEncryption(encryption);

      const created = await encStore.createIntegration(TENANT, makeInput({
        siemConfig: { type: 'splunk_hec', url: 'https://s.example', token: 'token-v1', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
      }));

      // Round-trip the same (already-plaintext-from-caller's-view) config back through update.
      const updated1 = await encStore.updateIntegration(created.id, TENANT, { siemConfig: created.siemConfig });
      const updated2 = await encStore.updateIntegration(created.id, TENANT, { siemConfig: updated1?.siemConfig });

      expect(updated2?.siemConfig?.token).toBe('token-v1');
    });

    it('with no encryption injected, behaves exactly as before (plaintext at rest)', async () => {
      // `store` in the outer describe has no encryption wired — default behaviour unchanged.
      const created = await store.createIntegration(TENANT, makeInput({
        siemConfig: { type: 'splunk_hec', url: 'https://s.example', token: 'plain-token', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
      }));
      expect(created.siemConfig?.token).toBe('plain-token');
      expect(store.getIntegration(created.id, TENANT)?.siemConfig?.token).toBe('plain-token');
    });
  });
});
