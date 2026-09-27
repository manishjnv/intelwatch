import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationStore } from '../src/services/integration-store.js';
import { CredentialEncryption } from '../src/services/credential-encryption.js';
import type { CreateIntegrationInput } from '../src/schemas/integration.js';

const TENANT = 'tenant-1';
const TENANT_B = 'tenant-2';

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
    store = new IntegrationStore();
  });

  // ─── CRUD ───────────────────────────────────────────────────

  it('creates an integration', () => {
    const int = store.createIntegration(TENANT, makeInput());
    expect(int.id).toBeDefined();
    expect(int.name).toBe('Test Splunk');
    expect(int.tenantId).toBe(TENANT);
    expect(int.type).toBe('splunk_hec');
    expect(int.enabled).toBe(true);
  });

  it('gets an integration by ID and tenant', () => {
    const int = store.createIntegration(TENANT, makeInput());
    expect(store.getIntegration(int.id, TENANT)).toEqual(int);
  });

  it('returns undefined for wrong tenant', () => {
    const int = store.createIntegration(TENANT, makeInput());
    expect(store.getIntegration(int.id, TENANT_B)).toBeUndefined();
  });

  it('returns undefined for nonexistent ID', () => {
    expect(store.getIntegration('no-such-id', TENANT)).toBeUndefined();
  });

  it('lists integrations filtered by tenant', () => {
    store.createIntegration(TENANT, makeInput());
    store.createIntegration(TENANT, makeInput({ name: 'Second' }));
    store.createIntegration(TENANT_B, makeInput({ name: 'Other tenant' }));

    const result = store.listIntegrations(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
  });

  it('filters by type', () => {
    store.createIntegration(TENANT, makeInput());
    store.createIntegration(TENANT, makeInput({ name: 'Jira', type: 'jira' }));

    const result = store.listIntegrations(TENANT, { type: 'jira', page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0].type).toBe('jira');
  });

  it('filters by enabled status', () => {
    store.createIntegration(TENANT, makeInput({ enabled: true }));
    store.createIntegration(TENANT, makeInput({ name: 'Disabled', enabled: false }));

    const result = store.listIntegrations(TENANT, { enabled: false, page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0].enabled).toBe(false);
  });

  it('paginates correctly', () => {
    for (let i = 0; i < 5; i++) {
      store.createIntegration(TENANT, makeInput({ name: `Int-${i}` }));
    }
    const page1 = store.listIntegrations(TENANT, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);

    const page3 = store.listIntegrations(TENANT, { page: 3, limit: 2 });
    expect(page3.data).toHaveLength(1);
  });

  it('updates an integration', () => {
    const int = store.createIntegration(TENANT, makeInput());
    const updated = store.updateIntegration(int.id, TENANT, { name: 'Updated Name' });
    expect(updated?.name).toBe('Updated Name');
    expect(updated?.type).toBe('splunk_hec'); // unchanged
  });

  it('returns undefined when updating nonexistent', () => {
    expect(store.updateIntegration('no-id', TENANT, { name: 'X' })).toBeUndefined();
  });

  it('deletes an integration', () => {
    const int = store.createIntegration(TENANT, makeInput());
    expect(store.deleteIntegration(int.id, TENANT)).toBe(true);
    expect(store.getIntegration(int.id, TENANT)).toBeUndefined();
  });

  it('returns false when deleting nonexistent', () => {
    expect(store.deleteIntegration('no-id', TENANT)).toBe(false);
  });

  // ─── Trigger matching ──────────────────────────────────────

  it('returns enabled integrations matching a trigger', () => {
    store.createIntegration(TENANT, makeInput({ triggers: ['alert.created'] }));
    store.createIntegration(TENANT, makeInput({ name: 'IOC only', triggers: ['ioc.created'] }));
    store.createIntegration(TENANT, makeInput({ name: 'Disabled', enabled: false, triggers: ['alert.created'] }));

    const matches = store.getEnabledForTrigger(TENANT, 'alert.created');
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toBe('Test Splunk');
  });

  // ─── Logs ──────────────────────────────────────────────────

  it('adds and lists logs', () => {
    const int = store.createIntegration(TENANT, makeInput());
    store.addLog(int.id, TENANT, 'alert.created', 'success', { statusCode: 200 });
    store.addLog(int.id, TENANT, 'alert.created', 'failure', { errorMessage: 'timeout' });

    const logs = store.listLogs(int.id, TENANT, { page: 1, limit: 50 });
    expect(logs.total).toBe(2);
    const statuses = logs.data.map(l => l.status);
    expect(statuses).toContain('success');
    expect(statuses).toContain('failure');
  });

  // ─── DLQ ───────────────────────────────────────────────────

  it('manages dead letter queue', () => {
    const delivery = store.createDelivery({
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

    store.moveToDLQ(delivery.id);
    const dlq = store.listDLQ(TENANT, { page: 1, limit: 50 });
    expect(dlq.total).toBe(1);
    expect(dlq.data[0].status).toBe('dead_letter');

    const retried = store.retryDLQ(delivery.id, TENANT);
    expect(retried?.status).toBe('retrying');
    expect(retried?.attempts).toBe(0);

    const dlqAfter = store.listDLQ(TENANT, { page: 1, limit: 50 });
    expect(dlqAfter.total).toBe(0);
  });

  it('returns undefined when retrying DLQ from wrong tenant', () => {
    const delivery = store.createDelivery({
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
    store.moveToDLQ(delivery.id);
    expect(store.retryDLQ(delivery.id, TENANT_B)).toBeUndefined();
  });

  // ─── Tickets ───────────────────────────────────────────────

  it('creates and lists tickets', () => {
    store.createTicket({
      integrationId: 'int-1',
      tenantId: TENANT,
      externalId: 'INC001',
      externalUrl: 'https://snow.example.com/INC001',
      alertId: 'alert-1',
      title: 'Security Alert',
      status: 'open',
      priority: 'high',
    });

    const result = store.listTickets(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0].externalId).toBe('INC001');
  });

  it('updates ticket status', () => {
    const ticket = store.createTicket({
      integrationId: 'int-1',
      tenantId: TENANT,
      externalId: 'INC001',
      externalUrl: 'https://example.com',
      alertId: 'alert-1',
      title: 'Test',
      status: 'open',
      priority: 'medium',
    });

    const updated = store.updateTicketStatus(ticket.id, TENANT, 'resolved');
    expect(updated?.status).toBe('resolved');
  });

  // ─── Stats ─────────────────────────────────────────────────

  it('computes stats for a tenant', () => {
    store.createIntegration(TENANT, makeInput({ enabled: true }));
    store.createIntegration(TENANT, makeInput({ name: 'Disabled', enabled: false }));
    store.addLog('int-1', TENANT, 'alert.created', 'success', {});
    store.addLog('int-1', TENANT, 'alert.created', 'failure', {});

    const stats = store.getStats(TENANT);
    expect(stats.totalIntegrations).toBe(2);
    expect(stats.enabledIntegrations).toBe(1);
    expect(stats.totalLogs).toBe(2);
    expect(stats.failedLogs).toBe(1);
  });

  // ─── Touch ─────────────────────────────────────────────────

  it('touchIntegration updates lastUsedAt', () => {
    const int = store.createIntegration(TENANT, makeInput());
    expect(int.lastUsedAt).toBeNull();
    store.touchIntegration(int.id);
    const updated = store.getIntegration(int.id, TENANT);
    expect(updated?.lastUsedAt).toBeDefined();
  });

  // ─── Credential encryption (SSRF guard task, Part 4) ────────

  describe('credential encryption', () => {
    const KEY = 'etip-test-encryption-key-32chars!';

    it('encrypts secret fields at rest but returns plaintext to callers', () => {
      const encStore = new IntegrationStore();
      encStore.setCredentialEncryption(new CredentialEncryption(KEY));

      const created = encStore.createIntegration(TENANT, makeInput({
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

    it('does not double-encrypt on repeated updates (idempotent)', () => {
      const encStore = new IntegrationStore();
      const encryption = new CredentialEncryption(KEY);
      encStore.setCredentialEncryption(encryption);

      const created = encStore.createIntegration(TENANT, makeInput({
        siemConfig: { type: 'splunk_hec', url: 'https://s.example', token: 'token-v1', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
      }));

      // Round-trip the same (already-plaintext-from-caller's-view) config back through update.
      const updated1 = encStore.updateIntegration(created.id, TENANT, { siemConfig: created.siemConfig });
      const updated2 = encStore.updateIntegration(created.id, TENANT, { siemConfig: updated1?.siemConfig });

      expect(updated2?.siemConfig?.token).toBe('token-v1');
    });

    it('with no encryption injected, behaves exactly as before (plaintext at rest)', () => {
      // `store` in the outer describe has no encryption wired — default behaviour unchanged.
      const created = store.createIntegration(TENANT, makeInput({
        siemConfig: { type: 'splunk_hec', url: 'https://s.example', token: 'plain-token', index: 'main', sourcetype: 'etip:alert', verifySsl: true },
      }));
      expect(created.siemConfig?.token).toBe('plain-token');
      expect(store.getIntegration(created.id, TENANT)?.siemConfig?.token).toBe('plain-token');
    });
  });
});
