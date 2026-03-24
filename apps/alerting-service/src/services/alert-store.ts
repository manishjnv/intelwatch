import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { AlertSeverity, AlertStatus } from '../schemas/alert.js';

/** Valid state transitions for the alert lifecycle FSM. */
const VALID_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  open: ['acknowledged', 'resolved', 'suppressed', 'escalated'],
  acknowledged: ['resolved', 'escalated'],
  resolved: [],
  suppressed: ['open', 'resolved'],
  escalated: ['acknowledged', 'resolved'],
};

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  tenantId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  source: Record<string, unknown>;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  suppressedUntil: string | null;
  suppressReason: string | null;
  escalationLevel: number;
  escalatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertInput {
  ruleId: string;
  ruleName: string;
  tenantId: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  source?: Record<string, unknown>;
}

export interface ListAlertsOptions {
  severity?: string;
  status?: string;
  ruleId?: string;
  page: number;
  limit: number;
}

export interface ListAlertsResult {
  data: Alert[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AlertStats {
  total: number;
  open: number;
  acknowledged: number;
  resolved: number;
  suppressed: number;
  escalated: number;
  bySeverity: Record<AlertSeverity, number>;
  avgResolutionMinutes: number;
}

/** In-memory alert store with lifecycle FSM (DECISION-013). */
export class AlertStore {
  private alerts = new Map<string, Alert>();
  private readonly maxPerTenant: number;

  constructor(maxPerTenant: number = 5000) {
    this.maxPerTenant = maxPerTenant;
  }

  /** Create a new alert in 'open' status. */
  create(input: CreateAlertInput): Alert {
    const tenantCount = this.countByTenant(input.tenantId);
    if (tenantCount >= this.maxPerTenant) {
      throw new AppError(429, `Alert limit reached for tenant: ${this.maxPerTenant}`, 'ALERT_LIMIT_REACHED');
    }

    const now = new Date().toISOString();
    const alert: Alert = {
      id: randomUUID(),
      ruleId: input.ruleId,
      ruleName: input.ruleName,
      tenantId: input.tenantId,
      severity: input.severity,
      status: 'open',
      title: input.title,
      description: input.description,
      source: input.source ?? {},
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedBy: null,
      resolvedAt: null,
      suppressedUntil: null,
      suppressReason: null,
      escalationLevel: 0,
      escalatedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.alerts.set(alert.id, alert);
    return alert;
  }

  /** Get alert by ID. */
  getById(id: string): Alert | undefined {
    return this.alerts.get(id);
  }

  /** List alerts for a tenant with filters. */
  list(tenantId: string, opts: ListAlertsOptions): ListAlertsResult {
    let items = Array.from(this.alerts.values()).filter((a) => a.tenantId === tenantId);

    if (opts.severity) items = items.filter((a) => a.severity === opts.severity);
    if (opts.status) items = items.filter((a) => a.status === opts.status);
    if (opts.ruleId) items = items.filter((a) => a.ruleId === opts.ruleId);

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const totalPages = Math.ceil(total / opts.limit) || 1;
    const start = (opts.page - 1) * opts.limit;
    const data = items.slice(start, start + opts.limit);

    return { data, total, page: opts.page, limit: opts.limit, totalPages };
  }

  /** Transition alert to a new status (enforces FSM). */
  private transition(id: string, newStatus: AlertStatus): Alert {
    const alert = this.alerts.get(id);
    if (!alert) throw new AppError(404, `Alert not found: ${id}`, 'NOT_FOUND');

    const allowed = VALID_TRANSITIONS[alert.status];
    if (!allowed.includes(newStatus)) {
      throw new AppError(
        409,
        `Cannot transition from '${alert.status}' to '${newStatus}'`,
        'INVALID_TRANSITION',
      );
    }

    alert.status = newStatus;
    alert.updatedAt = new Date().toISOString();
    return alert;
  }

  /** Acknowledge an alert. */
  acknowledge(id: string, userId: string): Alert {
    const alert = this.transition(id, 'acknowledged');
    alert.acknowledgedBy = userId;
    alert.acknowledgedAt = new Date().toISOString();
    return alert;
  }

  /** Resolve an alert. */
  resolve(id: string, userId: string): Alert {
    const alert = this.transition(id, 'resolved');
    alert.resolvedBy = userId;
    alert.resolvedAt = new Date().toISOString();
    return alert;
  }

  /** Suppress an alert for a duration. */
  suppress(id: string, durationMinutes: number, reason?: string): Alert {
    const alert = this.transition(id, 'suppressed');
    alert.suppressedUntil = new Date(Date.now() + durationMinutes * 60_000).toISOString();
    alert.suppressReason = reason ?? null;
    return alert;
  }

  /** Escalate an alert. */
  escalate(id: string): Alert {
    const alert = this.transition(id, 'escalated');
    alert.escalationLevel++;
    alert.escalatedAt = new Date().toISOString();
    return alert;
  }

  /** Bulk acknowledge alerts. Returns count of successfully acknowledged. */
  bulkAcknowledge(ids: string[], userId: string): { acknowledged: number; failed: string[] } {
    let acknowledged = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        this.acknowledge(id, userId);
        acknowledged++;
      } catch {
        failed.push(id);
      }
    }
    return { acknowledged, failed };
  }

  /** Bulk resolve alerts. Returns count of successfully resolved. */
  bulkResolve(ids: string[], userId: string): { resolved: number; failed: string[] } {
    let resolved = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        this.resolve(id, userId);
        resolved++;
      } catch {
        failed.push(id);
      }
    }
    return { resolved, failed };
  }

  /** Compute alert statistics for a tenant. */
  stats(tenantId: string): AlertStats {
    const items = Array.from(this.alerts.values()).filter((a) => a.tenantId === tenantId);

    const bySeverity: Record<AlertSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    let open = 0, acknowledged = 0, resolved = 0, suppressed = 0, escalated = 0;
    let totalResolutionMs = 0;
    let resolvedCount = 0;

    for (const a of items) {
      bySeverity[a.severity]++;
      if (a.status === 'open') open++;
      else if (a.status === 'acknowledged') acknowledged++;
      else if (a.status === 'resolved') resolved++;
      else if (a.status === 'suppressed') suppressed++;
      else if (a.status === 'escalated') escalated++;

      if (a.resolvedAt) {
        totalResolutionMs += new Date(a.resolvedAt).getTime() - new Date(a.createdAt).getTime();
        resolvedCount++;
      }
    }

    const avgResolutionMinutes = resolvedCount > 0 ? Math.round(totalResolutionMs / resolvedCount / 60_000) : 0;

    return {
      total: items.length,
      open,
      acknowledged,
      resolved,
      suppressed,
      escalated,
      bySeverity,
      avgResolutionMinutes,
    };
  }

  /** Unsuppress alerts whose suppression window has expired. */
  unsuppressExpired(): number {
    let count = 0;
    const now = Date.now();
    for (const alert of this.alerts.values()) {
      if (alert.status === 'suppressed' && alert.suppressedUntil) {
        if (new Date(alert.suppressedUntil).getTime() <= now) {
          alert.status = 'open';
          alert.suppressedUntil = null;
          alert.suppressReason = null;
          alert.updatedAt = new Date().toISOString();
          count++;
        }
      }
    }
    return count;
  }

  private countByTenant(tenantId: string): number {
    let count = 0;
    for (const a of this.alerts.values()) {
      if (a.tenantId === tenantId) count++;
    }
    return count;
  }

  /** Clear all alerts (for testing). */
  clear(): void {
    this.alerts.clear();
  }
}
