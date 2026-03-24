import { randomUUID } from 'node:crypto';
import type { CreateEscalationDto, UpdateEscalationDto, EscalationStep } from '../schemas/alert.js';

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

/** In-memory escalation policy store (DECISION-013). */
export class EscalationStore {
  private policies = new Map<string, EscalationPolicy>();

  /** Create a new escalation policy. */
  create(dto: CreateEscalationDto): EscalationPolicy {
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
    this.policies.set(policy.id, policy);
    return policy;
  }

  /** Get policy by ID. */
  getById(id: string): EscalationPolicy | undefined {
    return this.policies.get(id);
  }

  /** List policies for a tenant. */
  list(tenantId: string, opts: ListEscalationsOptions): ListEscalationsResult {
    const items = Array.from(this.policies.values())
      .filter((p) => p.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const totalPages = Math.ceil(total / opts.limit) || 1;
    const start = (opts.page - 1) * opts.limit;
    const data = items.slice(start, start + opts.limit);

    return { data, total, page: opts.page, limit: opts.limit, totalPages };
  }

  /** Update a policy. */
  update(id: string, dto: UpdateEscalationDto): EscalationPolicy | undefined {
    const policy = this.policies.get(id);
    if (!policy) return undefined;

    if (dto.name !== undefined) policy.name = dto.name;
    if (dto.steps !== undefined) policy.steps = dto.steps;
    if (dto.repeatAfterMinutes !== undefined) policy.repeatAfterMinutes = dto.repeatAfterMinutes;
    if (dto.enabled !== undefined) policy.enabled = dto.enabled;
    policy.updatedAt = new Date().toISOString();

    return policy;
  }

  /** Delete a policy. Returns true if deleted. */
  delete(id: string): boolean {
    return this.policies.delete(id);
  }

  /** Clear all policies (for testing). */
  clear(): void {
    this.policies.clear();
  }
}
