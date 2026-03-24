import { createHash } from 'node:crypto';

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
 * Groups related alerts by incident fingerprint (ruleId + severity).
 * Alerts from the same rule within the group window are merged into one group.
 */
export class AlertGroupStore {
  private groups = new Map<string, AlertGroup>();
  /** fingerprint → groupId for active groups */
  private activeIndex = new Map<string, string>();
  private readonly windowMs: number;

  constructor(groupWindowMinutes: number = 30) {
    this.windowMs = groupWindowMinutes * 60_000;
  }

  /** Generate a group fingerprint from ruleId + severity. */
  fingerprint(ruleId: string, severity: string): string {
    return createHash('sha256').update(`group|${ruleId}|${severity}`).digest('hex').slice(0, 16);
  }

  /**
   * Add an alert to a group. Creates a new group if no active group exists
   * for this fingerprint, or appends to the existing group if within the window.
   * Returns the group and whether the alert was added to an existing group.
   */
  addAlert(input: {
    alertId: string;
    ruleId: string;
    tenantId: string;
    severity: string;
    title: string;
  }): { group: AlertGroup; isNew: boolean } {
    const fp = this.fingerprint(input.ruleId, input.severity);
    const now = new Date().toISOString();

    const existingGroupId = this.activeIndex.get(fp);
    if (existingGroupId) {
      const group = this.groups.get(existingGroupId);
      if (group && group.status === 'active') {
        const age = Date.now() - new Date(group.firstAlertAt).getTime();
        if (age <= this.windowMs) {
          group.alertIds.push(input.alertId);
          group.lastAlertAt = now;
          return { group, isNew: false };
        }
      }
      // Window expired or group resolved — remove from active index
      this.activeIndex.delete(fp);
    }

    // Create new group
    const groupId = `grp-${fp}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const group: AlertGroup = {
      id: groupId,
      fingerprint: fp,
      ruleId: input.ruleId,
      tenantId: input.tenantId,
      severity: input.severity,
      title: input.title,
      alertIds: [input.alertId],
      firstAlertAt: now,
      lastAlertAt: now,
      status: 'active',
    };
    this.groups.set(groupId, group);
    this.activeIndex.set(fp, groupId);
    return { group, isNew: true };
  }

  /** Get a group by ID. */
  getById(id: string): AlertGroup | undefined {
    return this.groups.get(id);
  }

  /** Find the group containing a specific alert ID. */
  getByAlertId(alertId: string): AlertGroup | undefined {
    for (const group of this.groups.values()) {
      if (group.alertIds.includes(alertId)) return group;
    }
    return undefined;
  }

  /** List groups for a tenant. */
  list(tenantId: string, opts: ListGroupsOptions): ListGroupsResult {
    let items = Array.from(this.groups.values()).filter((g) => g.tenantId === tenantId);

    if (opts.status) items = items.filter((g) => g.status === opts.status);

    items.sort((a, b) => b.lastAlertAt.localeCompare(a.lastAlertAt));

    const total = items.length;
    const totalPages = Math.ceil(total / opts.limit) || 1;
    const start = (opts.page - 1) * opts.limit;
    const data = items.slice(start, start + opts.limit);

    return { data, total, page: opts.page, limit: opts.limit, totalPages };
  }

  /** Resolve a group (when all alerts in it are resolved). */
  resolveGroup(groupId: string): AlertGroup | undefined {
    const group = this.groups.get(groupId);
    if (!group) return undefined;
    group.status = 'resolved';
    this.activeIndex.delete(group.fingerprint);
    return group;
  }

  /** Get group stats for a tenant. */
  stats(tenantId: string): { totalGroups: number; activeGroups: number; avgAlertsPerGroup: number } {
    const items = Array.from(this.groups.values()).filter((g) => g.tenantId === tenantId);
    const active = items.filter((g) => g.status === 'active').length;
    const totalAlerts = items.reduce((sum, g) => sum + g.alertIds.length, 0);
    const avg = items.length > 0 ? Math.round((totalAlerts / items.length) * 10) / 10 : 0;
    return { totalGroups: items.length, activeGroups: active, avgAlertsPerGroup: avg };
  }

  /** Clear all groups (for testing). */
  clear(): void {
    this.groups.clear();
    this.activeIndex.clear();
  }
}
