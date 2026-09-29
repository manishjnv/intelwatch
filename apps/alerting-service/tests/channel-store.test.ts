import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelStore } from '../src/services/channel-store.js';
import type { CreateChannelDto } from '../src/schemas/alert.js';

function makeChannel(overrides?: Partial<CreateChannelDto>): CreateChannelDto {
  return {
    name: 'SOC Email',
    tenantId: 'tenant-1',
    config: { type: 'email', email: { recipients: ['soc@example.com'] } },
    enabled: true,
    ...overrides,
  };
}

describe('ChannelStore', () => {
  let store: ChannelStore;

  beforeEach(() => {
    store = new ChannelStore();
  });

  it('creates a channel with generated ID', async () => {
    const ch = await store.create(makeChannel());
    expect(ch.id).toBeDefined();
    expect(ch.name).toBe('SOC Email');
    expect(ch.type).toBe('email');
    expect(ch.enabled).toBe(true);
    expect(ch.lastTestedAt).toBeNull();
  });

  it('gets channel by ID', async () => {
    const ch = await store.create(makeChannel());
    expect(await store.getById(ch.id)).toBeDefined();
  });

  it('returns undefined for non-existent ID', async () => {
    expect(await store.getById('nope')).toBeUndefined();
  });

  it('lists channels filtered by tenant', async () => {
    await store.create(makeChannel({ tenantId: 'tenant-1' }));
    await store.create(makeChannel({ tenantId: 'tenant-2' }));
    const result = await store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists channels filtered by type', async () => {
    await store.create(makeChannel());
    await store.create(makeChannel({
      name: 'Slack',
      config: { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/test' } },
    }));
    const result = await store.list('tenant-1', { type: 'email', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('paginates channels', async () => {
    for (let i = 0; i < 5; i++) await store.create(makeChannel({ name: `Ch ${i}` }));
    const page = await store.list('tenant-1', { page: 1, limit: 2 });
    expect(page.data.length).toBe(2);
    expect(page.totalPages).toBe(3);
  });

  it('updates a channel', async () => {
    const ch = await store.create(makeChannel());
    const updated = await store.update(ch.id, { name: 'Renamed' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Renamed');
  });

  it('updates channel config and type', async () => {
    const ch = await store.create(makeChannel());
    const updated = await store.update(ch.id, {
      config: { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/new' } },
    });
    expect(updated!.type).toBe('slack');
  });

  it('returns undefined when updating non-existent channel', async () => {
    expect(await store.update('nope', { name: 'X' })).toBeUndefined();
  });

  it('deletes a channel', async () => {
    const ch = await store.create(makeChannel());
    expect(await store.delete(ch.id)).toBe(true);
    expect(await store.getById(ch.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent channel', async () => {
    expect(await store.delete('nope')).toBe(false);
  });

  it('records test result', async () => {
    const ch = await store.create(makeChannel());
    const result = await store.recordTest(ch.id, true);
    expect(result).toBeDefined();
    expect(result!.lastTestedAt).toBeDefined();
    expect(result!.lastTestSuccess).toBe(true);
  });

  it('returns undefined when recording test on non-existent channel', async () => {
    expect(await store.recordTest('nope', true)).toBeUndefined();
  });

  it('gets multiple channels by IDs', async () => {
    const ch1 = await store.create(makeChannel({ name: 'Ch1' }));
    const ch2 = await store.create(makeChannel({ name: 'Ch2' }));
    const channels = await store.getByIds([ch1.id, ch2.id, 'nope']);
    expect(channels.length).toBe(2);
  });

  it('gets multiple channels by IDs scoped to a tenant', async () => {
    const ch1 = await store.create(makeChannel({ name: 'Ch1', tenantId: 'tenant-1' }));
    const ch2 = await store.create(makeChannel({ name: 'Ch2', tenantId: 'tenant-2' }));
    const channels = await store.getByIds([ch1.id, ch2.id], 'tenant-1');
    expect(channels.length).toBe(1);
    expect(channels[0].id).toBe(ch1.id);
  });

  it('clears all channels', async () => {
    await store.create(makeChannel());
    store.clear();
    expect((await store.list('tenant-1', { page: 1, limit: 20 })).total).toBe(0);
  });

  // ─── Tenant scoping (Step 3 S154) ───────────────────────────────────

  it('getById scoped to a different tenant returns undefined', async () => {
    const ch = await store.create(makeChannel({ tenantId: 'tenant-1' }));
    expect(await store.getById(ch.id, 'tenant-2')).toBeUndefined();
  });

  it('update scoped to a different tenant returns undefined', async () => {
    const ch = await store.create(makeChannel({ tenantId: 'tenant-1' }));
    expect(await store.update(ch.id, { name: 'X' }, 'tenant-2')).toBeUndefined();
  });

  it('delete scoped to a different tenant returns false', async () => {
    const ch = await store.create(makeChannel({ tenantId: 'tenant-1' }));
    expect(await store.delete(ch.id, 'tenant-2')).toBe(false);
  });
});
