/**
 * @module services/archive-store
 * @description In-memory archive manifest store (DECISION-013).
 * Tracks all archived data manifests with metadata.
 */
import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';

/** Archive manifest record. */
export interface ArchiveManifest {
  id: string;
  tenantId: string;
  entityType: string;
  recordCount: number;
  fileSizeBytes: number;
  compressionRatio: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  objectKey: string;
  status: 'completed' | 'restoring' | 'failed';
  createdAt: string;
  restoredAt?: string;
}

/** Filter options for listing manifests. */
export interface ManifestFilter {
  tenantId?: string;
  entityType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/** Aggregate archive statistics. */
export interface ArchiveStats {
  totalManifests: number;
  totalRecords: number;
  totalSizeBytes: number;
  byEntityType: Record<string, { count: number; records: number; sizeBytes: number }>;
  oldestArchive: string | null;
  newestArchive: string | null;
}

/**
 * In-memory manifest store for archive metadata.
 * Per DECISION-013: in-memory state for Phase 7 validation.
 */
export class ArchiveStore {
  private manifests = new Map<string, ArchiveManifest>();

  /** Create a new archive manifest. */
  create(data: Omit<ArchiveManifest, 'id' | 'createdAt'>): ArchiveManifest {
    const manifest: ArchiveManifest = {
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.manifests.set(manifest.id, manifest);
    return manifest;
  }

  /** Get a manifest by ID. */
  getById(id: string): ArchiveManifest | null {
    return this.manifests.get(id) ?? null;
  }

  /** List manifests with optional filters and pagination. */
  list(filter: ManifestFilter = {}): { data: ArchiveManifest[]; total: number } {
    let results = Array.from(this.manifests.values());

    if (filter.tenantId) {
      results = results.filter((m) => m.tenantId === filter.tenantId);
    }
    if (filter.entityType) {
      results = results.filter((m) => m.entityType === filter.entityType);
    }
    if (filter.status) {
      results = results.filter((m) => m.status === filter.status);
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = results.length;
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 50;
    const offset = (page - 1) * limit;
    const data = results.slice(offset, offset + limit);

    return { data, total };
  }

  /** Update manifest status. */
  updateStatus(id: string, status: ArchiveManifest['status'], extra?: Partial<ArchiveManifest>): ArchiveManifest {
    const manifest = this.manifests.get(id);
    if (!manifest) throw new AppError(404, `Manifest ${id} not found`, 'MANIFEST_NOT_FOUND');
    const updated = { ...manifest, status, ...extra };
    this.manifests.set(id, updated);
    return updated;
  }

  /** Delete a manifest record. */
  delete(id: string): boolean {
    return this.manifests.delete(id);
  }

  /** Compute aggregate archive statistics. */
  getStats(): ArchiveStats {
    const all = Array.from(this.manifests.values());
    const byEntityType: ArchiveStats['byEntityType'] = {};
    let totalRecords = 0;
    let totalSizeBytes = 0;

    for (const m of all) {
      totalRecords += m.recordCount;
      totalSizeBytes += m.fileSizeBytes;
      if (!byEntityType[m.entityType]) {
        byEntityType[m.entityType] = { count: 0, records: 0, sizeBytes: 0 };
      }
      const entry = byEntityType[m.entityType]!;
      entry.count++;
      entry.records += m.recordCount;
      entry.sizeBytes += m.fileSizeBytes;
    }

    const sorted = all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return {
      totalManifests: all.length,
      totalRecords,
      totalSizeBytes,
      byEntityType,
      oldestArchive: sorted[0]?.createdAt ?? null,
      newestArchive: sorted[sorted.length - 1]?.createdAt ?? null,
    };
  }

  /** Purge manifests older than retentionDays. Returns IDs of purged manifests. */
  purgeExpired(retentionDays: number): string[] {
    const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000;
    const purged: string[] = [];
    for (const [id, manifest] of this.manifests.entries()) {
      if (new Date(manifest.createdAt).getTime() < cutoff) {
        this.manifests.delete(id);
        purged.push(id);
      }
    }
    return purged;
  }

  /** Total manifest count. */
  size(): number {
    return this.manifests.size;
  }

  /** Clear all manifests. */
  clear(): void {
    this.manifests.clear();
  }
}
