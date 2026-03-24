import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { Notifier } from '../src/services/notifier.js';
import type { Alert } from '../src/services/alert-store.js';

const mockAlert: Alert = {
  id: 'alert-1',
  ruleId: 'rule-1',
  ruleName: 'Test Rule',
  tenantId: 'tenant-1',
  severity: 'high',
  status: 'open',
  title: 'Test Alert',
  description: 'Something happened',
  source: { ip: '1.2.3.4' },
  acknowledgedBy: null,
  acknowledgedAt: null,
  resolvedBy: null,
  resolvedAt: null,
  suppressedUntil: null,
  suppressReason: null,
  escalationLevel: 0,
  escalatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Notifier HMAC signing', () => {
  const notifier = new Notifier();

  it('computeHmac produces valid HMAC-SHA256', () => {
    const payload = JSON.stringify({ test: true });
    const secret = 'my-webhook-secret';
    const signature = notifier.computeHmac(payload, secret);

    // Verify independently
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    expect(signature).toBe(expected);
  });

  it('computeHmac produces different signatures for different payloads', () => {
    const secret = 'secret';
    const sig1 = notifier.computeHmac('payload1', secret);
    const sig2 = notifier.computeHmac('payload2', secret);
    expect(sig1).not.toBe(sig2);
  });

  it('computeHmac produces different signatures for different secrets', () => {
    const payload = 'same payload';
    const sig1 = notifier.computeHmac(payload, 'secret1');
    const sig2 = notifier.computeHmac(payload, 'secret2');
    expect(sig1).not.toBe(sig2);
  });

  it('webhook with secret returns signature in result', async () => {
    const channel = {
      id: 'ch-1',
      name: 'Signed Webhook',
      tenantId: 'tenant-1',
      type: 'webhook' as const,
      config: {
        type: 'webhook' as const,
        webhook: { url: 'https://api.example.com/hook', method: 'POST' as const, secret: 'my-secret' },
      },
      enabled: true,
      lastTestedAt: null,
      lastTestSuccess: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const result = await notifier.notify(channel, mockAlert);
    expect(result.success).toBe(true);
    expect(result.signature).toBeDefined();
    expect(result.signature!.length).toBe(64); // sha256 hex
  });

  it('webhook without secret does not return signature', async () => {
    const channel = {
      id: 'ch-2',
      name: 'Unsigned Webhook',
      tenantId: 'tenant-1',
      type: 'webhook' as const,
      config: {
        type: 'webhook' as const,
        webhook: { url: 'https://api.example.com/hook', method: 'POST' as const },
      },
      enabled: true,
      lastTestedAt: null,
      lastTestSuccess: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const result = await notifier.notify(channel, mockAlert);
    expect(result.success).toBe(true);
    expect(result.signature).toBeUndefined();
  });

  it('formatPayload includes all alert fields', () => {
    const payload = notifier.formatPayload(mockAlert);
    expect(payload.alertId).toBe('alert-1');
    expect(payload.title).toBe('Test Alert');
    expect(payload.severity).toBe('high');
    expect(payload.status).toBe('open');
    expect(payload.description).toBe('Something happened');
    expect(payload.ruleName).toBe('Test Rule');
    expect(payload.tenantId).toBe('tenant-1');
    expect(payload.createdAt).toBeDefined();
    expect(payload.source).toEqual({ ip: '1.2.3.4' });
  });

  it('disabled channel returns failure without signature', async () => {
    const channel = {
      id: 'ch-3',
      name: 'Disabled',
      tenantId: 'tenant-1',
      type: 'webhook' as const,
      config: {
        type: 'webhook' as const,
        webhook: { url: 'https://api.example.com/hook', method: 'POST' as const, secret: 'secret' },
      },
      enabled: false,
      lastTestedAt: null,
      lastTestSuccess: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const result = await notifier.notify(channel, mockAlert);
    expect(result.success).toBe(false);
    expect(result.signature).toBeUndefined();
  });
});
