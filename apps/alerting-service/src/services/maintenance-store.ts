import { randomUUID } from 'node:crypto';

export interface MaintenanceWindow {
  id: string;
  name: string;
  tenantId: string;
  startAt: string;
  endAt: string;
  suppressAllRules: boolean;
  ruleIds: string[];
  reason: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceDto {
  name: string;
  tenantId?: string;
  startAt: string;
  endAt: string;
  suppressAllRules?: boolean;
  ruleIds?: string[];
  reason?: string;
  createdBy?: string;
}

export interface UpdateMaintenanceDto {
  name?: string;
  startAt?: string;
  endAt?: string;
  suppressAllRules?: boolean;
  ruleIds?: string[];
  reason?: string;
}

export interface ListMaintenanceOptions {
  active?: boolean;
  page: number;
  limit: number;
}

export interface ListMaintenanceResult {
  data: MaintenanceWindow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** In-memory maintenance window store. */
export class MaintenanceStore {
  private windows = new Map<string, MaintenanceWindow>();

  /** Create a maintenance window. */
  create(dto: CreateMaintenanceDto): MaintenanceWindow {
    const now = new Date().toISOString();
    const window: MaintenanceWindow = {
      id: randomUUID(),
      name: dto.name,
      tenantId: dto.tenantId ?? 'default',
      startAt: dto.startAt,
      endAt: dto.endAt,
      suppressAllRules: dto.suppressAllRules ?? true,
      ruleIds: dto.ruleIds ?? [],
      reason: dto.reason ?? '',
      createdBy: dto.createdBy ?? 'system',
      createdAt: now,
      updatedAt: now,
    };
    this.windows.set(window.id, window);
    return window;
  }

  /** Get by ID. */
  getById(id: string): MaintenanceWindow | undefined {
    return this.windows.get(id);
  }

  /** List windows for a tenant. */
  list(tenantId: string, opts: ListMaintenanceOptions): ListMaintenanceResult {
    let items = Array.from(this.windows.values()).filter((w) => w.tenantId === tenantId);
    const now = Date.now();

    if (opts.active === true) {
      items = items.filter((w) => new Date(w.startAt).getTime() <= now && new Date(w.endAt).getTime() > now);
    } else if (opts.active === false) {
      items = items.filter((w) => new Date(w.startAt).getTime() > now || new Date(w.endAt).getTime() <= now);
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const totalPages = Math.ceil(total / opts.limit) || 1;
    const start = (opts.page - 1) * opts.limit;
    const data = items.slice(start, start + opts.limit);

    return { data, total, page: opts.page, limit: opts.limit, totalPages };
  }

  /** Update a window. */
  update(id: string, dto: UpdateMaintenanceDto): MaintenanceWindow | undefined {
    const w = this.windows.get(id);
    if (!w) return undefined;

    if (dto.name !== undefined) w.name = dto.name;
    if (dto.startAt !== undefined) w.startAt = dto.startAt;
    if (dto.endAt !== undefined) w.endAt = dto.endAt;
    if (dto.suppressAllRules !== undefined) w.suppressAllRules = dto.suppressAllRules;
    if (dto.ruleIds !== undefined) w.ruleIds = dto.ruleIds;
    if (dto.reason !== undefined) w.reason = dto.reason;
    w.updatedAt = new Date().toISOString();

    return w;
  }

  /** Delete a window. */
  delete(id: string): boolean {
    return this.windows.delete(id);
  }

  /** Check if a specific rule is suppressed by any active maintenance window. */
  isRuleSuppressed(tenantId: string, ruleId: string): boolean {
    const now = Date.now();
    for (const w of this.windows.values()) {
      if (w.tenantId !== tenantId) continue;
      if (new Date(w.startAt).getTime() > now || new Date(w.endAt).getTime() <= now) continue;
      // Active window
      if (w.suppressAllRules) return true;
      if (w.ruleIds.includes(ruleId)) return true;
    }
    return false;
  }

  /** Check if ANY rules are suppressed for a tenant (all-rules window active). */
  isAllRulesSuppressed(tenantId: string): boolean {
    const now = Date.now();
    for (const w of this.windows.values()) {
      if (w.tenantId !== tenantId) continue;
      if (new Date(w.startAt).getTime() > now || new Date(w.endAt).getTime() <= now) continue;
      if (w.suppressAllRules) return true;
    }
    return false;
  }

  /** Clear all (for testing). */
  clear(): void {
    this.windows.clear();
  }
}
