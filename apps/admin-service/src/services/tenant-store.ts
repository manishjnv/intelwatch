import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';

export type TenantPlan = 'free' | 'starter' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'pending' | 'deleted';

export interface TenantRecord {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  plan: TenantPlan;
  status: TenantStatus;
  suspensionReason?: string;
  inviteToken: string;
  featureFlags: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface TenantUsage {
  tenantId: string;
  iocCount: number;
  apiCallCount: number;
  storageBytes: number;
  enrichmentCostUSD: number;
  feedCount: number;
  userCount: number;
  lastActivity: string;
}

export interface CreateTenantInput {
  name: string;
  ownerName: string;
  ownerEmail: string;
  plan?: TenantPlan;
  featureFlags?: Record<string, boolean>;
}

export interface ListTenantFilter {
  status?: TenantStatus;
  plan?: TenantPlan;
}

/** In-memory tenant registry (DECISION-013). */
export class TenantStore {
  private _tenants: Map<string, TenantRecord> = new Map();
  private _usage: Map<string, TenantUsage> = new Map();

  /** Create a new tenant. */
  create(input: CreateTenantInput): TenantRecord {
    const now = new Date().toISOString();
    const tenant: TenantRecord = {
      id: randomUUID(),
      name: input.name,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      plan: input.plan ?? 'free',
      status: 'active',
      inviteToken: randomUUID(),
      featureFlags: input.featureFlags ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this._tenants.set(tenant.id, tenant);
    // Initialise usage record
    this._usage.set(tenant.id, {
      tenantId: tenant.id,
      iocCount: 0,
      apiCallCount: 0,
      storageBytes: 0,
      enrichmentCostUSD: 0,
      feedCount: 0,
      userCount: 1,
      lastActivity: now,
    });
    return tenant;
  }

  /** List tenants with optional filters. */
  list(filter: ListTenantFilter = {}): TenantRecord[] {
    let tenants = Array.from(this._tenants.values());
    if (filter.status) tenants = tenants.filter((t) => t.status === filter.status);
    if (filter.plan) tenants = tenants.filter((t) => t.plan === filter.plan);
    return tenants.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /** Get a tenant by id. */
  getById(id: string): TenantRecord | undefined {
    return this._tenants.get(id);
  }

  /** Suspend a tenant. Throws if not found. */
  suspend(id: string, reason: string): TenantRecord {
    const tenant = this._tenants.get(id);
    if (!tenant) throw new AppError(404, `Tenant not found: ${id}`, 'NOT_FOUND');
    const updated: TenantRecord = {
      ...tenant,
      status: 'suspended',
      suspensionReason: reason,
      updatedAt: new Date().toISOString(),
    };
    this._tenants.set(id, updated);
    return updated;
  }

  /** Reinstate a suspended tenant. */
  reinstate(id: string): TenantRecord {
    const tenant = this._tenants.get(id);
    if (!tenant) throw new AppError(404, `Tenant not found: ${id}`, 'NOT_FOUND');
    const updated: TenantRecord = {
      ...tenant,
      status: 'active',
      suspensionReason: undefined,
      updatedAt: new Date().toISOString(),
    };
    this._tenants.set(id, updated);
    return updated;
  }

  /** Change the plan for a tenant. */
  changePlan(id: string, plan: TenantPlan): TenantRecord {
    const tenant = this._tenants.get(id);
    if (!tenant) throw new AppError(404, `Tenant not found: ${id}`, 'NOT_FOUND');
    const updated: TenantRecord = { ...tenant, plan, updatedAt: new Date().toISOString() };
    this._tenants.set(id, updated);
    return updated;
  }

  /** Delete a tenant. Returns false if not found. */
  delete(id: string): boolean {
    if (!this._tenants.has(id)) return false;
    this._tenants.delete(id);
    this._usage.delete(id);
    return true;
  }

  /** Get usage overview for a tenant. */
  getUsage(id: string): TenantUsage {
    const usage = this._usage.get(id);
    if (!usage) throw new AppError(404, `Tenant not found: ${id}`, 'NOT_FOUND');
    return usage;
  }

  /** Update usage counters (called by other services via internal API). */
  updateUsage(id: string, delta: Partial<Omit<TenantUsage, 'tenantId' | 'lastActivity'>>): void {
    const usage = this._usage.get(id);
    if (!usage) return;
    this._usage.set(id, {
      ...usage,
      ...Object.fromEntries(
        Object.entries(delta).map(([k, v]) => [k, (usage[k as keyof TenantUsage] as number) + (v as number)]),
      ),
      lastActivity: new Date().toISOString(),
    });
  }
}
