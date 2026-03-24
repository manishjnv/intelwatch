/**
 * @module services/archive-engine
 * @description Cron-driven archival engine. Generates sample archive data,
 * compresses to JSONL+gzip, uploads to MinIO, and manages retention.
 * Per DECISION-013: uses in-memory data for Phase 7 validation.
 */
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as cron from 'node-cron';
import type * as Minio from 'minio';
import { getLogger } from '../logger.js';
import { ArchiveStore, type ArchiveManifest } from './archive-store.js';
import { uploadBuffer, downloadBuffer, deleteObject, getObjectInfo } from './minio-client.js';

/** Archive engine configuration. */
export interface ArchiveEngineConfig {
  bucket: string;
  ageDays: number;
  retentionDays: number;
  batchSize: number;
  cronExpression: string;
}

/** Archive job status. */
export interface ArchiveStatus {
  cronRunning: boolean;
  lastRunAt: string | null;
  lastRunResult: 'success' | 'failure' | null;
  lastRunRecords: number;
  nextRunAt: string | null;
  totalRuns: number;
}

/** Data record to archive (generic shape). */
export interface ArchiveRecord {
  id: string;
  type: string;
  value: string;
  tenantId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Archival engine managing the lifecycle of cold storage data.
 * Runs on a cron schedule and supports manual triggers.
 */
export class ArchiveEngine {
  private readonly minioClient: Minio.Client;
  private readonly bucket: string;
  private readonly store: ArchiveStore;
  private readonly config: ArchiveEngineConfig;
  private cronTask: cron.ScheduledTask | null = null;

  private lastRunAt: string | null = null;
  private lastRunResult: 'success' | 'failure' | null = null;
  private lastRunRecords = 0;
  private totalRuns = 0;

  constructor(
    minioClient: Minio.Client,
    store: ArchiveStore,
    config: ArchiveEngineConfig,
  ) {
    this.minioClient = minioClient;
    this.store = store;
    this.bucket = config.bucket;
    this.config = config;
  }

  /** Start the archive cron job. */
  startCron(): void {
    if (this.cronTask) return;
    this.cronTask = cron.schedule(this.config.cronExpression, () => {
      void this.runOnce();
    });
    getLogger().info({ cron: this.config.cronExpression }, 'Archive cron started');
  }

  /** Stop the archive cron job. */
  stopCron(): void {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      getLogger().info('Archive cron stopped');
    }
  }

  /**
   * Run a single archive cycle. Generates sample data for the configured
   * entity types, compresses as JSONL+gzip, and uploads to MinIO.
   * In production this would query PostgreSQL for records > ageDays old.
   */
  async runOnce(tenantId: string = 'default'): Promise<ArchiveManifest | null> {
    const logger = getLogger();
    const startTime = Date.now();
    this.totalRuns++;

    try {
      const entityTypes = ['ioc', 'threat_actor', 'malware', 'vulnerability', 'feed_article'];
      const manifests: ArchiveManifest[] = [];

      for (const entityType of entityTypes) {
        const records = this.generateSampleRecords(tenantId, entityType);
        if (records.length === 0) continue;

        const manifest = await this.archiveBatch(tenantId, entityType, records);
        manifests.push(manifest);
      }

      this.lastRunAt = new Date().toISOString();
      this.lastRunResult = 'success';
      this.lastRunRecords = manifests.reduce((sum, m) => sum + m.recordCount, 0);

      logger.info(
        { tenantId, manifests: manifests.length, records: this.lastRunRecords, durationMs: Date.now() - startTime },
        'Archive cycle completed',
      );

      return manifests[0] ?? null;
    } catch (err) {
      this.lastRunAt = new Date().toISOString();
      this.lastRunResult = 'failure';
      this.lastRunRecords = 0;
      logger.error({ err: (err as Error).message }, 'Archive cycle failed');
      return null;
    }
  }

  /** Archive a batch of records: JSONL → gzip → MinIO → manifest. */
  async archiveBatch(
    tenantId: string,
    entityType: string,
    records: ArchiveRecord[],
  ): Promise<ArchiveManifest> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const objectKey = `archive/${tenantId}/${entityType}/${dateStr}/${randomUUID()}.jsonl.gz`;

