import type { PropagationAuditEntry, AuditTrailResponse } from '../schemas/search.js';

/**
 * Propagation Audit Trail — P2 #15.
 *
 * In-memory circular buffer storing the last N propagation events per tenant.
 * Each entry records: trigger, scores before/after, decay path, weights used.
 * Designed for single-instance; migrate to PostgreSQL for horizontal scaling.
 */
export class AuditTrailService {
  private readonly maxEntries: number;
  private readonly entries = new Map<string, PropagationAuditEntry[]>();

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  /** Records a propagation audit entry. Called via callback from propagation engine. */
  record(entry: PropagationAuditEntry): void {
    const tenantEntries = this.entries.get(entry.tenantId) ?? [];

    tenantEntries.push(entry);

    // Circular buffer: trim oldest when exceeding max
    if (tenantEntries.length > this.maxEntries) {
      tenantEntries.splice(0, tenantEntries.length - this.maxEntries);
    }

    this.entries.set(entry.tenantId, tenantEntries);
  }

  /** Lists propagation audit entries for a tenant. */
  list(tenantId: string, limit: number, filterNodeId?: string): AuditTrailResponse {
    const tenantEntries = this.entries.get(tenantId) ?? [];

    let filtered = tenantEntries;
    if (filterNodeId) {
      filtered = tenantEntries.filter(
        (e) => e.triggerNodeId === filterNodeId || e.updates.some((u) => u.nodeId === filterNodeId),
      );
    }

    // Return most recent first
    const sorted = [...filtered].reverse();
    const limited = sorted.slice(0, limit);

    return { entries: limited, total: filtered.length };
  }

  /** Gets a specific audit entry by ID. */
  getById(tenantId: string, entryId: string): PropagationAuditEntry | null {
    const tenantEntries = this.entries.get(tenantId) ?? [];
    return tenantEntries.find((e) => e.id === entryId) ?? null;
  }

  /** Returns total count of entries for a tenant. */
  count(tenantId: string): number {
    return (this.entries.get(tenantId) ?? []).length;
  }

  /** Clears all entries for a tenant (used in testing). */
  clear(tenantId?: string): void {
    if (tenantId) {
      this.entries.delete(tenantId);
    } else {
      this.entries.clear();
    }
  }
}
