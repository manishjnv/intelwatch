import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineService } from '../src/services/timeline-service.js';
import { HuntingStore } from '../src/schemas/store.js';
import type { HuntSession, TimelineEvent } from '../src/schemas/hunting.js';

describe('Hunting Service — #8 Timeline Service', () => {
  let store: HuntingStore;
  let timeline: TimelineService;
  const tenantId = 'tenant-1';
  const huntId = 'hunt-1';

  function makeEvent(type: TimelineEvent['type'], hours = 0, userId = 'user-1'): TimelineEvent {
    return {
      id: `ev-${Math.random().toString(36).slice(2, 8)}`,
      type,
      description: `Test ${type} event`,
      userId,
      timestamp: new Date(Date.now() - hours * 3600000).toISOString(),
    };
  }

  beforeEach(() => {
    store = new HuntingStore();
    timeline = new TimelineService(store);

    const now = new Date().toISOString();
    store.setSession(tenantId, {
      id: huntId, tenantId, title: 'Test', hypothesis: 'Testing',
      status: 'active', severity: 'high', assignedTo: 'user-1', createdBy: 'user-1',
      entities: [], findings: '', tags: [], queryHistory: [], correlationLeads: [],
      createdAt: now, updatedAt: now,
      timeline: [
        makeEvent('status_changed', 5, 'user-1'),
        makeEvent('entity_added', 4, 'user-1'),
        makeEvent('query_executed', 3, 'user-2'),
        makeEvent('pivot_performed', 2, 'user-1'),
        makeEvent('finding_added', 1, 'user-2'),
        makeEvent('note_added', 0, 'user-1'),
      ],
    });
  });

  it('8.1. returns all timeline events sorted chronologically', () => {
    const result = timeline.getTimeline(tenantId, huntId);
    expect(result.events).toHaveLength(6);
    // Oldest first
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i]!.timestamp >= result.events[i - 1]!.timestamp).toBe(true);
    }
  });

  it('8.2. filters by event type', () => {
    const result = timeline.getTimeline(tenantId, huntId, { types: ['entity_added'] });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.type).toBe('entity_added');
  });

  it('8.3. filters by userId', () => {
    const result = timeline.getTimeline(tenantId, huntId, { userId: 'user-2' });
    expect(result.events).toHaveLength(2);
    expect(result.events.every((e) => e.userId === 'user-2')).toBe(true);
  });

  it('8.4. paginates results', () => {
    const page1 = timeline.getTimeline(tenantId, huntId, undefined, 1, 3);
    expect(page1.events).toHaveLength(3);
    expect(page1.total).toBe(6);
    expect(page1.hasMore).toBe(true);

    const page2 = timeline.getTimeline(tenantId, huntId, undefined, 2, 3);
    expect(page2.events).toHaveLength(3);
    expect(page2.hasMore).toBe(false);
  });

  it('8.5. returns window start/end timestamps', () => {
    const result = timeline.getTimeline(tenantId, huntId);
    expect(result.windowStart).toBeDefined();
    expect(result.windowEnd).toBeDefined();
    expect(result.windowStart <= result.windowEnd).toBe(true);
  });

  it('8.6. returns stats with event counts by type', () => {
    const stats = timeline.getStats(tenantId, huntId);
    expect(stats.totalEvents).toBe(6);
    expect(stats.byType.entity_added).toBe(1);
    expect(stats.byType.status_changed).toBe(1);
  });

  it('8.7. returns stats by user', () => {
    const stats = timeline.getStats(tenantId, huntId);
    expect(stats.byUser['user-1']).toBe(4);
    expect(stats.byUser['user-2']).toBe(2);
  });

  it('8.8. returns first and last event timestamps', () => {
    const stats = timeline.getStats(tenantId, huntId);
    expect(stats.firstEvent).toBeDefined();
    expect(stats.lastEvent).toBeDefined();
    expect(stats.firstEvent! <= stats.lastEvent!).toBe(true);
  });

  it('8.9. calculates average events per day', () => {
    const stats = timeline.getStats(tenantId, huntId);
    expect(stats.avgEventsPerDay).toBeGreaterThan(0);
  });

  it('8.10. returns activity heatmap', () => {
    const heatmap = timeline.getActivityHeatmap(tenantId, huntId);
    expect(Object.keys(heatmap)).toHaveLength(24);
    const total = Object.values(heatmap).reduce((sum, v) => sum + v, 0);
    expect(total).toBe(6);
  });

  it('8.11. returns recent activity', () => {
    const recent = timeline.getRecentActivity(tenantId, huntId, 3);
    expect(recent).toHaveLength(3);
    // Most recent first
    expect(recent[0]!.timestamp >= recent[1]!.timestamp).toBe(true);
  });

  it('8.12. throws 404 for non-existent hunt', () => {
    expect(() => timeline.getTimeline(tenantId, 'nope')).toThrow('not found');
  });

  it('8.13. handles empty timeline gracefully', () => {
    const now = new Date().toISOString();
    store.setSession(tenantId, {
      id: 'empty', tenantId, title: 'Empty', hypothesis: 'Test',
      status: 'draft', severity: 'low', assignedTo: 'user-1', createdBy: 'user-1',
      entities: [], timeline: [], findings: '', tags: [],
      queryHistory: [], correlationLeads: [], createdAt: now, updatedAt: now,
    });
    const stats = timeline.getStats(tenantId, 'empty');
    expect(stats.totalEvents).toBe(0);
    expect(stats.avgEventsPerDay).toBe(0);
  });
});
