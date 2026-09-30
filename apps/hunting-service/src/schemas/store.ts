import { randomUUID } from 'node:crypto';
import type { DocRepo } from '../doc-repo.js';
import { MemoryDocRepo } from '../doc-repo.js';
import type {
  HuntSession,
  HuntTemplate,
  CorrelationLead,
} from './hunting.js';

/** Correlation lead row — CorrelationLead has no id/tenantId of its own, so the store adds them. */
export interface LeadDoc extends CorrelationLead {
  id: string;
  tenantId: string;
  huntId: string;
}

/** A child DocRepo that HuntingStore cascades deletes into when a session is deleted. */
export interface CascadeRepo {
  deleteByParent(tenantId: string, parentId: string): Promise<number>;
}

export interface HuntingStoreRepos {
  sessions?: DocRepo<HuntSession>;
  templates?: DocRepo<HuntTemplate>;
  leads?: DocRepo<LeadDoc>;
}

/**
 * Multi-tenant store for hunt sessions, templates, and correlation leads — backed by a
 * generic Postgres JSON-document repo (Step 3 S159, DECISION-051). No repos injected
 * means dev/test (MemoryDocRepo); production passes Prisma-backed repos (see index.ts).
 */
export class HuntingStore {
  private readonly sessionsRepo: DocRepo<HuntSession>;
  private readonly templatesRepo: DocRepo<HuntTemplate>;
  private readonly leadsRepo: DocRepo<LeadDoc>;
  private readonly cascadeRepos: CascadeRepo[] = []; // memory-ok: registry of child DocRepos (comments/shares/evidence/hypotheses) for cascade delete, populated by service constructors

  constructor(repos?: HuntingStoreRepos) {
    this.sessionsRepo = repos?.sessions ?? new MemoryDocRepo();
    this.templatesRepo = repos?.templates ?? new MemoryDocRepo();
    this.leadsRepo = repos?.leads ?? new MemoryDocRepo();
  }

  /** Register a child DocRepo (comments, shares, evidence, hypotheses, ...) so deleteSession() cascades into it. */
  registerCascadeRepo(repo: CascadeRepo): void {
    this.cascadeRepos.push(repo);
  }

  // ─── Sessions ─────────────────────────────────────────────

  async getSession(tenantId: string, huntId: string): Promise<HuntSession | undefined> {
    return (await this.sessionsRepo.get(huntId, tenantId)) ?? undefined;
  }

  async setSession(_tenantId: string, session: HuntSession): Promise<void> {
    await this.sessionsRepo.save(session);
  }

  /** Deletes a session and cascades to every registered child repo + correlation leads. */
  async deleteSession(tenantId: string, huntId: string): Promise<boolean> {
    await this.leadsRepo.deleteByParent(tenantId, huntId);
    for (const repo of this.cascadeRepos) {
      await repo.deleteByParent(tenantId, huntId);
    }
    return this.sessionsRepo.delete(huntId, tenantId);
  }

  async listSessions(
    tenantId: string,
    page: number,
    limit: number,
    status?: string,
  ): Promise<{ data: HuntSession[]; total: number }> {
    const all = await this.listAllSessions(tenantId);
    const filtered = status ? all.filter((s) => s.status === status) : all;
    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = filtered.length;
    const start = (page - 1) * limit;
    return { data: filtered.slice(start, start + limit), total };
  }

  /** All sessions for a tenant, unpaginated — used by stats/scoring/cleanup. */
  async listAllSessions(tenantId: string): Promise<HuntSession[]> {
    return this.sessionsRepo.list(tenantId);
  }

  /** Count active sessions for a tenant (not archived/completed). */
  async countActiveSessions(tenantId: string): Promise<number> {
    const sessions = await this.listAllSessions(tenantId);
    let count = 0;
    for (const s of sessions) {
      if (s.status === 'active' || s.status === 'draft' || s.status === 'paused') {
        count++;
      }
    }
    return count;
  }

  // ─── Templates ────────────────────────────────────────────

  async getTemplate(tenantId: string, templateId: string): Promise<HuntTemplate | undefined> {
    return (await this.templatesRepo.get(templateId, tenantId)) ?? undefined;
  }

  async setTemplate(_tenantId: string, template: HuntTemplate): Promise<void> {
    await this.templatesRepo.save(template);
  }

  async deleteTemplate(tenantId: string, templateId: string): Promise<boolean> {
    return this.templatesRepo.delete(templateId, tenantId);
  }

  async listTemplates(
    tenantId: string,
    page: number,
    limit: number,
    category?: string,
  ): Promise<{ data: HuntTemplate[]; total: number }> {
    const all = await this.listAllTemplates(tenantId);
    const filtered = category ? all.filter((t) => t.category === category) : all;
    filtered.sort((a, b) => b.usageCount - a.usageCount);
    const total = filtered.length;
    const start = (page - 1) * limit;
    return { data: filtered.slice(start, start + limit), total };
  }

  /** All templates for a tenant, unpaginated — used by search. */
  async listAllTemplates(tenantId: string): Promise<HuntTemplate[]> {
    return this.templatesRepo.list(tenantId);
  }

  // ─── Correlation Leads ────────────────────────────────────

  async getHuntLeads(tenantId: string, huntId: string): Promise<CorrelationLead[]> {
    return this.leadsRepo.list(tenantId, huntId);
  }

  async addLead(tenantId: string, huntId: string, lead: CorrelationLead): Promise<void> {
    const row: LeadDoc = { ...lead, id: randomUUID(), tenantId, huntId };
    await this.leadsRepo.save(row, huntId);
  }
}
