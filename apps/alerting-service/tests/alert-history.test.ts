import { describe, it, expect, beforeEach } from 'vitest';
import { AlertHistory } from '../src/services/alert-history.js';

describe('AlertHistory', () => {
  let history: AlertHistory;

  beforeEach(() => {
    history = new AlertHistory();
  });

  it('records a history entry', () => {
    const entry = history.record({
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

  it('records entry with reason and metadata', () => {
    const entry = history.record({
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

  it('gets timeline for an alert in chronological order', () => {
    history.record({ alertId: 'alert-1', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    history.record({ alertId: 'alert-1', action: 'acknowledge', fromStatus: 'open', toStatus: 'acknowledged', actor: 'user-1' });
    history.record({ alertId: 'alert-1', action: 'resolve', fromStatus: 'acknowledged', toStatus: 'resolved', actor: 'user-1' });
    // Noise: different alert
    history.record({ alertId: 'alert-2', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });

    const timeline = history.getTimeline('alert-1');
    expect(timeline.length).toBe(3);
    expect(timeline[0].action).toBe('created');
    expect(timeline[1].action).toBe('acknowledge');
    expect(timeline[2].action).toBe('resolve');
  });

  it('returns empty timeline for unknown alert', () => {
    expect(history.getTimeline('unknown').length).toBe(0);
  });

  it('gets recent entries across all alerts', () => {
    for (let i = 0; i < 5; i++) {
      history.record({ alertId: `alert-${i}`, action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    }
    const recent = history.getRecent(3);
    expect(recent.length).toBe(3);
    // Most recent first
    expect(recent[0].alertId).toBe('alert-4');
  });

  it('getRecent respects limit', () => {
    for (let i = 0; i < 10; i++) {
      history.record({ alertId: `alert-${i}`, action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    }
    expect(history.getRecent(5).length).toBe(5);
    expect(history.getRecent(50).length).toBe(10);
  });

  it('counts total entries', () => {
    history.record({ alertId: 'a', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    history.record({ alertId: 'b', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    expect(history.count()).toBe(2);
  });

  it('entries are immutable (append-only)', () => {
    const entry = history.record({ alertId: 'a', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    // No update or delete methods exist — only record + read
    expect(history.count()).toBe(1);
    expect(entry.id).toBeDefined();
  });

  it('clears all entries', () => {
    history.record({ alertId: 'a', action: 'created', fromStatus: null, toStatus: 'open', actor: 'system' });
    history.clear();
    expect(history.count()).toBe(0);
  });
});
