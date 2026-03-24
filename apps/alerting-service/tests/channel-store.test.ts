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

  it('creates a channel with generated ID', () => {
    const ch = store.create(makeChannel());
    expect(ch.id).toBeDefined();
    expect(ch.name).toBe('SOC Email');
    expect(ch.type).toBe('email');
    expect(ch.enabled).toBe(true);
    expect(ch.lastTestedAt).toBeNull();
  });

  it('gets channel by ID', () => {
    const ch = store.create(makeChannel());
    expect(store.getById(ch.id)).toBeDefined();
  });

  it('returns undefined for non-existent ID', () => {
    expect(store.getById('nope')).toBeUndefined();
  });

  it('lists channels filtered by tenant', () => {
    store.create(makeChannel({ tenantId: 'tenant-1' }));
    store.create(makeChannel({ tenantId: 'tenant-2' }));
    const result = store.list('tenant-1', { page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('lists channels filtered by type', () => {
    store.create(makeChannel());
    store.create(makeChannel({
      name: 'Slack',
      config: { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/test' } },
    }));
    const result = store.list('tenant-1', { type: 'email', page: 1, limit: 20 });
    expect(result.total).toBe(1);
  });

  it('paginates channels', () => {
    for (let i = 0; i < 5; i++) store.create(makeChannel({ name: `Ch ${i}` }));
    const page = store.list('tenant-1', { page: 1, limit: 2 });
    expect(page.data.length).toBe(2);
    expect(page.totalPages).toBe(3);
  });

  it('updates a channel', () => {
    const ch = store.create(makeChannel());
    const updated = store.update(ch.id, { name: 'Renamed' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Renamed');
  });

  it('updates channel config and type', () => {
    const ch = store.create(makeChannel());
    const updated = store.update(ch.id, {
      config: { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/new' } },
    });
    expect(updated!.type).toBe('slack');
  });

  it('returns undefined when updating non-existent channel', () => {
    expect(store.update('nope', { name: 'X' })).toBeUndefined();
  });

  it('deletes a channel', () => {
    const ch = store.create(makeChannel());
    expect(store.delete(ch.id)).toBe(true);
    expect(store.getById(ch.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent channel', () => {
    expect(store.delete('nope')).toBe(false);
  });

  it('records test result', () => {
    const ch = store.create(makeChannel());
    const result = store.recordTest(ch.id, true);
    expect(result).toBeDefined();
    expect(result!.lastTestedAt).toBeDefined();
    expect(result!.lastTestSuccess).toBe(true);
  });

  it('returns undefined when recording test on non-existent channel', () => {
    expect(store.recordTest('nope', true)).toBeUndefined();
  });

  it('gets multiple channels by IDs', () => {
    const ch1 = store.create(makeChannel({ name: 'Ch1' }));
    const ch2 = store.create(makeChannel({ name: 'Ch2' }));
    const channels = store.getByIds([ch1.id, ch2.id, 'nope']);
    expect(channels.length).toBe(2);
  });

  it('clears all channels', () => {
    store.create(makeChannel());
    store.clear();
    expect(store.list('tenant-1', { page: 1, limit: 20 }).total).toBe(0);
  });
});
