/**
 * Alerting repository unit tests — mocked PrismaClient (Step 3 S154).
 * Covers UUID short-circuiting, Date<->ISO mapping, tenant validation, DB_UNAVAILABLE
 * mapping, and that channel configs never reach Prisma unencrypted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import { createPrismaRepos, isUuid } from '../src/repository.js';
import { ChannelCrypto } from '../src/services/channel-crypto.js';
import type { AlertRule } from '../src/services/rule-store.js';
import type { NotificationChannel } from '../src/services/channel-store.js';

function createMockPrisma() {
  return {
    alertRule: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    alertChannel: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    alertEscalationPolicy: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    alertMaintenanceWindow: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  };
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

const TENANT = randomUUID();
const KEY = randomBytes(32).toString('base64');

function makeRule(overrides?: Partial<AlertRule>): AlertRule {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: 'Test Rule',
    description: '',
    tenantId: TENANT,
    severity: 'high',
    condition: { type: 'threshold', threshold: { metric: 'x', operator: 'gt', value: 1, windowMinutes: 60 } },
    enabled: true,
    channelIds: [],
    escalationPolicyId: null,
    cooldownMinutes: 15,
    tags: [],
    lastTriggeredAt: null,
    triggerCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('isUuid', () => {
  it('accepts a valid uuid', () => {
    expect(isUuid(randomUUID())).toBe(true);
  });
  it('rejects legacy ids like "default"', () => {
    expect(isUuid('default')).toBe(false);
  });
});

describe('rule repo', () => {
  let db: MockPrisma;
  let repos: ReturnType<typeof createPrismaRepos>;

  beforeEach(() => {
    db = createMockPrisma();
    repos = createPrismaRepos(db as unknown as PrismaClient, new ChannelCrypto(KEY));
  });

  it('list passes where: { tenantId }', async () => {
    db.alertRule.findMany.mockResolvedValue([]);
    await repos.rules.list(TENANT);
    expect(db.alertRule.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT }, orderBy: { createdAt: 'desc' } });
  });

  it('non-UUID tenantId short-circuits list to [] without calling Prisma', async () => {
    const result = await repos.rules.list('default');
    expect(result).toEqual([]);
    expect(db.alertRule.findMany).not.toHaveBeenCalled();
  });

  it('non-UUID id short-circuits get to null without calling Prisma', async () => {
    const result = await repos.rules.get('not-a-uuid');
    expect(result).toBeNull();
    expect(db.alertRule.findUnique).not.toHaveBeenCalled();
  });

  it('maps Date fields to ISO strings on read', async () => {
    const dbRow = { ...makeRule(), lastTriggeredAt: new Date('2026-01-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-02T00:00:00.000Z'), triggerCount: 2 };
    db.alertRule.findUnique.mockResolvedValue(dbRow);
    const rule = await repos.rules.get(dbRow.id);
    expect(rule!.lastTriggeredAt).toBe('2026-01-01T00:00:00.000Z');
    expect(rule!.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('maps ISO strings to Date on save (upsert data)', async () => {
    const rule = makeRule({ lastTriggeredAt: '2026-02-01T00:00:00.000Z' });
    db.alertRule.upsert.mockResolvedValue({ ...rule, lastTriggeredAt: new Date(rule.lastTriggeredAt!), createdAt: new Date(rule.createdAt), updatedAt: new Date(rule.updatedAt) });
    await repos.rules.save(rule);
    const call = db.alertRule.upsert.mock.calls[0]![0];
    expect(call.create.lastTriggeredAt).toBeInstanceOf(Date);
    expect(call.create.lastTriggeredAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('save with a non-UUID tenantId throws 400 VALIDATION_ERROR without calling Prisma', async () => {
    const rule = makeRule({ tenantId: 'default' });
    await expect(repos.rules.save(rule)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(db.alertRule.upsert).not.toHaveBeenCalled();
  });

  it('Prisma rejecting maps to AppError 503 DB_UNAVAILABLE', async () => {
    db.alertRule.findMany.mockRejectedValue(new Error('connection refused'));
    await expect(repos.rules.list(TENANT)).rejects.toBeInstanceOf(AppError);
    await expect(repos.rules.list(TENANT)).rejects.toMatchObject({ statusCode: 503, code: 'DB_UNAVAILABLE' });
  });

  it('delete of a missing row returns false', async () => {
    db.alertRule.deleteMany.mockResolvedValue({ count: 0 });
    expect(await repos.rules.delete(randomUUID())).toBe(false);
  });

  it('non-UUID id short-circuits delete to false without calling Prisma', async () => {
    expect(await repos.rules.delete('nope')).toBe(false);
    expect(db.alertRule.deleteMany).not.toHaveBeenCalled();
  });
});

describe('channel repo (encryption)', () => {
  let db: MockPrisma;
  let repos: ReturnType<typeof createPrismaRepos>;

  beforeEach(() => {
    db = createMockPrisma();
    repos = createPrismaRepos(db as unknown as PrismaClient, new ChannelCrypto(KEY));
  });

  function makeChannel(overrides?: Partial<NotificationChannel>): NotificationChannel {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      name: 'Slack',
      tenantId: TENANT,
      type: 'slack',
      config: { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/services/super-secret' } },
      enabled: true,
      lastTestedAt: null,
      lastTestSuccess: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('save: the data handed to upsert has configEnc and no plaintext webhook URL anywhere', async () => {
    const channel = makeChannel();
    const crypto = new ChannelCrypto(KEY);
    db.alertChannel.upsert.mockResolvedValue({
      ...channel,
      configEnc: crypto.encrypt(channel.config),
      createdAt: new Date(channel.createdAt),
      updatedAt: new Date(channel.updatedAt),
      lastTestedAt: null,
    });
    await repos.channels.save(channel);
    const call = db.alertChannel.upsert.mock.calls[0]![0];
    const serialized = JSON.stringify(call.create);
    expect(call.create.configEnc).toBeDefined();
    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('hooks.slack.com/services');
  });

  it('get decrypts configEnc back to the original config', async () => {
    const channel = makeChannel();
    const crypto = new ChannelCrypto(KEY);
    db.alertChannel.findUnique.mockResolvedValue({
      ...channel,
      configEnc: crypto.encrypt(channel.config),
      createdAt: new Date(channel.createdAt),
      updatedAt: new Date(channel.updatedAt),
    });
    const result = await repos.channels.get(channel.id);
    expect(result!.config).toEqual(channel.config);
  });
});
