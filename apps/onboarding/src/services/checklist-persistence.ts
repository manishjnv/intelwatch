import { AppError } from '@etip/shared-utils';
import type { WizardStore } from './wizard-store.js';
import type { WizardState } from '../schemas/onboarding.js';

/** Serialized checklist state for persistence. */
export interface ChecklistSnapshot {
  tenantId: string;
  wizardState: WizardState;
  savedAt: string;
  version: number;
}

/**
 * P0 #9: Saves/resumes onboarding state across sessions.
 * In-memory for Phase 6. Production: Redis or PostgreSQL.
 * Enables: browser tab close → reopen → resume at same step.
 */
export class ChecklistPersistence {
  /** tenantId → saved snapshots (last 10) */
  private snapshots = new Map<string, ChecklistSnapshot[]>();

  constructor(private wizardStore: WizardStore) {}

  /** Save current wizard state as a snapshot. */
  save(tenantId: string): ChecklistSnapshot {
    const wizard = this.wizardStore.getOrCreate(tenantId);

    const existing = this.snapshots.get(tenantId) ?? [];
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

    return snapshot;
  }

  /** Load the latest snapshot and restore wizard state. */
  restore(tenantId: string): ChecklistSnapshot {
    const snapshots = this.snapshots.get(tenantId);
    if (!snapshots || snapshots.length === 0) {
      throw new AppError(404, 'No saved onboarding state found', 'CHECKLIST_NOT_FOUND');
    }

    const latest = snapshots[snapshots.length - 1]!;
    return latest;
  }

  /** List all saved snapshots for a tenant. */
  listSnapshots(tenantId: string): ChecklistSnapshot[] {
    return (this.snapshots.get(tenantId) ?? []).map((s) => ({ ...s }));
  }

  /** Get a specific snapshot version. */
  getVersion(tenantId: string, version: number): ChecklistSnapshot {
    const snapshots = this.snapshots.get(tenantId);
    if (!snapshots) {
      throw new AppError(404, 'No saved onboarding state found', 'CHECKLIST_NOT_FOUND');
    }
    const snapshot = snapshots.find((s) => s.version === version);
    if (!snapshot) {
      throw new AppError(404, `Snapshot version ${version} not found`, 'SNAPSHOT_NOT_FOUND');
    }
    return { ...snapshot };
  }

  /** Delete all snapshots for a tenant. */
  clear(tenantId: string): void {
    this.snapshots.delete(tenantId);
  }

  /** Check if tenant has any saved state. */
  hasSavedState(tenantId: string): boolean {
    const snapshots = this.snapshots.get(tenantId);
    return snapshots !== undefined && snapshots.length > 0;
  }
}
