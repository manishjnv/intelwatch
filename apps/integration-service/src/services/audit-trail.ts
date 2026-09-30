import { randomUUID } from 'crypto';
import type { AuditEntry, AuditAction } from '../schemas/integration.js';
import type { DocRepo } from './doc-repo.js';
import { MemoryDocRepo } from './doc-repo.js';

/**
 * P2 #12: Integration audit trail service.
 * Logs all CRUD operations, config changes, credential rotations,
 * and export runs with queryable API support. Persists as `audit_entry`
 * documents, parentId = integrationId when known (Step 3 S157).
 *
 * ponytail: query()/countByAction() list-then-filter in JS — fine at today's
 * config-change volumes; push filters into SQL if a tenant's audit trail grows
 * to many thousands of entries.
 */
export class AuditTrail {
  constructor(private readonly repo: DocRepo<AuditEntry> = new MemoryDocRepo<AuditEntry>()) {}

  /** Record an audit entry. */
  async record(params: {
    tenantId: string;
    integrationId: string | null;
    action: AuditAction;
    actor: string;
    details?: Record<string, unknown>;
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): Promise<AuditEntry> {
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
    return this.repo.save(entry, params.integrationId ?? null);
  }

  /** Query audit entries with filters and pagination. */
  async query(
    tenantId: string,
    opts: {
      integrationId?: string;
      action?: AuditAction;
      dateFrom?: string;
      dateTo?: string;
      page: number;
      limit: number;
    },
  ): Promise<{ data: AuditEntry[]; total: number }> {
    let items = opts.integrationId
      ? await this.repo.list(tenantId, opts.integrationId)
      : await this.repo.list(tenantId);

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
  async getEntry(id: string, tenantId: string): Promise<AuditEntry | undefined> {
    return (await this.repo.get(id, tenantId)) ?? undefined;
  }

  /** Get recent entries for an integration. */
  async getRecentForIntegration(
    integrationId: string,
    tenantId: string,
    limit: number = 10,
  ): Promise<AuditEntry[]> {
    const items = (await this.repo.list(tenantId, integrationId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items.slice(0, limit);
  }

  /** Count entries by action type for a tenant. */
  async countByAction(tenantId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const entry of await this.repo.list(tenantId)) {
      counts[entry.action] = (counts[entry.action] ?? 0) + 1;
    }
    return counts;
  }
}
