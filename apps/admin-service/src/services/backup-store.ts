import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';

export type BackupType = 'full' | 'incremental' | 'schema';
export type BackupStatus = 'pending' | 'running' | 'completed' | 'failed';
export type RestoreStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BackupRecord {
  id: string;
  type: BackupType;
  status: BackupStatus;
  triggeredBy: string;
  notes?: string;
  sizeBytes?: number;
  path?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface RestoreRecord {
  id: string;
  backupId: string;
  status: RestoreStatus;
  requestedBy: string;
  notes?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface TriggerBackupInput {
  type: BackupType;
  triggeredBy: string;
  notes?: string;
}

export interface CompleteBackupInput {
  sizeBytes: number;
  path: string;
}

export interface InitiateRestoreInput {
  requestedBy: string;
  notes?: string;
}

export interface ListBackupOptions {
  limit?: number;
  type?: BackupType;
}

/** In-memory backup registry (DECISION-013). */
export class BackupStore {
  private _backups: Map<string, BackupRecord> = new Map();
  private _restores: Map<string, RestoreRecord> = new Map();
  private _seq = 0;

  /** Trigger a new backup. Returns a pending record. */
  trigger(input: TriggerBackupInput): BackupRecord {
    // Use a microsecond-precision timestamp to ensure sort order is deterministic
    const seq = ++this._seq;
    const ts = new Date();
    // Pad milliseconds with sequence to guarantee sort stability across rapid calls
    const createdAt = new Date(ts.getTime() + seq).toISOString();
    const record: BackupRecord = {
      id: randomUUID(),
      type: input.type,
      status: 'pending',
      triggeredBy: input.triggeredBy,
      notes: input.notes,
      createdAt,
    };
    this._backups.set(record.id, record);
    return record;
  }

  /** List backup records, newest first. */
  list(opts: ListBackupOptions = {}): BackupRecord[] {
    let records = Array.from(this._backups.values());
    if (opts.type) records = records.filter((r) => r.type === opts.type);
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (opts.limit) records = records.slice(0, opts.limit);
    return records;
  }

  /** Get a backup record by id. */
  getById(id: string): BackupRecord | undefined {
    return this._backups.get(id);
  }

  /** Mark a backup as completed with file details. */
  complete(id: string, input: CompleteBackupInput): BackupRecord | undefined {
    const record = this._backups.get(id);
    if (!record) return undefined;
    const updated: BackupRecord = {
      ...record,
      status: 'completed',
      sizeBytes: input.sizeBytes,
      path: input.path,
      completedAt: new Date().toISOString(),
    };
    this._backups.set(id, updated);
    return updated;
  }

  /** Mark a backup as failed. */
  fail(id: string, error: string): BackupRecord | undefined {
    const record = this._backups.get(id);
    if (!record) return undefined;
    const updated: BackupRecord = { ...record, status: 'failed', error };
    this._backups.set(id, updated);
    return updated;
  }

  /** Initiate a restore from a completed backup. Throws on invalid state. */
  initiateRestore(backupId: string, input: InitiateRestoreInput): RestoreRecord {
    const backup = this._backups.get(backupId);
    if (!backup) throw new AppError(404, `Backup not found: ${backupId}`, 'NOT_FOUND');
    if (backup.status !== 'completed') {
      throw new AppError(400, `Backup ${backupId} is not in completed state (current: ${backup.status})`, 'INVALID_STATE');
    }
    const restore: RestoreRecord = {
      id: randomUUID(),
      backupId,
      status: 'pending',
      requestedBy: input.requestedBy,
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };
    this._restores.set(restore.id, restore);
    return restore;
  }

  /** Get all restore records for a given backup. */
  getRestoresByBackup(backupId: string): RestoreRecord[] {
    return Array.from(this._restores.values()).filter((r) => r.backupId === backupId);
  }
}
