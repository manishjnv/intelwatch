import { AppError } from '@etip/shared-utils';
import type { WizardStore } from './wizard-store.js';
import type { WizardState } from '../schemas/onboarding.js';
import type { Redis } from 'ioredis';

/** Serialized checklist state for persistence. */
export interface ChecklistSnapshot {
  tenantId: string;
  wizardState: WizardState;
  savedAt: string;
  version: number;
}

const KEY_PREFIX = 'etip:';
const KEY_SUFFIX = ':checklist';

function redisKey(tenantId: string): string {
  return `${KEY_PREFIX}${tenantId}${KEY_SUFFIX}`;
}

/**
 * P0 #9: Saves/resumes onboarding state across sessions.
 * Redis-backed (S159d) via the same client WizardStore uses; falls back to
 * an in-memory Map only when no Redis client is injected (test mode).
 * Enables: browser tab close → reopen → resume at same step.
 */
export class ChecklistPersistence {
  /** tenantId → saved snapshots (last 10, in-memory cache) */
  private snapshots = new Map<string, ChecklistSnapshot[]>(); // memory-ok: cache — per-process copy of the tenant Redis key (Redis is the source of truth; memory-only when no Redis, i.e. tests)
  private redis: Redis | null;

  constructor(private wizardStore: WizardStore, redis?: Redis | null) {
    this.redis = redis ?? null;
  }

  /** Save current wizard state as a snapshot. */
  async save(tenantId: string): Promise<ChecklistSnapshot> {
    const wizard = await this.wizardStore.getOrCreate(tenantId);

    const existing = await this.getSnapshots(tenantId);
    const version = existing.length + 1;

    const snapshot: ChecklistSnapshot = {
      tenantId,
      wizardState: wizard,
      savedAt: new Date().toISOString(),
      version,
    };

    existing.push(snapshot);
    // Keep last 10 snapshots
    if (existing.length > 10) {
      existing.shift();
    }
    this.snapshots.set(tenantId, existing);
    await this.persist(tenantId);

    return snapshot;
  }

  /** Load the latest snapshot and restore wizard state. */
  async restore(tenantId: string): Promise<ChecklistSnapshot> {
    const snapshots = await this.getSnapshots(tenantId);
    if (snapshots.length === 0) {
      throw new AppError(404, 'No saved onboarding state found', 'CHECKLIST_NOT_FOUND');
    }

    return snapshots[snapshots.length - 1]!;
  }

  /** List all saved snapshots for a tenant. */
  async listSnapshots(tenantId: string): Promise<ChecklistSnapshot[]> {
    return (await this.getSnapshots(tenantId)).map((s) => ({ ...s }));
  }

  /** Get a specific snapshot version. */
  async getVersion(tenantId: string, version: number): Promise<ChecklistSnapshot> {
    const snapshots = await this.getSnapshots(tenantId);
    if (snapshots.length === 0) {
      throw new AppError(404, 'No saved onboarding state found', 'CHECKLIST_NOT_FOUND');
    }
    const snapshot = snapshots.find((s) => s.version === version);
    if (!snapshot) {
      throw new AppError(404, `Snapshot version ${version} not found`, 'SNAPSHOT_NOT_FOUND');
    }
    return { ...snapshot };
  }

  /** Delete all snapshots for a tenant. */
  async clear(tenantId: string): Promise<void> {
    this.snapshots.delete(tenantId);
    if (this.redis) {
      await this.redis.del(redisKey(tenantId));
    }
  }

  /** Check if tenant has any saved state. */
  async hasSavedState(tenantId: string): Promise<boolean> {
    const snapshots = await this.getSnapshots(tenantId);
    return snapshots.length > 0;
  }

  // ─── Private ──────────────────────────────────────────

  /** Get snapshots from cache, then Redis (mirrors WizardStore). */
  private async getSnapshots(tenantId: string): Promise<ChecklistSnapshot[]> {
    const cached = this.snapshots.get(tenantId);
    if (cached) return cached;

    if (this.redis) {
      const raw = await this.redis.get(redisKey(tenantId));
      if (raw) {
        const snapshots = JSON.parse(raw) as ChecklistSnapshot[];
        this.snapshots.set(tenantId, snapshots);
        return snapshots;
      }
    }

    return [];
  }

  /** Persist current snapshots to Redis (if available). */
  private async persist(tenantId: string): Promise<void> {
    if (!this.redis) return;
    const snapshots = this.snapshots.get(tenantId);
    if (!snapshots) return;
    await this.redis.set(redisKey(tenantId), JSON.stringify(snapshots));
  }
}
