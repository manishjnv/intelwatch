import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { ChannelStore } from '../src/services/channel-store.js';
import { Notifier } from '../src/services/notifier.js';
import type { FastifyInstance } from 'fastify';

const validEmailChannel = {
  name: 'SOC Email',
  config: { type: 'email', email: { recipients: ['soc@example.com'] } },
};

const validSlackChannel = {
  name: 'SOC Slack',
  config: { type: 'slack', slack: { webhookUrl: 'https://hooks.slack.com/test' } },
};

const validWebhookChannel = {
  name: 'SIEM Webhook',
  config: { type: 'webhook', webhook: { url: 'https://api.siem.com/alerts' } },
};

describe('Channel routes', () => {
  let app: FastifyInstance;
  let channelStore: ChannelStore;
  let notifier: Notifier;

  beforeAll(async () => {
    const config = loadConfig({});
    channelStore = new ChannelStore();
    notifier = new Notifier();
    app = await buildApp({ config, channelDeps: { channelStore, notifier } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    channelStore.clear();
  });

  // ─── POST /api/v1/alerts/channels ──────────────────────────────────

  it('POST creates an email channel — 201', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/alerts/channels', payload: validEmailChannel });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.type).toBe('email');
  });

  it('POST creates a slack channel — 201', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/alerts/channels', payload: validSlackChannel });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.type).toBe('slack');
  });

  it('POST creates a webhook channel — 201', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/alerts/channels', payload: validWebhookChannel });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.type).toBe('webhook');
  });

  it('POST rejects invalid email — 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/alerts/channels',
      payload: { name: 'Bad', config: { type: 'email', email: { recipients: ['not-email'] } } },
    });
    expect(res.statusCode).toBe(400);
  });

  // ─── GET /api/v1/alerts/channels ───────────────────────────────────

  it('GET lists channels', async () => {
    channelStore.create({ ...validEmailChannel, tenantId: 'default', enabled: true } as any);
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/channels' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(1);
  });

  it('GET filters by type', async () => {
    channelStore.create({ ...validEmailChannel, tenantId: 'default', enabled: true } as any);
    channelStore.create({ ...validSlackChannel, tenantId: 'default', enabled: true } as any);
    const res = await app.inject({ method: 'GET', url: '/api/v1/alerts/channels?type=slack' });
    expect(res.json().data.length).toBe(1);
    expect(res.json().data[0].type).toBe('slack');
  });

  // ─── PUT /api/v1/alerts/channels/:id ───────────────────────────────

  it('PUT updates a channel', async () => {
    const ch = channelStore.create({ ...validEmailChannel, tenantId: 'default', enabled: true } as any);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/alerts/channels/${ch.id}`,
      payload: { name: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Renamed');
  });

  it('PUT returns 404 for non-existent channel', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/alerts/channels/non-existent',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── DELETE /api/v1/alerts/channels/:id ────────────────────────────

  it('DELETE removes a channel — 204', async () => {
    const ch = channelStore.create({ ...validEmailChannel, tenantId: 'default', enabled: true } as any);
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/alerts/channels/${ch.id}` });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE returns 404 for non-existent channel', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/alerts/channels/non-existent' });
    expect(res.statusCode).toBe(404);
  });

  // ─── POST /api/v1/alerts/channels/:id/test ─────────────────────────

  it('POST sends test notification', async () => {
    const ch = channelStore.create({ ...validEmailChannel, tenantId: 'default', enabled: true } as any);
    const res = await app.inject({ method: 'POST', url: `/api/v1/alerts/channels/${ch.id}/test` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.success).toBe(true);

    // Verify test was recorded
    const updated = channelStore.getById(ch.id)!;
    expect(updated.lastTestedAt).toBeDefined();
    expect(updated.lastTestSuccess).toBe(true);
  });

  it('POST test returns 404 for non-existent channel', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/alerts/channels/non-existent/test' });
    expect(res.statusCode).toBe(404);
  });
});
