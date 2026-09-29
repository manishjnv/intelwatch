import { AppError } from '@etip/shared-utils';
import type { PrismaClient } from '@prisma/client';
import { getLogger } from './logger.js';
import type { AlertRule } from './services/rule-store.js';
import type { NotificationChannel } from './services/channel-store.js';
import type { EscalationPolicy } from './services/escalation-store.js';
import type { MaintenanceWindow } from './services/maintenance-store.js';
import type { ChannelCrypto } from './services/channel-crypto.js';
import { createRuleRepo, createChannelRepo, createEscalationRepo, createMaintenanceRepo } from './repository-prisma.js';

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

export interface AlertingRepos {
  rules: Repo<AlertRule>;
  channels: Repo<NotificationChannel>;
  escalations: Repo<EscalationPolicy>;
  maintenance: Repo<MaintenanceWindow>;
}

/** Builds the four Postgres-backed repos (Step 3 S154). Channel configs are encrypted via `crypto`. */
export function createPrismaRepos(prisma: PrismaClient, crypto: ChannelCrypto): AlertingRepos {
  return {
    rules: createRuleRepo(prisma),
    channels: createChannelRepo(prisma, crypto),
    escalations: createEscalationRepo(prisma),
    maintenance: createMaintenanceRepo(prisma),
  };
}
