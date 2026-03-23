import { randomUUID } from 'crypto';

export interface AdminActivity {
  id: string;
  adminId: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface LogActivityInput {
  adminId: string;
  action: string;
  target: string;
  details?: Record<string, unknown>;
}

export interface ListActivityFilter {
  adminId?: string;
  action?: string;
  page?: number;
  limit?: number;
}

export interface ListActivityResult {
  items: AdminActivity[];
  total: number;
  page: number;
  limit: number;
}

/** In-memory admin activity log (DECISION-013, P0 #10). Tracks all admin actions. */
export class AdminActivityStore {
  private static readonly MAX_ENTRIES = 5_000;
  private _activities: AdminActivity[] = [];

  /** Log an admin action. */
  log(input: LogActivityInput): AdminActivity {
    const activity: AdminActivity = {
      id: randomUUID(),
      adminId: input.adminId,
      action: input.action,
      target: input.target,
      details: input.details ?? {},
      timestamp: new Date().toISOString(),
    };
    this._activities.unshift(activity);
    if (this._activities.length > AdminActivityStore.MAX_ENTRIES) {
      this._activities = this._activities.slice(0, AdminActivityStore.MAX_ENTRIES);
    }
    return activity;
  }

  /** List admin activities with optional filters and pagination. */
  list(filter: ListActivityFilter = {}): ListActivityResult {
    const page = filter.page ?? 1;
    const limit = Math.min(filter.limit ?? 50, 500);

    let items = this._activities;
    if (filter.adminId) items = items.filter((a) => a.adminId === filter.adminId);
    if (filter.action) items = items.filter((a) => a.action === filter.action);

    const total = items.length;
    const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), total, page, limit };
  }
}
