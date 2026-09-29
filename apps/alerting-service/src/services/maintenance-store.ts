import { randomUUID } from 'node:crypto';
import { MemoryRepo, type Repo } from '../repository.js';

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

/**
 * Maintenance window store (Step 3 S154). Backed by Postgres via `repo` in
 * production; an in-memory MemoryRepo when no repo is injected (dev/test only).
 */
export class MaintenanceStore {
  constructor(private readonly repo: Repo<MaintenanceWindow> = new MemoryRepo<MaintenanceWindow>()) {}

  /** Create a maintenance window. */
  async create(dto: CreateMaintenanceDto): Promise<MaintenanceWindow> {
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
    return this.repo.save(window);
  }

  /** Get by ID, optionally scoped to a tenant. */
  async getById(id: string, tenantId?: string): Promise<MaintenanceWindow | undefined> {
    const window = await this.repo.get(id);
    if (!window) return undefined;
    if (tenantId !== undefined && window.tenantId !== tenantId) return undefined;
    return window;
  }

  /** List windows for a tenant. */
  // ponytail: filters/sort/paginate in JS over the tenant's rows; push into SQL if a tenant ever has thousands of windows.
  async list(tenantId: string, opts: ListMaintenanceOptions): Promise<ListMaintenanceResult> {
    let items = await this.repo.list(tenantId);
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
  async update(id: string, dto: UpdateMaintenanceDto, tenantId?: string): Promise<MaintenanceWindow | undefined> {
    const w = await this.getById(id, tenantId);
    if (!w) return undefined;

    const updated: MaintenanceWindow = {
      ...w,
      name: dto.name ?? w.name,
      startAt: dto.startAt ?? w.startAt,
      endAt: dto.endAt ?? w.endAt,
      suppressAllRules: dto.suppressAllRules ?? w.suppressAllRules,
      ruleIds: dto.ruleIds ?? w.ruleIds,
      reason: dto.reason ?? w.reason,
      updatedAt: new Date().toISOString(),
    };
    return this.repo.save(updated);
  }

  /** Delete a window. */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    const w = await this.getById(id, tenantId);
    if (!w) return false;
    return this.repo.delete(id);
  }

  /** Check if a specific rule is suppressed by any active maintenance window. */
  async isRuleSuppressed(tenantId: string, ruleId: string): Promise<boolean> {
    const now = Date.now();
    const items = await this.repo.list(tenantId);
    for (const w of items) {
      if (new Date(w.startAt).getTime() > now || new Date(w.endAt).getTime() <= now) continue;
      // Active window
      if (w.suppressAllRules) return true;
      if (w.ruleIds.includes(ruleId)) return true;
    }
    return false;
  }

  /** Check if ANY rules are suppressed for a tenant (all-rules window active). */
  async isAllRulesSuppressed(tenantId: string): Promise<boolean> {
    const now = Date.now();
    const items = await this.repo.list(tenantId);
    for (const w of items) {
      if (new Date(w.startAt).getTime() > now || new Date(w.endAt).getTime() <= now) continue;
      if (w.suppressAllRules) return true;
    }
    return false;
  }

  /** Clear all (test-only; only affects the in-memory backend). */
  clear(): void {
    if (this.repo instanceof MemoryRepo) this.repo.clear();
  }
}
