import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';

export type MaintenanceType = 'planned' | 'emergency' | 'upgrade';
export type MaintenanceScope = 'platform' | 'tenant' | 'service';
export type MaintenanceStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface MaintenanceWindow {
  id: string;
  title: string;
  description: string;
  type: MaintenanceType;
  scope: MaintenanceScope;
  tenantIds: string[];
  startsAt: string;
  endsAt: string;
  status: MaintenanceStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  completedAt?: string;
}

export interface CreateMaintenanceInput {
  title: string;
  description: string;
  type: MaintenanceType;
  scope: MaintenanceScope;
  tenantIds: string[];
  startsAt: string;
  endsAt: string;
  createdBy: string;
}

export interface UpdateMaintenanceInput {
  title?: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  tenantIds?: string[];
}

export interface ListMaintenanceFilter {
  status?: MaintenanceStatus;
  scope?: MaintenanceScope;
}

/** In-memory maintenance window store (DECISION-013). */
export class MaintenanceStore {
  private _windows: Map<string, MaintenanceWindow> = new Map();

  /** Create a new maintenance window. Status is derived from startsAt. */
  create(input: CreateMaintenanceInput): MaintenanceWindow {
    const now = new Date();
    const id = randomUUID();
    const status: MaintenanceStatus = new Date(input.startsAt) <= now ? 'active' : 'scheduled';
    const win: MaintenanceWindow = {
      id,
      ...input,
      status,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      activatedAt: status === 'active' ? now.toISOString() : undefined,
    };
    this._windows.set(id, win);
    return win;
  }

  /** List maintenance windows with optional filters. */
  list(filter: ListMaintenanceFilter = {}): MaintenanceWindow[] {
    let results = Array.from(this._windows.values());
    if (filter.status) results = results.filter((w) => w.status === filter.status);
    if (filter.scope) results = results.filter((w) => w.scope === filter.scope);
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /** Get a window by id. */
  getById(id: string): MaintenanceWindow | undefined {
    return this._windows.get(id);
  }

  /** Update fields on an existing window. */
  update(id: string, input: UpdateMaintenanceInput): MaintenanceWindow | undefined {
    const win = this._windows.get(id);
    if (!win) return undefined;
    const updated: MaintenanceWindow = { ...win, ...input, updatedAt: new Date().toISOString() };
    this._windows.set(id, updated);
    return updated;
  }

  /** Delete a window. Returns false if not found. */
  delete(id: string): boolean {
    return this._windows.delete(id);
  }

  /** Force-activate a window (set status to active). */
  activate(id: string): MaintenanceWindow | undefined {
    const win = this._windows.get(id);
    if (!win) return undefined;
    const updated: MaintenanceWindow = {
      ...win,
      status: 'active',
      activatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this._windows.set(id, updated);
    return updated;
  }

  /** Mark a window as completed (deactivate). */
  deactivate(id: string): MaintenanceWindow | undefined {
    const win = this._windows.get(id);
    if (!win) return undefined;
    const updated: MaintenanceWindow = {
      ...win,
      status: 'completed',
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this._windows.set(id, updated);
    return updated;
  }

  /** Check whether platform-scope maintenance is currently active. */
  isActive(tenantId?: string): boolean {
    for (const win of this._windows.values()) {
      if (win.status !== 'active') continue;
      if (win.scope === 'platform') return true;
      if (tenantId && win.scope === 'tenant' && win.tenantIds.includes(tenantId)) return true;
    }
    return false;
  }
}

/** Validate that maintenance window input throws AppError for bad fields. */
export function validateMaintenanceInput(input: Partial<CreateMaintenanceInput>): void {
  if (!input.title || input.title.trim().length === 0) {
    throw new AppError(400, 'title is required', 'VALIDATION_ERROR');
  }
  if (!input.type || !['planned', 'emergency', 'upgrade'].includes(input.type)) {
    throw new AppError(400, 'type must be planned, emergency, or upgrade', 'VALIDATION_ERROR');
  }
  if (!input.scope || !['platform', 'tenant', 'service'].includes(input.scope)) {
    throw new AppError(400, 'scope must be platform, tenant, or service', 'VALIDATION_ERROR');
  }
  if (!input.startsAt) throw new AppError(400, 'startsAt is required', 'VALIDATION_ERROR');
  if (!input.endsAt) throw new AppError(400, 'endsAt is required', 'VALIDATION_ERROR');
  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new AppError(400, 'endsAt must be after startsAt', 'VALIDATION_ERROR');
  }
}
