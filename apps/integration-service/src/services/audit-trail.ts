import { randomUUID } from 'crypto';
import type { AuditEntry, AuditAction } from '../schemas/integration.js';

/**
 * P2 #12: Integration audit trail service.
 * Logs all CRUD operations, config changes, credential rotations,
 * and export runs with queryable API support.
 */
export class AuditTrail {
  private entries = new Map<string, AuditEntry>();

  /** Record an audit entry. */
  record(params: {
    tenantId: string;
    integrationId: string | null;
    action: AuditAction;
    actor: string;
    details?: Record<string, unknown>;
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): AuditEntry {
    const entry: AuditEntry = {
      id: randomUUID(),
      tenantId: params.tenantId,
      integrationId: params.integrationId,
      action: params.action,
      actor: params.actor,
      details: params.details ?? {},
      previousValue: params.previousValue ?? null,
      newValue: params.newValue ?? null,
      ipAddress: params.ipAddress ?? null,
      createdAt: new Date().toISOString(),
    };
    this.entries.set(entry.id, entry);
    return entry;
  }

  /** Query audit entries with filters and pagination. */
  query(
    tenantId: string,
    opts: {
      integrationId?: string;
      action?: AuditAction;
      dateFrom?: string;
      dateTo?: string;
      page: number;
      limit: number;
    },
  ): { data: AuditEntry[]; total: number } {
    let items = Array.from(this.entries.values()).filter(
      (e) => e.tenantId === tenantId,
    );

    if (opts.integrationId) {
      items = items.filter((e) => e.integrationId === opts.integrationId);
    }
    if (opts.action) {
      items = items.filter((e) => e.action === opts.action);
    }
    if (opts.dateFrom) {
      items = items.filter((e) => e.createdAt >= opts.dateFrom!);
    }
    if (opts.dateTo) {
      items = items.filter((e) => e.createdAt <= opts.dateTo!);
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Get a single audit entry by ID. */
  getEntry(id: string, tenantId: string): AuditEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry || entry.tenantId !== tenantId) return undefined;
    return entry;
  }

  /** Get recent entries for an integration. */
  getRecentForIntegration(
    integrationId: string,
    tenantId: string,
    limit: number = 10,
  ): AuditEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => e.tenantId === tenantId && e.integrationId === integrationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  /** Count entries by action type for a tenant. */
  countByAction(tenantId: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const entry of this.entries.values()) {
      if (entry.tenantId !== tenantId) continue;
      counts[entry.action] = (counts[entry.action] ?? 0) + 1;
    }
    return counts;
  }
}
