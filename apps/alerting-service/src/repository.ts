import { AppError } from '@etip/shared-utils';
import type { PrismaClient } from '@prisma/client';
import { getLogger } from './logger.js';
import type { AlertRule } from './services/rule-store.js';
import type { NotificationChannel } from './services/channel-store.js';
import type { EscalationPolicy } from './services/escalation-store.js';
import type { MaintenanceWindow } from './services/maintenance-store.js';
import type { ChannelCrypto } from './services/channel-crypto.js';
import type { Alert } from './services/alert-store.js';
import type { AlertStatus } from './schemas/alert.js';
import type { HistoryEntry } from './services/alert-history.js';
import type { AlertGroup } from './services/alert-group-store.js';
import { createRuleRepo, createChannelRepo, createEscalationRepo, createMaintenanceRepo } from './repository-prisma.js';
import { createAlertRepo, createAlertHistoryRepo, createAlertGroupRepo } from './repository-prisma-alerts.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `s` looks like a Postgres uuid column value. Legacy ids like 'default' fail this. */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * Runs a Prisma call, mapping any non-AppError failure to a 503 so callers never see
 * raw driver/connection errors. Step 3 decision D3: no fallback to memory — a down
 * DB is a hard failure for the caller, not a silent degrade.
 */
export async function dbCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    getLogger().error({ err }, 'Alerting database call failed');
    throw new AppError(503, 'Alerting database unavailable', 'DB_UNAVAILABLE');
  }
}

/** Storage abstraction shared by rule/channel/escalation/maintenance stores. */
export interface Repo<T extends { id: string; tenantId: string }> {
  /** All rows of one tenant. */
  list(tenantId: string): Promise<T[]>;
  get(id: string): Promise<T | null>;
  /** Insert or replace by id. */
  save(row: T): Promise<T>;
  delete(id: string): Promise<boolean>;
}

/** In-memory Repo — dev/test backend only. Production requires TI_DATABASE_URL (Step 3 D3). */
export class MemoryRepo<T extends { id: string; tenantId: string }> implements Repo<T> {
  private rows = new Map<string, T>(); // memory-ok: dev/test backend only — production requires TI_DATABASE_URL (Step 3 D3)

  async list(tenantId: string): Promise<T[]> {
    return Array.from(this.rows.values()).filter((r) => r.tenantId === tenantId);
  }

  async get(id: string): Promise<T | null> {
    return this.rows.get(id) ?? null;
  }

  async save(row: T): Promise<T> {
    this.rows.set(row.id, row);
    return row;
  }

  async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  /** Synchronous reset — test-only. */
  clear(): void {
    this.rows.clear();
  }
}

/** Patch of an alert's mutable columns (Step 3 S155). */
export type AlertPatch = Partial<Omit<Alert, 'id' | 'tenantId' | 'createdAt'>>;

/** Storage abstraction for the Alert lifecycle (Step 3 S155) — dedup, escalation and FSM state live on the row. */
export interface AlertRepo {
  get(id: string): Promise<Alert | null>;
  insert(row: Alert): Promise<Alert>;
  /** Patch only the given columns. With expectStatus, patches only if the row's status still equals it (optimistic FSM check); null when no row matched. */
  update(id: string, patch: AlertPatch, expectStatus?: AlertStatus): Promise<Alert | null>;
  /** All rows of one tenant, newest first. */
  list(tenantId: string): Promise<Alert[]>;
  count(tenantId: string): Promise<number>;
  /** Newest alert of the tenant with this fingerprint and lastSeenAt >= since. */
  findByFingerprint(tenantId: string, fingerprint: string, since: Date): Promise<Alert | null>;
  /** Atomic dedupCount+1, lastSeenAt=now. */
  incrementDedup(id: string, now: Date): Promise<Alert | null>;
  /** Cross-tenant: nextEscalationAt <= now, oldest first, at most `limit`. */
  listDueEscalations(now: Date, limit: number): Promise<Alert[]>;
  /** Cross-tenant: status 'suppressed' and suppressedUntil <= now → status 'open', clear suppressedUntil/suppressReason. Returns count. */
  unsuppressExpired(now: Date): Promise<number>;
}

/** Append-only audit trail for alert state changes (Step 3 S155). */
export interface AlertHistoryRepo {
  append(entry: HistoryEntry & { tenantId: string }): Promise<HistoryEntry>;
  /** Oldest first. */
  listByAlert(alertId: string): Promise<HistoryEntry[]>;
}

/** Groups related alerts by incident fingerprint (Step 3 S155). */
export interface AlertGroupRepo {
  get(id: string): Promise<AlertGroup | null>;
  insert(row: AlertGroup): Promise<AlertGroup>;
  list(tenantId: string): Promise<AlertGroup[]>;
  /** Newest (by firstAlertAt) group of the tenant with this fingerprint and status 'active'. */
  findActive(tenantId: string, fingerprint: string): Promise<AlertGroup | null>;
  /** Atomic append of alertId + lastAlertAt=now. */
  appendAlert(id: string, alertId: string, now: Date): Promise<AlertGroup | null>;
  setStatus(id: string, status: AlertGroup['status']): Promise<AlertGroup | null>;
}

/** In-memory AlertRepo — dev/test backend only. Production requires TI_DATABASE_URL (Step 3 D3). */
export class MemoryAlertRepo implements AlertRepo {
  private rows = new Map<string, Alert>(); // memory-ok: dev/test backend only — production requires TI_DATABASE_URL (Step 3 D3)

  async get(id: string): Promise<Alert | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async insert(row: Alert): Promise<Alert> {
    this.rows.set(row.id, { ...row });
    return { ...row };
  }

