import { randomUUID } from 'crypto';
import type { AuditEntry } from '../schemas/user-management.js';

/** Audit log input (without auto-generated fields). */
export interface AuditInput {
  tenantId: string;
  userId: string | null;
  action: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/** Query options for audit log. */
export interface AuditQueryOptions {
  page: number;
  limit: number;
  action?: string;
  userId?: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  from?: string;
  to?: string;
}

/**
 * In-memory SOC2-compliant audit logger.
 * Stores immutable audit entries for all authentication and authorization actions.
 * Entries cannot be modified or deleted (append-only).
 */
export class AuditLogger {
  private entries: AuditEntry[] = [];

  /** Append an audit entry. Returns the entry ID. */
  log(input: AuditInput): string {
    const entry: AuditEntry = {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      riskLevel: input.riskLevel,
      details: input.details,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry.id;
  }

  /** Query audit log with filtering and pagination. */
  query(tenantId: string, opts: AuditQueryOptions): { data: AuditEntry[]; total: number } {
    let filtered = this.entries.filter((e) => e.tenantId === tenantId);

    if (opts.action) {
      filtered = filtered.filter((e) => e.action === opts.action);
    }
    if (opts.userId) {
      filtered = filtered.filter((e) => e.userId === opts.userId);
    }
    if (opts.riskLevel) {
      filtered = filtered.filter((e) => e.riskLevel === opts.riskLevel);
    }
    if (opts.from) {
      filtered = filtered.filter((e) => e.timestamp >= opts.from!);
    }
    if (opts.to) {
      filtered = filtered.filter((e) => e.timestamp <= opts.to!);
    }

    // Most recent first
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const total = filtered.length;
    const start = (opts.page - 1) * opts.limit;
    const data = filtered.slice(start, start + opts.limit);

    return { data, total };
  }

  /** Get total entry count for a tenant. */
  count(tenantId: string): number {
    return this.entries.filter((e) => e.tenantId === tenantId).length;
  }

  /** Get entries by action type (for analytics). */
  countByAction(tenantId: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const e of this.entries) {
      if (e.tenantId !== tenantId) continue;
      counts[e.action] = (counts[e.action] ?? 0) + 1;
    }
    return counts;
  }

  /** Get entries by risk level (for dashboard). */
  countByRiskLevel(tenantId: string): Record<string, number> {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const e of this.entries) {
      if (e.tenantId !== tenantId) continue;
      counts[e.riskLevel] = (counts[e.riskLevel] ?? 0) + 1;
    }
    return counts;
  }
}
