import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession, TimelineEvent } from '../schemas/hunting.js';

export interface TimelineFilter {
  types?: string[];
  userId?: string;
  from?: string;
  to?: string;
}

export interface TimelineStats {
  totalEvents: number;
  byType: Record<string, number>;
  byUser: Record<string, number>;
  firstEvent?: string;
  lastEvent?: string;
  avgEventsPerDay: number;
}

export interface TimelineWindow {
  events: TimelineEvent[];
  windowStart: string;
  windowEnd: string;
  total: number;
  hasMore: boolean;
}

/**
 * #8 Hunt Timeline Visualization — ordered event timeline with filtering.
 *
 * Provides structured access to a hunt's timeline with filtering by event type,
 * user, and time range. Computes timeline statistics and supports windowed
 * retrieval for efficient rendering.
 */
export class TimelineService {
  private readonly store: HuntingStore;

  constructor(store: HuntingStore) {
    this.store = store;
  }

  /** Get filtered timeline events for a hunt. */
  getTimeline(
    tenantId: string,
    huntId: string,
    filter?: TimelineFilter,
    page: number = 1,
    limit: number = 50,
  ): TimelineWindow {
    const session = this.requireHunt(tenantId, huntId);
    let events = [...session.timeline];

    // Apply filters
    if (filter) {
      if (filter.types && filter.types.length > 0) {
        const typeSet = new Set(filter.types);
        events = events.filter((e) => typeSet.has(e.type));
      }
      if (filter.userId) {
        events = events.filter((e) => e.userId === filter.userId);
      }
      if (filter.from) {
        events = events.filter((e) => e.timestamp >= filter.from!);
      }
      if (filter.to) {
        events = events.filter((e) => e.timestamp <= filter.to!);
      }
    }

    // Sort chronologically (oldest first for timeline display)
    events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const total = events.length;
    const start = (page - 1) * limit;
    const pageEvents = events.slice(start, start + limit);

    return {
      events: pageEvents,
      windowStart: pageEvents.length > 0 ? pageEvents[0]!.timestamp : '',
      windowEnd: pageEvents.length > 0 ? pageEvents[pageEvents.length - 1]!.timestamp : '',
      total,
      hasMore: start + limit < total,
    };
  }

  /** Get timeline statistics for a hunt. */
  getStats(tenantId: string, huntId: string): TimelineStats {
    const session = this.requireHunt(tenantId, huntId);
    const events = session.timeline;

    if (events.length === 0) {
      return {
        totalEvents: 0,
        byType: {},
        byUser: {},
        avgEventsPerDay: 0,
      };
    }

    const byType: Record<string, number> = {};
    const byUser: Record<string, number> = {};

    for (const e of events) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      byUser[e.userId] = (byUser[e.userId] ?? 0) + 1;
    }

    const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const firstEvent = sorted[0]!.timestamp;
    const lastEvent = sorted[sorted.length - 1]!.timestamp;

    const days = Math.max(1, (
      new Date(lastEvent).getTime() - new Date(firstEvent).getTime()
    ) / (1000 * 86400));

    return {
      totalEvents: events.length,
      byType,
      byUser,
      firstEvent,
      lastEvent,
      avgEventsPerDay: Math.round((events.length / days) * 10) / 10,
    };
  }

  /** Get activity heatmap (events per hour of day). */
  getActivityHeatmap(tenantId: string, huntId: string): Record<number, number> {
    const session = this.requireHunt(tenantId, huntId);
    const heatmap: Record<number, number> = {};
    for (let i = 0; i < 24; i++) heatmap[i] = 0;

    for (const e of session.timeline) {
      const hour = new Date(e.timestamp).getUTCHours();
      heatmap[hour] = (heatmap[hour] ?? 0) + 1;
    }
    return heatmap;
  }

  /** Get recent activity summary (last N events). */
  getRecentActivity(tenantId: string, huntId: string, count: number = 10): TimelineEvent[] {
    const session = this.requireHunt(tenantId, huntId);
    return [...session.timeline]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, count);
  }

  private requireHunt(tenantId: string, huntId: string): HuntSession {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }
}