    const jsonl = records.map((r) => JSON.stringify(r)).join('\n');
    const rawSize = Buffer.byteLength(jsonl, 'utf-8');
    const compressed = gzipSync(Buffer.from(jsonl, 'utf-8'));
    const compressionRatio = rawSize > 0 ? Math.round((1 - compressed.length / rawSize) * 100) / 100 : 0;

    await uploadBuffer(this.minioClient, this.bucket, objectKey, compressed, {
      'x-amz-meta-tenant': tenantId,
      'x-amz-meta-entity-type': entityType,
      'x-amz-meta-record-count': String(records.length),
    });

    const dates = records.map((r) => r.createdAt).sort();

    return this.store.create({
      tenantId,
      entityType,
      recordCount: records.length,
      fileSizeBytes: compressed.length,
      compressionRatio,
      dateRangeStart: dates[0] ?? new Date().toISOString(),
      dateRangeEnd: dates[dates.length - 1] ?? new Date().toISOString(),
      objectKey,
      status: 'completed',
    });
  }

  /** Restore archived data from MinIO. Returns decompressed records. */
  async restore(manifestId: string): Promise<ArchiveRecord[]> {
    const manifest = this.store.getById(manifestId);
    if (!manifest) {
      throw new Error(`Manifest ${manifestId} not found`);
    }

    this.store.updateStatus(manifestId, 'restoring');

    try {
      const buffer = await downloadBuffer(this.minioClient, this.bucket, manifest.objectKey);
      const decompressed = gunzipSync(buffer).toString('utf-8');
      const records = decompressed
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as ArchiveRecord);

      this.store.updateStatus(manifestId, 'completed', { restoredAt: new Date().toISOString() });
      getLogger().info({ manifestId, records: records.length }, 'Archive restored');
      return records;
    } catch (err) {
      this.store.updateStatus(manifestId, 'failed');
      throw err;
    }
  }

  /** Enforce retention policy: delete archives and MinIO objects older than retentionDays. */
  async enforceRetention(): Promise<number> {
    const purgedIds = this.store.purgeExpired(this.config.retentionDays);
    let deletedObjects = 0;

    for (const id of purgedIds) {
      const manifest = this.store.getById(id);
      if (manifest?.objectKey) {
        try {
          await deleteObject(this.minioClient, this.bucket, manifest.objectKey);
          deletedObjects++;
        } catch {
          // Object may already be gone
        }
      }
    }

    if (purgedIds.length > 0) {
      getLogger().info(
        { purgedManifests: purgedIds.length, deletedObjects },
        'Retention enforcement completed',
      );
    }

    return purgedIds.length;
  }

  /** Get archive engine status. */
  getStatus(): ArchiveStatus {
    return {
      cronRunning: this.cronTask !== null,
      lastRunAt: this.lastRunAt,
      lastRunResult: this.lastRunResult,
      lastRunRecords: this.lastRunRecords,
      nextRunAt: this.cronTask ? new Date(Date.now() + 60000).toISOString() : null,
      totalRuns: this.totalRuns,
    };
  }

  /** Verify MinIO object exists for a manifest. */
  async verifyObject(objectKey: string): Promise<boolean> {
    const info = await getObjectInfo(this.minioClient, this.bucket, objectKey);
    return info !== null;
  }

  /** Generate sample records for archival testing (DECISION-013: in-memory). */
  private generateSampleRecords(tenantId: string, entityType: string): ArchiveRecord[] {
    const count = Math.floor(Math.random() * 50) + 10;
    const now = Date.now();
    const ageCutoff = this.config.ageDays * 24 * 3600 * 1000;

    return Array.from({ length: count }, (_, i) => ({
      id: randomUUID(),
      type: entityType,
      value: `sample-${entityType}-${i}`,
      tenantId,
      createdAt: new Date(now - ageCutoff - i * 86400000).toISOString(),
      metadata: { source: 'archive-engine-demo', index: i },
    }));
  }
}
