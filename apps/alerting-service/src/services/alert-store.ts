import { randomUUID, createHash } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { AlertSeverity, AlertStatus } from '../schemas/alert.js';
import { MemoryAlertRepo, type AlertRepo } from '../repository.js';

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
  fingerprint: string | null;
  dedupCount: number;
  lastSeenAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  suppressedUntil: string | null;
  suppressReason: string | null;
  escalationLevel: number;
  escalatedAt: string | null;
  escalationPolicyId: string | null;
  escalationStep: number;
  nextEscalationAt: string | null;
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
  fingerprint?: string;
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

export interface SetEscalationPatch {
  escalationPolicyId?: string | null;
  escalationStep?: number;
  nextEscalationAt: string | null;
}

/** Sort object keys for consistent hashing (moved from the removed DedupStore). */
function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}

/** Dedup fingerprint from rule + severity + source fields (moved from the removed DedupStore). */
export function alertFingerprint(ruleId: string, severity: string, source?: Record<string, unknown>): string {
  const sourceKey = source ? JSON.stringify(sortKeys(source)) : '';
  const raw = `${ruleId}|${severity}|${sourceKey}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Alert lifecycle store (Step 3 S155). Backed by Postgres via `repo` in production;
 * an in-memory MemoryAlertRepo when no repo is injected (dev/test only).
 * Dedup counts and escalation scheduling live as columns on the alert row.
 */
export class AlertStore {
  constructor(
    private readonly repo: AlertRepo = new MemoryAlertRepo(),
    private readonly maxPerTenant: number = 5000,
    private readonly dedupWindowMinutes: number = 5,
  ) {}

  /** Create a new alert in 'open' status. */
  async create(input: CreateAlertInput): Promise<Alert> {
    const tenantCount = await this.repo.count(input.tenantId);
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
      fingerprint: input.fingerprint ?? null,
      dedupCount: 1,
      lastSeenAt: now,
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedBy: null,
      resolvedAt: null,
      suppressedUntil: null,
      suppressReason: null,
      escalationLevel: 0,
      escalatedAt: null,
      escalationPolicyId: null,
      escalationStep: 0,
      nextEscalationAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return this.repo.insert(alert);
  }

  /** Get alert by ID, optionally scoped to a tenant. */
  async getById(id: string, tenantId?: string): Promise<Alert | undefined> {
    const alert = await this.repo.get(id);
    if (!alert) return undefined;
    if (tenantId !== undefined && alert.tenantId !== tenantId) return undefined;
    return alert;
  }

  /** List alerts for a tenant with filters. */
  // ponytail: filters/sort/paginate in JS over the tenant's rows; fine up to the 5,000-per-tenant cap,
  // push filters into SQL if that grows.
  async list(tenantId: string, opts: ListAlertsOptions): Promise<ListAlertsResult> {
    let items = await this.repo.list(tenantId);

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

  /** Transition alert to a new status (enforces FSM), scoped to a tenant. */
  private async transition(id: string, newStatus: AlertStatus, tenantId: string | undefined, extra: Partial<Alert> = {}): Promise<Alert> {
    const alert = await this.getById(id, tenantId);
    if (!alert) throw new AppError(404, `Alert not found: ${id}`, 'NOT_FOUND');

    const allowed = VALID_TRANSITIONS[alert.status];
    if (!allowed.includes(newStatus)) {
      throw new AppError(409, `Cannot transition from '${alert.status}' to '${newStatus}'`, 'INVALID_TRANSITION');
    }

    const patch: Partial<Alert> = { status: newStatus, updatedAt: new Date().toISOString(), ...extra };
    const updated = await this.repo.update(id, patch, alert.status);
    if (!updated) throw new AppError(409, 'Alert changed concurrently, retry', 'CONFLICT');
    return updated;
  }

  /** Acknowledge an alert. */
  async acknowledge(id: string, userId: string, tenantId?: string): Promise<Alert> {
    return this.transition(id, 'acknowledged', tenantId, {
      acknowledgedBy: userId,
      acknowledgedAt: new Date().toISOString(),
      nextEscalationAt: null,
    });
  }

  /** Resolve an alert. */
  async resolve(id: string, userId: string, tenantId?: string): Promise<Alert> {
    return this.transition(id, 'resolved', tenantId, {
      resolvedBy: userId,
      resolvedAt: new Date().toISOString(),
      nextEscalationAt: null,
    });
  }

  /** Suppress an alert for a duration. */
  async suppress(id: string, durationMinutes: number, reason: string | undefined, tenantId?: string): Promise<Alert> {
    return this.transition(id, 'suppressed', tenantId, {
      suppressedUntil: new Date(Date.now() + durationMinutes * 60_000).toISOString(),
      suppressReason: reason ?? null,
    });
  }

  /** Manually escalate an alert. */
  async escalate(id: string, tenantId?: string): Promise<Alert> {
    const alert = await this.getById(id, tenantId);
    if (!alert) throw new AppError(404, `Alert not found: ${id}`, 'NOT_FOUND');
    return this.transition(id, 'escalated', tenantId, {
      escalationLevel: alert.escalationLevel + 1,
      escalatedAt: new Date().toISOString(),
    });
  }

  /** Bulk acknowledge alerts, tenant-scoped. Returns count of successfully acknowledged. */
  async bulkAcknowledge(ids: string[], userId: string, tenantId?: string): Promise<{ acknowledged: number; failed: string[] }> {
    let acknowledged = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await this.acknowledge(id, userId, tenantId);
        acknowledged++;
      } catch (err) {
        if (err instanceof AppError && err.code === 'DB_UNAVAILABLE') throw err;
        failed.push(id);
      }
    }
    return { acknowledged, failed };
  }

  /** Bulk resolve alerts, tenant-scoped. Returns count of successfully resolved. */
  async bulkResolve(ids: string[], userId: string, tenantId?: string): Promise<{ resolved: number; failed: string[] }> {
    let resolved = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await this.resolve(id, userId, tenantId);
        resolved++;
      } catch (err) {
        if (err instanceof AppError && err.code === 'DB_UNAVAILABLE') throw err;
        failed.push(id);
      }
    }
    return { resolved, failed };
  }

  /** Compute alert statistics for a tenant. */
  async stats(tenantId: string): Promise<AlertStats> {
    const items = await this.repo.list(tenantId);

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

    return { total: items.length, open, acknowledged, resolved, suppressed, escalated, bySeverity, avgResolutionMinutes };
  }

  /** Unsuppress alerts (all tenants) whose suppression window has expired. */
  async unsuppressExpired(): Promise<number> {
    return this.repo.unsuppressExpired(new Date());
  }

  /** Full-text search across title, description, and ruleName. */
  async search(tenantId: string, query: string, opts: { page: number; limit: number }): Promise<ListAlertsResult> {
    const q = query.toLowerCase();
    const items = (await this.repo.list(tenantId))
      .filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.ruleName.toLowerCase().includes(q),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = items.length;
    const totalPages = Math.ceil(total / opts.limit) || 1;
    const start = (opts.page - 1) * opts.limit;
    const data = items.slice(start, start + opts.limit);

    return { data, total, page: opts.page, limit: opts.limit, totalPages };
  }

  /** Find the most recent duplicate within the dedup window, or undefined if none. */
  async findDuplicate(tenantId: string, fingerprint: string): Promise<Alert | undefined> {
    const since = new Date(Date.now() - this.dedupWindowMinutes * 60_000);
    const found = await this.repo.findByFingerprint(tenantId, fingerprint, since);
    return found ?? undefined;
  }

  /** Record a duplicate hit: dedupCount+1, lastSeenAt=now. */
  async recordDuplicate(id: string): Promise<Alert | undefined> {
    const updated = await this.repo.incrementDedup(id, new Date());
    return updated ?? undefined;
  }

  /** Set escalation policy/step/next-run for an alert (replaces EscalationDispatcher.track's own state). */
  async setEscalation(id: string, patch: SetEscalationPatch): Promise<Alert | undefined> {
    const updated = await this.repo.update(id, { ...patch, updatedAt: new Date().toISOString() });
    return updated ?? undefined;
  }

  /** Alerts across all tenants due for an escalation check. */
  async listDueEscalations(now: Date = new Date(), limit = 500): Promise<Alert[]> {
    return this.repo.listDueEscalations(now, limit);
  }

  /**
   * Auto-escalate an alert from the escalation dispatcher: open/acknowledged transition to
   * 'escalated' like a manual escalate; an already-escalated alert just bumps its level.
   */
  async autoEscalate(alert: Alert): Promise<Alert> {
    if (alert.status === 'open' || alert.status === 'acknowledged') {
      return this.transition(alert.id, 'escalated', undefined, {
        escalationLevel: alert.escalationLevel + 1,
        escalatedAt: new Date().toISOString(),
      });
    }
    if (alert.status === 'escalated') {
      const updated = await this.repo.update(alert.id, {
        escalationLevel: alert.escalationLevel + 1,
        escalatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return updated ?? alert;
    }
    return alert;
  }

  /** Clear all alerts (test-only; only affects the in-memory backend). */
  clear(): void {
    if (this.repo instanceof MemoryAlertRepo) this.repo.clear();
  }
}
