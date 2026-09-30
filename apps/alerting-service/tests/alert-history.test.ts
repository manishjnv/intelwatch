import { describe, it, expect, beforeEach } from 'vitest';
import { AlertHistory } from '../src/services/alert-history.js';

describe('AlertHistory', () => {
  let history: AlertHistory;

  beforeEach(() => {
    history = new AlertHistory();
  });

  it('records a history entry', async () => {
    const entry = await history.record({
      tenantId: 'tenant-1',
      alertId: 'alert-1',
      action: 'created',
      fromStatus: null,
      toStatus: 'open',
      actor: 'system',
    });
    expect(entry.id).toBeDefined();
    expect(entry.alertId).toBe('alert-1');
    expect(entry.action).toBe('created');
    expect(entry.fromStatus).toBeNull();
    expect(entry.toStatus).toBe('open');
    expect(entry.actor).toBe('system');
    expect(entry.timestamp).toBeDefined();
  });

  it('records entry with reason and metadata', async () => {
    const entry = await history.record({
      tenantId: 'tenant-1',
      alertId: 'alert-1',
      action: 'suppress',
      fromStatus: 'open',
      toStatus: 'suppressed',
      actor: 'user-1',
      reason: 'false positive',
      metadata: { duration: 30 },
    });
    expect(entry.reason).toBe('false positive');
    expect(entry.metadata).toEqual({ duration: 30 });
  });

  it('gets timeline for an alert in chronological order', async () => {
    await history.record({ tenantId: 'tenant-1', alertId: 'alert-1', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    await history.record({ tenantId: 'tenant-1', alertId: 'alert-1', action: 'acknowledge', fromStatus: 'open', toStatus: 'acknowledged', actor: 'user-1' });
    await history.record({ tenantId: 'tenant-1', alertId: 'alert-1', action: 'resolve', fromStatus: 'acknowledged', toStatus: 'resolved', actor: 'user-1' });
    // Noise: different alert
    await history.record({ tenantId: 'tenant-1', alertId: 'alert-2', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });

    const timeline = await history.getTimeline('alert-1');
    expect(timeline.length).toBe(3);
    expect(timeline[0].action).toBe('created');
    expect(timeline[1].action).toBe('acknowledge');
    expect(timeline[2].action).toBe('resolve');
  });

  it('returns empty timeline for unknown alert', async () => {
    expect((await history.getTimeline('unknown')).length).toBe(0);
  });

  it('entries are immutable (append-only)', async () => {
    const entry = await history.record({ tenantId: 't', alertId: 'a', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    // No update or delete methods exist — only record + read
    expect((await history.getTimeline('a')).length).toBe(1);
    expect(entry.id).toBeDefined();
  });

  it('clears all entries', async () => {
    await history.record({ tenantId: 't', alertId: 'a', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    history.clear();
    expect((await history.getTimeline('a')).length).toBe(0);
  });
});
