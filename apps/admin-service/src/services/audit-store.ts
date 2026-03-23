import { randomUUID } from 'crypto';

export interface AuditEvent {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
  timestamp: string;
}

export interface AddEventInput {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress: string;
}

export interface ListAuditFilter {
  tenantId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface ListAuditResult {
  items: AuditEvent[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditStats {
  totalEvents: number;
  byAction: Record<string, number>;
  byResource: Record<string, number>;
  byTenant: Record<string, number>;
}

/** In-memory cross-service audit log (DECISION-013). Max 10,000 events kept. */
export class AuditStore {
  private static readonly MAX_EVENTS = 10_000;
  private _events: AuditEvent[] = [];

  /** Add a new audit event. Returns the created event. */
  addEvent(input: AddEventInput): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      ...input,
      timestamp: new Date().toISOString(),
    };
    this._events.unshift(event); // prepend for reverse-chron order
    if (this._events.length > AuditStore.MAX_EVENTS) {
      this._events = this._events.slice(0, AuditStore.MAX_EVENTS);
    }
    return event;
  }

  /** List audit events with filtering and pagination. */
  list(filter: ListAuditFilter): ListAuditResult {
    const page = filter.page ?? 1;
    const limit = Math.min(filter.limit ?? 50, 500);

    let items = this._events;
    if (filter.tenantId) items = items.filter((e) => e.tenantId === filter.tenantId);
    if (filter.userId) items = items.filter((e) => e.userId === filter.userId);
    if (filter.action) items = items.filter((e) => e.action === filter.action);
    if (filter.resource) items = items.filter((e) => e.resource === filter.resource);
    if (filter.fromDate) items = items.filter((e) => e.timestamp >= filter.fromDate!);
    if (filter.toDate) items = items.filter((e) => e.timestamp <= filter.toDate!);

    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);

    return { items: paged, total, page, limit };
  }

  /** Compute aggregate statistics over all stored events. */
  getStats(): AuditStats {
    const byAction: Record<string, number> = {};
    const byResource: Record<string, number> = {};
    const byTenant: Record<string, number> = {};

    for (const e of this._events) {
      byAction[e.action] = (byAction[e.action] ?? 0) + 1;
      byResource[e.resource] = (byResource[e.resource] ?? 0) + 1;
      byTenant[e.tenantId] = (byTenant[e.tenantId] ?? 0) + 1;
    }

    return { totalEvents: this._events.length, byAction, byResource, byTenant };
  }

  /** Export events as CSV. Applies same filters as list(). */
  exportCsv(filter: Omit<ListAuditFilter, 'page' | 'limit'>): string {
    const { items } = this.list({ ...filter, page: 1, limit: 500 });
    const header = 'id,tenantId,userId,action,resource,resourceId,ipAddress,timestamp';
    const rows = items.map((e) =>
      [e.id, e.tenantId, e.userId, e.action, e.resource, e.resourceId, e.ipAddress, e.timestamp]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    return [header, ...rows].join('\n');
  }
}
