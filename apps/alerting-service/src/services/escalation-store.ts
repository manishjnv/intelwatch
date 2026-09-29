import { randomUUID } from 'node:crypto';
import type { CreateEscalationDto, UpdateEscalationDto, EscalationStep } from '../schemas/alert.js';
import { MemoryRepo, type Repo } from '../repository.js';

export interface EscalationPolicy {
  id: string;
  name: string;
  tenantId: string;
  steps: EscalationStep[];
  repeatAfterMinutes: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListEscalationsOptions {
  page: number;
  limit: number;
}

export interface ListEscalationsResult {
  data: EscalationPolicy[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Escalation policy store (Step 3 S154). Backed by Postgres via `repo` in
 * production; an in-memory MemoryRepo when no repo is injected (dev/test only).
 */
export class EscalationStore {
  constructor(private readonly repo: Repo<EscalationPolicy> = new MemoryRepo<EscalationPolicy>()) {}

  /** Create a new escalation policy. */
  async create(dto: CreateEscalationDto): Promise<EscalationPolicy> {
    const now = new Date().toISOString();
    const policy: EscalationPolicy = {
      id: randomUUID(),
      name: dto.name,
      tenantId: dto.tenantId,
      steps: dto.steps,
      repeatAfterMinutes: dto.repeatAfterMinutes,
      enabled: dto.enabled,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.save(policy);
  }

  /** Get policy by ID, optionally scoped to a tenant. */
  async getById(id: string, tenantId?: string): Promise<EscalationPolicy | undefined> {
    const policy = await this.repo.get(id);
    if (!policy) return undefined;
    if (tenantId !== undefined && policy.tenantId !== tenantId) return undefined;
    return policy;
  }

  /** List policies for a tenant. */
  // ponytail: sort/paginate in JS over the tenant's rows; push into SQL if a tenant ever has thousands of policies.
  async list(tenantId: string, opts: ListEscalationsOptions): Promise<ListEscalationsResult> {
    const items = (await this.repo.list(tenantId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const totalPages = Math.ceil(total / opts.limit) || 1;
    const start = (opts.page - 1) * opts.limit;
    const data = items.slice(start, start + opts.limit);

    return { data, total, page: opts.page, limit: opts.limit, totalPages };
  }

  /** Update a policy. */
  async update(id: string, dto: UpdateEscalationDto, tenantId?: string): Promise<EscalationPolicy | undefined> {
    const policy = await this.getById(id, tenantId);
    if (!policy) return undefined;

    const updated: EscalationPolicy = {
      ...policy,
      name: dto.name ?? policy.name,
      steps: dto.steps ?? policy.steps,
      repeatAfterMinutes: dto.repeatAfterMinutes ?? policy.repeatAfterMinutes,
      enabled: dto.enabled ?? policy.enabled,
      updatedAt: new Date().toISOString(),
    };
    return this.repo.save(updated);
  }

  /** Delete a policy. Returns true if deleted. */
  async delete(id: string, tenantId?: string): Promise<boolean> {
    const policy = await this.getById(id, tenantId);
    if (!policy) return false;
    return this.repo.delete(id);
  }

  /** Clear all policies (test-only; only affects the in-memory backend). */
  clear(): void {
    if (this.repo instanceof MemoryRepo) this.repo.clear();
  }
}
