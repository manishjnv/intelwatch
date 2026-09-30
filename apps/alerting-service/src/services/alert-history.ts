import { randomUUID } from 'node:crypto';
import { MemoryAlertHistoryRepo, type AlertHistoryRepo } from '../repository.js';

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
 * Immutable audit trail for alert state changes (Step 3 S155).
 * Every lifecycle transition is recorded with who, when, from→to, and why.
 * Entries are append-only — no update or delete. Backed by Postgres via `repo`
 * in production; an in-memory MemoryAlertHistoryRepo when no repo is injected (dev/test only).
 */
export class AlertHistory {
  constructor(private readonly repo: AlertHistoryRepo = new MemoryAlertHistoryRepo()) {}

  /** Record a state change. */
  async record(input: {
    tenantId: string;
    alertId: string;
    action: string;
    fromStatus: string | null;
    toStatus: string;
    actor: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<HistoryEntry> {
    const entry: HistoryEntry & { tenantId: string } = {
      id: randomUUID(),
      tenantId: input.tenantId,
      alertId: input.alertId,
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actor: input.actor,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
      timestamp: new Date().toISOString(),
    };
    return this.repo.append(entry);
  }

  /** Get full timeline for an alert (oldest first). */
  async getTimeline(alertId: string): Promise<HistoryEntry[]> {
    return this.repo.listByAlert(alertId);
  }

  /** Clear all entries (test-only; only affects the in-memory backend). */
  clear(): void {
    if (this.repo instanceof MemoryAlertHistoryRepo) this.repo.clear();
  }
}
