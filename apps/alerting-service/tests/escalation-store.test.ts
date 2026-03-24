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

  it('creates a policy with generated ID', () => {
    const policy = store.create(makePolicy());
    expect(policy.id).toBeDefined();
    expect(policy.name).toBe('P1 Escalation');
    expect(policy.steps.length).toBe(2);
    expect(policy.enabled).toBe(true);
  });

  it('gets policy by ID', () => {
    const policy = store.create(makePolicy());
    expect(store.getById(policy.id)).toBeDefined();
  });

  it('returns undefined for non-existent ID', () => {
    expect(store.getById('nope')).toBeUndefined();
  });

  it('lists policies filtered by tenant', () => {
    store.create(makePolicy({ tenantId: 'tenant-1' }));
    store.create(makePolicy({ tenantId: 'tenant-2' }));
    const result = store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('paginates policies', () => {
    for (let i = 0; i < 5; i++) store.create(makePolicy({ name: `Policy ${i}` }));
    const page = store.list('tenant-1', { page: 1, limit: 2 });
    expect(page.data.length).toBe(2);
    expect(page.totalPages).toBe(3);
  });

  it('updates a policy', () => {
    const policy = store.create(makePolicy());
    const updated = store.update(policy.id, { name: 'Renamed', repeatAfterMinutes: 60 });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Renamed');
    expect(updated!.repeatAfterMinutes).toBe(60);
  });

  it('updates policy steps', () => {
    const policy = store.create(makePolicy());
    const updated = store.update(policy.id, {
      steps: [{ delayMinutes: 5, channelIds: ['00000000-0000-0000-0000-000000000003'] }],
    });
    expect(updated!.steps.length).toBe(1);
  });

  it('returns undefined when updating non-existent policy', () => {
    expect(store.update('nope', { name: 'X' })).toBeUndefined();
  });

  it('deletes a policy', () => {
    const policy = store.create(makePolicy());
    expect(store.delete(policy.id)).toBe(true);
    expect(store.getById(policy.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent policy', () => {
    expect(store.delete('nope')).toBe(false);
  });

  it('clears all policies', () => {
    store.create(makePolicy());
    store.clear();
    expect(store.list('tenant-1', { page: 1, limit: 20 }).total).toBe(0);
  });
});