  async update(id: string, patch: AlertPatch, expectStatus?: AlertStatus): Promise<Alert | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    if (expectStatus !== undefined && row.status !== expectStatus) return null;
    const updated: Alert = { ...row, ...patch };
    this.rows.set(id, updated);
    return { ...updated };
  }

  async list(tenantId: string): Promise<Alert[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r }));
  }

  async count(tenantId: string): Promise<number> {
    let count = 0;
    for (const r of this.rows.values()) if (r.tenantId === tenantId) count++;
    return count;
  }

  async findByFingerprint(tenantId: string, fingerprint: string, since: Date): Promise<Alert | null> {
    const matches = Array.from(this.rows.values()).filter(
      (r) => r.tenantId === tenantId && r.fingerprint === fingerprint && new Date(r.lastSeenAt).getTime() >= since.getTime(),
    );
    if (matches.length === 0) return null;
    matches.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    return { ...matches[0]! };
  }

  async incrementDedup(id: string, now: Date): Promise<Alert | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const updated: Alert = { ...row, dedupCount: row.dedupCount + 1, lastSeenAt: now.toISOString() };
    this.rows.set(id, updated);
    return { ...updated };
  }

  async listDueEscalations(now: Date, limit: number): Promise<Alert[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.nextEscalationAt !== null && new Date(r.nextEscalationAt).getTime() <= now.getTime())
      .sort((a, b) => a.nextEscalationAt!.localeCompare(b.nextEscalationAt!))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async unsuppressExpired(now: Date): Promise<number> {
    let count = 0;
    for (const [id, row] of this.rows) {
      if (row.status === 'suppressed' && row.suppressedUntil && new Date(row.suppressedUntil).getTime() <= now.getTime()) {
        this.rows.set(id, { ...row, status: 'open', suppressedUntil: null, suppressReason: null });
        count++;
      }
    }
    return count;
  }

  /** Synchronous reset — test-only. */
  clear(): void {
    this.rows.clear();
  }
}

/** In-memory AlertHistoryRepo — dev/test backend only. Production requires TI_DATABASE_URL (Step 3 D3). */
export class MemoryAlertHistoryRepo implements AlertHistoryRepo {
  private rows: (HistoryEntry & { tenantId: string })[] = []; // memory-ok: dev/test backend only — production requires TI_DATABASE_URL (Step 3 D3)

  async append(entry: HistoryEntry & { tenantId: string }): Promise<HistoryEntry> {
    this.rows.push({ ...entry });
    return { ...entry };
  }

  async listByAlert(alertId: string): Promise<HistoryEntry[]> {
    return this.rows
      .filter((r) => r.alertId === alertId)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((r) => ({ ...r }));
  }

  /** Synchronous reset — test-only. */
  clear(): void {
    this.rows = [];
  }
}

/** In-memory AlertGroupRepo — dev/test backend only. Production requires TI_DATABASE_URL (Step 3 D3). */
export class MemoryAlertGroupRepo implements AlertGroupRepo {
  private rows = new Map<string, AlertGroup>(); // memory-ok: dev/test backend only — production requires TI_DATABASE_URL (Step 3 D3)

  async get(id: string): Promise<AlertGroup | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async insert(row: AlertGroup): Promise<AlertGroup> {
    this.rows.set(row.id, { ...row, alertIds: [...row.alertIds] });
    return { ...row };
  }

  async list(tenantId: string): Promise<AlertGroup[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => b.lastAlertAt.localeCompare(a.lastAlertAt))
      .map((r) => ({ ...r, alertIds: [...r.alertIds] }));
  }

  async findActive(tenantId: string, fingerprint: string): Promise<AlertGroup | null> {
    const matches = Array.from(this.rows.values()).filter(
      (r) => r.tenantId === tenantId && r.fingerprint === fingerprint && r.status === 'active',
    );
    if (matches.length === 0) return null;
    matches.sort((a, b) => b.firstAlertAt.localeCompare(a.firstAlertAt));
    return { ...matches[0]!, alertIds: [...matches[0]!.alertIds] };
  }

  async appendAlert(id: string, alertId: string, now: Date): Promise<AlertGroup | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const updated: AlertGroup = { ...row, alertIds: [...row.alertIds, alertId], lastAlertAt: now.toISOString() };
    this.rows.set(id, updated);
    return { ...updated, alertIds: [...updated.alertIds] };
  }

  async setStatus(id: string, status: AlertGroup['status']): Promise<AlertGroup | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const updated: AlertGroup = { ...row, status };
    this.rows.set(id, updated);
    return { ...updated, alertIds: [...updated.alertIds] };
  }

  /** Synchronous reset — test-only. */
  clear(): void {
    this.rows.clear();
  }
}

export interface AlertingRepos {
  rules: Repo<AlertRule>;
  channels: Repo<NotificationChannel>;
  escalations: Repo<EscalationPolicy>;
  maintenance: Repo<MaintenanceWindow>;
  alerts: AlertRepo;
  history: AlertHistoryRepo;
  groups: AlertGroupRepo;
}

/** Builds the seven Postgres-backed repos (Step 3 S154 + S155). Channel configs are encrypted via `crypto`. */
export function createPrismaRepos(prisma: PrismaClient, crypto: ChannelCrypto): AlertingRepos {
  return {
    rules: createRuleRepo(prisma),
    channels: createChannelRepo(prisma, crypto),
    escalations: createEscalationRepo(prisma),
    maintenance: createMaintenanceRepo(prisma),
    alerts: createAlertRepo(prisma),
    history: createAlertHistoryRepo(prisma),
    groups: createAlertGroupRepo(prisma),
  };
}
