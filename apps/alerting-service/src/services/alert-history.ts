import { randomUUID } from 'node:crypto';

export interface HistoryEntry {
  id: string;
  alertId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  actor: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;
}

/**
 * Immutable audit trail for alert state changes.
 * Every lifecycle transition is recorded with who, when, from→to, and why.
 * Entries are append-only — no update or delete.
 */
export class AlertHistory {
  private entries: HistoryEntry[] = [];

  /** Record a state change. */
  record(input: {
    alertId: string;
    action: string;
    fromStatus: string | null;
    toStatus: string;
    actor: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): HistoryEntry {
    const entry: HistoryEntry = {
      id: randomUUID(),
      alertId: input.alertId,
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actor: input.actor,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  /** Get full timeline for an alert (oldest first). */
  getTimeline(alertId: string): HistoryEntry[] {
    return this.entries
      .filter((e) => e.alertId === alertId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /** Get recent history entries across all alerts for a tenant (for audit dashboard). */
  getRecent(limit: number = 50): HistoryEntry[] {
    return this.entries
      .slice(-limit)
      .reverse();
  }

  /** Count total history entries. */
  count(): number {
    return this.entries.length;
  }

  /** Clear all entries (for testing). */
  clear(): void {
    this.entries = [];
  }
}
