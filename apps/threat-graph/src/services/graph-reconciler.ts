import { randomUUID } from 'node:crypto';
import { createSession } from '../driver.js';
import { getMigrationStatus } from '../migrations/runner.js';
import { AppError } from '@etip/shared-utils';
import type { IocClient } from '../clients/ioc-client.js';
import type { GraphSyncWriter, ApplyPlansResult } from './graph-sync.js';
import { mapIocRecord, type IocGraphPlan } from './ioc-graph-mapper.js';
import type pino from 'pino';

export interface ReconcilerConfig {
  intervalMs: number;
  fullSyncIntervalMs: number;
  pageSize: number;
}

export interface TenantSyncState {
  watermark: string | null;
  lastRunAt: string | null;
  lastRunType: 'full' | 'incremental' | null;
  lastFullSyncAt: string | null;
  lastCounts: ApplyPlansResult | null;
  lastError: string | null;
}

const LOCK_NAME = 'graph-reconcile';
const WATERMARK_OVERLAP_MS = 5 * 60_000;
const SWEEP_MIN_COVERAGE = 0.9;

/**
 * Periodic IOC → graph reconciler (S171 P3b). Runs full or incremental
 * sweeps per tenant, coordinated across replicas via a Neo4j lease.
 */
export class GraphReconciler {
  private readonly ownerId = randomUUID();
  private readonly runningTenants = new Set<string>();
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private migrationsWarned = false;
  private globalRunning = false;

  constructor(
    private readonly client: IocClient,
    private readonly writer: GraphSyncWriter,
    private readonly cfg: ReconcilerConfig,
    private readonly logger: pino.Logger,
  ) {}

  start(): void {
    if (this.timeout || this.interval) return;
    this.timeout = setTimeout(() => {
      void this.runOnce();
      this.interval = setInterval(() => void this.runOnce(), this.cfg.intervalMs);
    }, 60_000);
  }

