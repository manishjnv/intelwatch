import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma — persistence itself is covered by integration-store.test.ts;
// this file only needs create/update to resolve so the store's cache behaves.
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

import { CredentialRotationService } from '../src/services/credential-rotation.js';
import { IntegrationStore } from '../src/services/integration-store.js';
import type { CreateIntegrationInput } from '../src/schemas/integration.js';

const TENANT = 'tenant-cred';

const makeInput = (): CreateIntegrationInput => ({
  name: 'Test SIEM',
  type: 'splunk_hec',
  enabled: true,
  triggers: ['alert.created'],
  fieldMappings: [],
  credentials: { apiKey: 'old-secret-key-12345', token: 'old-token-abcdef' },
});

describe('CredentialRotationService', () => {
  let store: IntegrationStore;
  let rotation: CredentialRotationService;

  beforeEach(() => {
    store = new IntegrationStore();
    rotation = new CredentialRotationService(store, null); // No encryption for tests
  });

  it('rotates credentials successfully', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    const record = await rotation.rotate(int.id, TENANT, {
      newCredentials: { apiKey: 'new-key', token: 'new-token' },
      gracePeriodMinutes: 30,
    });

    expect(record.id).toBeDefined();
    expect(record.integrationId).toBe(int.id);
    expect(record.gracePeriodMinutes).toBe(30);
    expect(record.status).toBe('grace_period');
    expect(record.oldCredentialsMasked.apiKey).toContain('***');
    expect(record.graceExpiresAt).toBeDefined();
  });

  it('updates the integration credentials on rotation', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    await rotation.rotate(int.id, TENANT, {
      newCredentials: { apiKey: 'new-key-xyz' },
      gracePeriodMinutes: 0,
    });

    const updated = store.getIntegration(int.id, TENANT);
    expect(updated?.credentials.apiKey).toBe('new-key-xyz');
  });

  it('throws for nonexistent integration', async () => {
    await expect(
      rotation.rotate('no-such', TENANT, {
        newCredentials: { apiKey: 'x' },
        gracePeriodMinutes: 0,
      }),
    ).rejects.toThrow('not found');
  });

  it('sets status to expired when gracePeriod is 0', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    const record = await rotation.rotate(int.id, TENANT, {
      newCredentials: { apiKey: 'new' },
      gracePeriodMinutes: 0,
    });
    expect(record.status).toBe('expired');
  });

  it('masks old credential values', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    const record = await rotation.rotate(int.id, TENANT, {
      newCredentials: { apiKey: 'new' },
      gracePeriodMinutes: 0,
    });
    // Original was 'old-secret-key-12345'
    expect(record.oldCredentialsMasked.apiKey).not.toBe('old-secret-key-12345');
    expect(record.oldCredentialsMasked.apiKey).toContain('*');
  });

  // ─── Rotation History ───────────────────────────────────────

  it('tracks rotation history', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    await rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v1' }, gracePeriodMinutes: 0 });
    await rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v2' }, gracePeriodMinutes: 0 });
    await rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v3' }, gracePeriodMinutes: 0 });

    const history = await rotation.getRotationHistory(int.id, TENANT, { page: 1, limit: 50 });
    expect(history.total).toBe(3);
    expect(history.data[0]!.rotatedAt >= history.data[1]!.rotatedAt).toBe(true); // newest first
  });

  it('paginates rotation history', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    for (let i = 0; i < 5; i++) {
      await rotation.rotate(int.id, TENANT, { newCredentials: { k: `v${i}` }, gracePeriodMinutes: 0 });
    }
    const page = await rotation.getRotationHistory(int.id, TENANT, { page: 1, limit: 2 });
    expect(page.data).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  // ─── Latest Rotation ───────────────────────────────────────

  it('gets latest rotation', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    await rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v1' }, gracePeriodMinutes: 60 });

    const latest = await rotation.getLatestRotation(int.id, TENANT);
    expect(latest).toBeDefined();
    expect(latest!.gracePeriodMinutes).toBe(60);
    expect(latest!.status).toBe('grace_period');
  });

  it('returns null when no rotations exist', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    expect(await rotation.getLatestRotation(int.id, TENANT)).toBeNull();
  });

  // ─── Grace Period ───────────────────────────────────────────

  it('isInGracePeriod returns true during grace period', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    await rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v1' }, gracePeriodMinutes: 60 });
    expect(await rotation.isInGracePeriod(int.id, TENANT)).toBe(true);
  });

  it('isInGracePeriod returns false when no grace period', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    await rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v1' }, gracePeriodMinutes: 0 });
    expect(await rotation.isInGracePeriod(int.id, TENANT)).toBe(false);
  });

  it('isInGracePeriod returns false when never rotated', async () => {
    const int = await store.createIntegration(TENANT, makeInput());
    expect(await rotation.isInGracePeriod(int.id, TENANT)).toBe(false);
  });
});
