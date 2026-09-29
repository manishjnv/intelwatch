import { describe, it, expect, beforeEach } from 'vitest';
import { EscalationStore } from '../src/services/escalation-store.js';
import type { CreateEscalationDto } from '../src/schemas/alert.js';

function makePolicy(overrides?: Partial<CreateEscalationDto>): CreateEscalationDto {
  return {
    name: 'P1 Escalation',
    tenantId: 'tenant-1',
    steps: [
      { delayMinutes: 15, channelIds: ['00000000-0000-0000-0000-000000000001'] },
      { delayMinutes: 30, channelIds: ['00000000-0000-0000-0000-000000000002'] },
    ],
    repeatAfterMinutes: 0,
    enabled: true,
    ...overrides,
  };
}

describe('EscalationStore', () => {
  let store: EscalationStore;

  beforeEach(() => {
    store = new EscalationStore();
  });

  it('creates a policy with generated ID', async () => {
    const policy = await store.create(makePolicy());
    expect(policy.id).toBeDefined();
    expect(policy.name).toBe('P1 Escalation');
    expect(policy.steps.length).toBe(2);
    expect(policy.enabled).toBe(true);
  });

  it('gets policy by ID', async () => {
    const policy = await store.create(makePolicy());
    expect(await store.getById(policy.id)).toBeDefined();
  });

  it('returns undefined for non-existent ID', async () => {
    expect(await store.getById('nope')).toBeUndefined();
  });

  it('lists policies filtered by tenant', async () => {
    await store.create(makePolicy({ tenantId: 'tenant-1' }));
    await store.create(makePolicy({ tenantId: 'tenant-2' }));
    const result = await store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('paginates policies', async () => {
    for (let i = 0; i < 5; i++) await store.create(makePolicy({ name: `Policy ${i}` }));
    const page = await store.list('tenant-1', { page: 1, limit: 2 });
    expect(page.data.length).toBe(2);
    expect(page.totalPages).toBe(3);
  });

  it('updates a policy', async () => {
    const policy = await store.create(makePolicy());
    const updated = await store.update(policy.id, { name: 'Renamed', repeatAfterMinutes: 60 });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Renamed');
    expect(updated!.repeatAfterMinutes).toBe(60);
  });

  it('updates policy steps', async () => {
    const policy = await store.create(makePolicy());
    const updated = await store.update(policy.id, {
      steps: [{ delayMinutes: 5, channelIds: ['00000000-0000-0000-0000-000000000003'] }],
    });
    expect(updated!.steps.length).toBe(1);
  });

  it('returns undefined when updating non-existent policy', async () => {
    expect(await store.update('nope', { name: 'X' })).toBeUndefined();
  });

  it('deletes a policy', async () => {
    const policy = await store.create(makePolicy());
    expect(await store.delete(policy.id)).toBe(true);
    expect(await store.getById(policy.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent policy', async () => {
    expect(await store.delete('nope')).toBe(false);
  });

  it('clears all policies', async () => {
    await store.create(makePolicy());
    store.clear();
    expect((await store.list('tenant-1', { page: 1, limit: 20 })).total).toBe(0);
  });

  // ─── Tenant scoping (Step 3 S154) ───────────────────────────────────

  it('getById scoped to a different tenant returns undefined', async () => {
    const policy = await store.create(makePolicy({ tenantId: 'tenant-1' }));
    expect(await store.getById(policy.id, 'tenant-2')).toBeUndefined();
  });

  it('delete scoped to a different tenant returns false', async () => {
    const policy = await store.create(makePolicy({ tenantId: 'tenant-1' }));
    expect(await store.delete(policy.id, 'tenant-2')).toBe(false);
  });
});
