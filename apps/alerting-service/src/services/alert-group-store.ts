import { randomUUID, createHash } from 'node:crypto';
import { MemoryAlertGroupRepo, type AlertGroupRepo } from '../repository.js';

export interface AlertGroup {
  id: string;
  fingerprint: string;
  ruleId: string;
  tenantId: string;
  severity: string;
  title: string;
  alertIds: string[];
  firstAlertAt: string;
  lastAlertAt: string;
  status: 'active' | 'resolved';
}

export interface ListGroupsOptions {
  status?: string;
  page: number;
  limit: number;
}

export interface ListGroupsResult {
  data: AlertGroup[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Groups related alerts by incident fingerprint (ruleId + severity) (Step 3 S155).
 * Alerts from the same rule within the group window are merged into one group.
 * Backed by Postgres via `repo` in production; an in-memory MemoryAlertGroupRepo
 * when no repo is injected (dev/test only).
 */
export class AlertGroupStore {
  constructor(
    private readonly repo: AlertGroupRepo = new MemoryAlertGroupRepo(),
    groupWindowMinutes: number = 30,
  ) {
    this.windowMs = groupWindowMinutes * 60_000;
  }

  private readonly windowMs: number;

  /** Generate a group fingerprint from ruleId + severity. */
  fingerprint(ruleId: string, severity: string): string {
    return createHash('sha256').update(`group|${ruleId}|${severity}`).digest('hex').slice(0, 16);
  }

  /**
   * Add an alert to a group. Creates a new group if no active group exists
   * for this fingerprint, or appends to the existing group if within the window.
   * Returns the group and whether the alert was added to an existing group.
   */
  async addAlert(input: {
    alertId: string;
    ruleId: string;
    tenantId: string;
    severity: string;
    title: string;
  }): Promise<{ group: AlertGroup; isNew: boolean }> {
    const fp = this.fingerprint(input.ruleId, input.severity);
    const now = new Date();

    const existing = await this.repo.findActive(input.tenantId, fp);
    if (existing) {
      const age = now.getTime() - new Date(existing.firstAlertAt).getTime();
      if (age <= this.windowMs) {
        const updated = await this.repo.appendAlert(existing.id, input.alertId, now);
        if (updated) return { group: updated, isNew: false };
      }
    }

    const group: AlertGroup = {
      id: randomUUID(),
      fingerprint: fp,
      ruleId: input.ruleId,
      tenantId: input.tenantId,
      severity: input.severity,
      title: input.title,
      alertIds: [input.alertId],
      firstAlertAt: now.toISOString(),
      lastAlertAt: now.toISOString(),
      status: 'active',
    };
    const inserted = await this.repo.insert(group);
    return { group: inserted, isNew: true };
  }

  /** Get a group by ID, optionally scoped to a tenant. */
  async getById(id: string, tenantId?: string): Promise<AlertGroup | undefined> {
    const group = await this.repo.get(id);
    if (!group) return undefined;
    if (tenantId !== undefined && group.tenantId !== tenantId) return undefined;
    return group;
  }

  /** List groups for a tenant. */
  // ponytail: filters/sort/paginate in JS over the tenant's rows; push into SQL if a tenant ever has thousands of groups.
  async list(tenantId: string, opts: ListGroupsOptions): Promise<ListGroupsResult> {
    let items = await this.repo.list(tenantId);
    if (opts.status) items = items.filter((g) => g.status === opts.status);
    items.sort((a, b) => b.lastAlertAt.localeCompare(a.lastAlertAt));

    const total = items.length;
    const totalPages = Math.ceil(total / opts.limit) || 1;
    const start = (opts.page - 1) * opts.limit;
    const data = items.slice(start, start + opts.limit);

    return { data, total, page: opts.page, limit: opts.limit, totalPages };
  }

  /** Resolve a group (when all alerts in it are resolved), scoped to a tenant. */
  async resolveGroup(groupId: string, tenantId?: string): Promise<AlertGroup | undefined> {
    const group = await this.getById(groupId, tenantId);
    if (!group) return undefined;
    const updated = await this.repo.setStatus(groupId, 'resolved');
    return updated ?? undefined;
  }

  /** Get group stats for a tenant. */
  async stats(tenantId: string): Promise<{ totalGroups: number; activeGroups: number; avgAlertsPerGroup: number }> {
    const items = await this.repo.list(tenantId);
    const active = items.filter((g) => g.status === 'active').length;
    const totalAlerts = items.reduce((sum, g) => sum + g.alertIds.length, 0);
    const avg = items.length > 0 ? Math.round((totalAlerts / items.length) * 10) / 10 : 0;
    return { totalGroups: items.length, activeGroups: active, avgAlertsPerGroup: avg };
  }

  /** Clear all groups (test-only; only affects the in-memory backend). */
  clear(): void {
    if (this.repo instanceof MemoryAlertGroupRepo) this.repo.clear();
  }
}
