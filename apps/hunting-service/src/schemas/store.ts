import type {
  HuntSession,
  HuntTemplate,
  CorrelationLead,
} from './hunting.js';

/**
 * In-memory multi-tenant store for hunt sessions and templates.
 * Follows DECISION-013/022: in-memory Maps for Phase 4 validation.
 * State lost on restart — acceptable until DB migration.
 */
export class HuntingStore {
  /** tenantId → huntId → HuntSession */
  readonly sessions = new Map<string, Map<string, HuntSession>>();

  /** tenantId → templateId → HuntTemplate */
  readonly templates = new Map<string, Map<string, HuntTemplate>>();

  /** tenantId → huntId → correlationId → CorrelationLead */
  readonly correlationLeads = new Map<string, Map<string, Map<string, CorrelationLead>>>();

  // ─── Sessions ─────────────────────────────────────────────

  getTenantSessions(tenantId: string): Map<string, HuntSession> {
    let sessions = this.sessions.get(tenantId);
    if (!sessions) {
      sessions = new Map();
      this.sessions.set(tenantId, sessions);
    }
    return sessions;
  }

  getSession(tenantId: string, huntId: string): HuntSession | undefined {
    return this.getTenantSessions(tenantId).get(huntId);
  }

  setSession(tenantId: string, session: HuntSession): void {
    this.getTenantSessions(tenantId).set(session.id, session);
  }

  deleteSession(tenantId: string, huntId: string): boolean {
    return this.getTenantSessions(tenantId).delete(huntId);
  }

  listSessions(
    tenantId: string,
    page: number,
    limit: number,
    status?: string,
  ): { data: HuntSession[]; total: number } {
    const all = Array.from(this.getTenantSessions(tenantId).values());
    const filtered = status ? all.filter((s) => s.status === status) : all;
    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = filtered.length;
    const start = (page - 1) * limit;
    return { data: filtered.slice(start, start + limit), total };
  }

  // ─── Templates ────────────────────────────────────────────

  getTenantTemplates(tenantId: string): Map<string, HuntTemplate> {
    let templates = this.templates.get(tenantId);
    if (!templates) {
      templates = new Map();
      this.templates.set(tenantId, templates);
    }
    return templates;
  }

  getTemplate(tenantId: string, templateId: string): HuntTemplate | undefined {
    return this.getTenantTemplates(tenantId).get(templateId);
  }

  setTemplate(tenantId: string, template: HuntTemplate): void {
    this.getTenantTemplates(tenantId).set(template.id, template);
  }

  deleteTemplate(tenantId: string, templateId: string): boolean {
    return this.getTenantTemplates(tenantId).delete(templateId);
  }

  listTemplates(
    tenantId: string,
    page: number,
    limit: number,
    category?: string,
  ): { data: HuntTemplate[]; total: number } {
    const all = Array.from(this.getTenantTemplates(tenantId).values());
    const filtered = category ? all.filter((t) => t.category === category) : all;
    filtered.sort((a, b) => b.usageCount - a.usageCount);
    const total = filtered.length;
    const start = (page - 1) * limit;
    return { data: filtered.slice(start, start + limit), total };
  }

  // ─── Correlation Leads ────────────────────────────────────

  getTenantLeads(tenantId: string): Map<string, Map<string, CorrelationLead>> {
    let leads = this.correlationLeads.get(tenantId);
    if (!leads) {
      leads = new Map();
      this.correlationLeads.set(tenantId, leads);
    }
    return leads;
  }

  getHuntLeads(tenantId: string, huntId: string): CorrelationLead[] {
    const huntLeads = this.getTenantLeads(tenantId).get(huntId);
    return huntLeads ? Array.from(huntLeads.values()) : [];
  }

  addLead(tenantId: string, huntId: string, lead: CorrelationLead): void {
    const tenantLeads = this.getTenantLeads(tenantId);
    let huntLeads = tenantLeads.get(huntId);
    if (!huntLeads) {
      huntLeads = new Map();
      tenantLeads.set(huntId, huntLeads);
    }
    huntLeads.set(lead.correlationId, lead);
  }

  /** Count active sessions for a tenant (not archived/completed). */
  countActiveSessions(tenantId: string): number {
    const sessions = this.getTenantSessions(tenantId);
    let count = 0;
    for (const s of sessions.values()) {
      if (s.status === 'active' || s.status === 'draft' || s.status === 'paused') {
        count++;
      }
    }
    return count;
  }
}
