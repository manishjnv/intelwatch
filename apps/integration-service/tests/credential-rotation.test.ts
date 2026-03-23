import { describe, it, expect, beforeEach } from 'vitest';
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

  it('rotates credentials successfully', () => {
    const int = store.createIntegration(TENANT, makeInput());
    const record = rotation.rotate(int.id, TENANT, {
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

  it('updates the integration credentials on rotation', () => {
    const int = store.createIntegration(TENANT, makeInput());
    rotation.rotate(int.id, TENANT, {
      newCredentials: { apiKey: 'new-key-xyz' },
      gracePeriodMinutes: 0,
    });

    const updated = store.getIntegration(int.id, TENANT);
    expect(updated?.credentials.apiKey).toBe('new-key-xyz');
  });

  it('throws for nonexistent integration', () => {
    expect(() =>
      rotation.rotate('no-such', TENANT, {
        newCredentials: { apiKey: 'x' },
        gracePeriodMinutes: 0,
      }),
    ).toThrow('not found');
  });

  it('sets status to expired when gracePeriod is 0', () => {
    const int = store.createIntegration(TENANT, makeInput());
    const record = rotation.rotate(int.id, TENANT, {
      newCredentials: { apiKey: 'new' },
      gracePeriodMinutes: 0,
    });
    expect(record.status).toBe('expired');
  });

  it('masks old credential values', () => {
    const int = store.createIntegration(TENANT, makeInput());
    const record = rotation.rotate(int.id, TENANT, {
      newCredentials: { apiKey: 'new' },
      gracePeriodMinutes: 0,
    });
    // Original was 'old-secret-key-12345'
    expect(record.oldCredentialsMasked.apiKey).not.toBe('old-secret-key-12345');
    expect(record.oldCredentialsMasked.apiKey).toContain('*');
  });

  // ─── Rotation History ───────────────────────────────────────

  it('tracks rotation history', () => {
    const int = store.createIntegration(TENANT, makeInput());
    rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v1' }, gracePeriodMinutes: 0 });
    rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v2' }, gracePeriodMinutes: 0 });
    rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v3' }, gracePeriodMinutes: 0 });

    const history = rotation.getRotationHistory(int.id, TENANT, { page: 1, limit: 50 });
    expect(history.total).toBe(3);
    expect(history.data[0]!.rotatedAt >= history.data[1]!.rotatedAt).toBe(true); // newest first
  });

  it('paginates rotation history', () => {
    const int = store.createIntegration(TENANT, makeInput());
    for (let i = 0; i < 5; i++) {
      rotation.rotate(int.id, TENANT, { newCredentials: { k: `v${i}` }, gracePeriodMinutes: 0 });
    }
    const page = rotation.getRotationHistory(int.id, TENANT, { page: 1, limit: 2 });
    expect(page.data).toHaveLength(2);
    expect(page.total).toBe(5);
  });

  // ─── Latest Rotation ───────────────────────────────────────

  it('gets latest rotation', () => {
    const int = store.createIntegration(TENANT, makeInput());
    rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v1' }, gracePeriodMinutes: 60 });

    const latest = rotation.getLatestRotation(int.id, TENANT);
    expect(latest).toBeDefined();
    expect(latest!.gracePeriodMinutes).toBe(60);
    expect(latest!.status).toBe('grace_period');
  });

  it('returns null when no rotations exist', () => {
    const int = store.createIntegration(TENANT, makeInput());
    expect(rotation.getLatestRotation(int.id, TENANT)).toBeNull();
  });

  // ─── Grace Period ───────────────────────────────────────────

  it('isInGracePeriod returns true during grace period', () => {
    const int = store.createIntegration(TENANT, makeInput());
    rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v1' }, gracePeriodMinutes: 60 });
    expect(rotation.isInGracePeriod(int.id, TENANT)).toBe(true);
  });

  it('isInGracePeriod returns false when no grace period', () => {
    const int = store.createIntegration(TENANT, makeInput());
    rotation.rotate(int.id, TENANT, { newCredentials: { k: 'v1' }, gracePeriodMinutes: 0 });
    expect(rotation.isInGracePeriod(int.id, TENANT)).toBe(false);
  });

  it('isInGracePeriod returns false when never rotated', () => {
    const int = store.createIntegration(TENANT, makeInput());
    expect(rotation.isInGracePeriod(int.id, TENANT)).toBe(false);
  });
});