  stop(): void {
    if (this.timeout) { clearTimeout(this.timeout); this.timeout = null; }
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  /**
   * Triggers a full sweep for one tenant, shared with the scheduled path via the same per-tenant
   * lease. Resolves once the lease is acquired (throws 409 if it's already held — by this instance's
   * scheduled pass or another replica) and continues the sweep in the background.
   */
  async triggerFullSync(tenantId: string): Promise<void> {
    if (this.runningTenants.has(tenantId)) {
      throw new AppError(409, 'A graph sync is already in progress for this tenant', 'SYNC_IN_PROGRESS');
    }
    const leaseName = this.tenantLeaseName(tenantId);
    this.runningTenants.add(tenantId);
    const owned = await this.acquireLease(leaseName, 2 * this.cfg.intervalMs);
    if (!owned) {
      this.runningTenants.delete(tenantId);
      throw new AppError(409, 'A graph sync is already in progress for this tenant', 'SYNC_IN_PROGRESS');
    }
    void this.runManualTenantSync(tenantId, leaseName);
  }

  private async runManualTenantSync(tenantId: string, leaseName: string): Promise<void> {
    try {
      await this.processTenant(tenantId, true, leaseName, false);
    } catch (err) {
      this.logger.error({ tenantId, err }, 'Manually-triggered full graph sync failed');
    } finally {
      await this.releaseLease(leaseName).catch(() => {});
      this.runningTenants.delete(tenantId);
    }
  }

  async getState(tenantId: string): Promise<TenantSyncState | null> {
    return this.loadState(tenantId);
  }

  /** One scheduled reconcile pass over all tenants. */
  async runOnce(): Promise<void> {
    if (this.globalRunning) return;
    if (getMigrationStatus() === null) {
      if (!this.migrationsWarned) {
        this.logger.error('Graph reconciler refusing to run — graph migrations have not succeeded');
        this.migrationsWarned = true;
      }
      return;
    }

    const gotLease = await this.acquireLease(LOCK_NAME, 2 * this.cfg.intervalMs);
    if (!gotLease) return;

    this.globalRunning = true;
    const startedAt = Date.now();
    try {
      const tenants = await this.client.listTenants();
      let ok = 0, failed = 0;
      for (const t of tenants) {
        if (this.runningTenants.has(t.tenantId)) continue; // manually triggered elsewhere
        const leaseName = this.tenantLeaseName(t.tenantId);
        this.runningTenants.add(t.tenantId);
        const owned = await this.acquireLease(leaseName, 2 * this.cfg.intervalMs);
        if (!owned) {
          this.runningTenants.delete(t.tenantId);
          this.logger.info({ tenantId: t.tenantId }, 'Tenant graph lease held elsewhere — skipping scheduled pass');
          continue;
        }
        try {
          await this.processTenant(t.tenantId, false, leaseName, true);
          ok++;
        } catch (err) {
          failed++;
          this.logger.error({ tenantId: t.tenantId, err }, 'Graph reconcile failed for tenant');
        } finally {
          // A failed release must not abort the remaining tenants; the lease expires on its own.
          await this.releaseLease(leaseName).catch((err) => this.logger.warn({ tenantId: t.tenantId, err }, 'Tenant lease release failed'));
          this.runningTenants.delete(t.tenantId);
        }
      }
      this.logger.info({ tenants: tenants.length, ok, failed, durationMs: Date.now() - startedAt }, 'Graph reconcile pass complete');
    } finally {
      this.globalRunning = false;
      await this.releaseLease(LOCK_NAME);
    }
  }

  private tenantLeaseName(tenantId: string): string {
    return `graph-reconcile:tenant:${tenantId}`;
  }

  /**
   * Runs one tenant's sweep. Caller already holds `leaseName` (acquired before this is called) and
   * is responsible for releasing it and clearing `runningTenants` when this returns/throws.
   * `renewGlobal` renews the scheduled-pass global lease too (manual triggers don't hold it).
   */
  private async processTenant(tenantId: string, forceFull: boolean, leaseName: string, renewGlobal: boolean): Promise<void> {
    const runStartedAt = Date.now();
    const leaseTtl = 2 * this.cfg.intervalMs;
    try {
      const state = await this.loadState(tenantId);
      const isFull = forceFull
        || !state?.lastFullSyncAt
        || (runStartedAt - new Date(state.lastFullSyncAt).getTime()) >= this.cfg.fullSyncIntervalMs;
      const runId = isFull ? randomUUID() : undefined;
      const updatedSince = isFull ? undefined : (state?.watermark ?? undefined);

      const counts: ApplyPlansResult = { nodesUpserted: 0, entitiesUpserted: 0, edgesMerged: 0, edgesPruned: 0, nodesDeleted: 0 };
      let page = 1;
      let fetched = 0;
      let applied = 0;
      let expectedTotal = 0;
      for (;;) {
        const { items, total, rawCount } = await this.client.listIocs(tenantId, { page, limit: this.cfg.pageSize, updatedSince });
        if (page === 1) expectedTotal = total;
        fetched += items.length;
        const plans = items.map(mapIocRecord).filter((p): p is IocGraphPlan => p !== null);
        applied += plans.length;
        if (plans.length > 0) {
          const r = await this.writer.applyPlans(tenantId, plans, runId);
          counts.nodesUpserted += r.nodesUpserted;
          counts.entitiesUpserted += r.entitiesUpserted;
          counts.edgesMerged += r.edgesMerged;
          counts.edgesPruned += r.edgesPruned;
          counts.nodesDeleted += r.nodesDeleted;
        }
        await this.renewLease(leaseName, leaseTtl);
        if (renewGlobal) await this.renewLease(LOCK_NAME, leaseTtl);
        // Page off rawCount (records actually returned by the HTTP page), never off items.length —
        // a page whose records are all invalid/tenant-mismatched must not look like the last page.
        if (rawCount < this.cfg.pageSize) break;
        page++;
      }

      // Deletion sweep only when the run provably applied (nearly) the whole source set — a
      // truncated/empty read, or one where records were dropped (outage, tenant mismatch, bad
      // shape), must never wipe a tenant's graph. `applied` (not `fetched`) is what was actually
      // written, so mapper-skipped records can't inflate coverage.
      if (isFull) {
        if (applied > 0 && applied >= SWEEP_MIN_COVERAGE * expectedTotal) {
          counts.nodesDeleted += await this.writer.sweepDeleted(tenantId, runId!);
        } else {
          this.logger.warn({ tenantId, fetched, applied, expectedTotal }, 'Full graph sync applied too few IOCs — deletion sweep skipped');
        }
      }
      await this.writer.rollupEntityRisk(tenantId);

      const nowIso = new Date(runStartedAt).toISOString();
      await this.saveState(tenantId, {
        watermark: new Date(runStartedAt - WATERMARK_OVERLAP_MS).toISOString(),
        lastRunAt: nowIso,
        lastRunType: isFull ? 'full' : 'incremental',
        lastFullSyncAt: isFull ? nowIso : (state?.lastFullSyncAt ?? null),
        lastCounts: counts,
        lastError: null,
      });
      this.logger.info({ tenantId, isFull, counts, durationMs: Date.now() - runStartedAt }, 'Graph reconcile tenant run complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.saveState(tenantId, { lastError: message, lastRunAt: new Date().toISOString() }).catch(() => {});
      throw err;
    }
  }

  /** Generalised Neo4j lease: acquires `name` for this instance's ownerId if free/expired. */
  private async acquireLease(name: string, ttlMs: number): Promise<boolean> {
    const session = createSession();
    try {
      const now = Date.now();
      const until = now + ttlMs;
      const res = await session.run(
        `MERGE (l:_GraphLock {name: $name})
         WITH l WHERE l.expiresAt IS NULL OR l.expiresAt < $now
         SET l.owner = $owner, l.expiresAt = $until
         RETURN l.owner AS owner`,
        { name, now, until, owner: this.ownerId },
      );
      return res.records.length > 0 && res.records[0]!.get('owner') === this.ownerId;
    } finally {
      await session.close();
    }
  }

  /** Extends `name`'s TTL — only while still owned by this instance. */
  private async renewLease(name: string, ttlMs: number): Promise<void> {
    const session = createSession();
    try {
      const until = Date.now() + ttlMs;
      await session.run(
        `MATCH (l:_GraphLock {name: $name, owner: $owner}) SET l.expiresAt = $until`,
        { name, owner: this.ownerId, until },
      );
    } finally {
      await session.close();
    }
  }

  /** Releases `name` — only while still owned by this instance. */
  private async releaseLease(name: string): Promise<void> {
    const session = createSession();
    try {
      await session.run(
        `MATCH (l:_GraphLock {name: $name, owner: $owner}) SET l.expiresAt = 0`,
        { name, owner: this.ownerId },
      );
    } finally {
      await session.close();
    }
  }

  private async loadState(tenantId: string): Promise<TenantSyncState | null> {
    const session = createSession();
    try {
      const res = await session.run(`MATCH (s:_GraphSyncState {stateTenantId: $tenantId}) RETURN s`, { tenantId });
      if (res.records.length === 0) return null;
      const props = res.records[0]!.get('s').properties as Record<string, unknown>;
      return {
        watermark: (props['watermark'] as string) ?? null,
        lastRunAt: (props['lastRunAt'] as string) ?? null,
        lastRunType: (props['lastRunType'] as 'full' | 'incremental') ?? null,
        lastFullSyncAt: (props['lastFullSyncAt'] as string) ?? null,
        lastCounts: props['lastCounts'] ? JSON.parse(props['lastCounts'] as string) : null,
        lastError: (props['lastError'] as string) ?? null,
      };
    } finally {
      await session.close();
    }
  }

  private async saveState(tenantId: string, patch: Partial<TenantSyncState>): Promise<void> {
    const session = createSession();
    try {
      const props: Record<string, unknown> = { ...patch };
      if ('lastCounts' in patch) props['lastCounts'] = patch.lastCounts ? JSON.stringify(patch.lastCounts) : null;
      await session.run(
        `MERGE (s:_GraphSyncState {stateTenantId: $tenantId}) SET s += $props`,
        { tenantId, props },
      );
    } finally {
      await session.close();
    }
  }
}
