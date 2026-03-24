import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArchiveEngine } from '../src/services/archive-engine.js';
import { ArchiveStore } from '../src/services/archive-store.js';
import { gunzipSync } from 'node:zlib';

// Mock MinIO client
function createMockMinioClient() {
  return {
    putObject: vi.fn().mockResolvedValue({}),
    getObject: vi.fn(),
    statObject: vi.fn(),
    removeObject: vi.fn().mockResolvedValue(undefined),
    listBuckets: vi.fn().mockResolvedValue([]),
    bucketExists: vi.fn().mockResolvedValue(true),
    makeBucket: vi.fn().mockResolvedValue(undefined),
    listObjectsV2: vi.fn(),
  };
}

const defaultConfig = {
  bucket: 'test-archive',
  ageDays: 60,
  retentionDays: 365,
  batchSize: 10000,
  cronExpression: '0 2 * * *',
};

describe('ArchiveEngine', () => {
  let engine: ArchiveEngine;
  let store: ArchiveStore;
  let mockMinio: ReturnType<typeof createMockMinioClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new ArchiveStore();
    mockMinio = createMockMinioClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine = new ArchiveEngine(mockMinio as any, store, defaultConfig);
  });

  describe('runOnce', () => {
    it('creates manifests for each entity type', async () => {
      const manifest = await engine.runOnce('tenant-1');
      expect(manifest).not.toBeNull();
      expect(store.size()).toBeGreaterThanOrEqual(1);
      expect(mockMinio.putObject).toHaveBeenCalled();
    });

    it('uploads gzipped JSONL to MinIO', async () => {
      await engine.runOnce('tenant-1');

      const putCall = mockMinio.putObject.mock.calls[0];
      expect(putCall[0]).toBe('test-archive'); // bucket
      expect(putCall[1]).toContain('archive/tenant-1/'); // object key
      const buffer = putCall[2] as Buffer;
      expect(buffer).toBeInstanceOf(Buffer);

      // Verify it's valid gzip
      const decompressed = gunzipSync(buffer).toString('utf-8');
      expect(decompressed).toContain('"type"');
      expect(decompressed).toContain('"tenantId":"tenant-1"');
    });

    it('creates manifests with correct metadata', async () => {
      await engine.runOnce('tenant-1');
      const { data } = store.list();
      const manifest = data[0];
      expect(manifest.tenantId).toBe('tenant-1');
      expect(manifest.status).toBe('completed');
      expect(manifest.recordCount).toBeGreaterThan(0);
      expect(manifest.fileSizeBytes).toBeGreaterThan(0);
      expect(manifest.compressionRatio).toBeGreaterThanOrEqual(0);
      expect(manifest.objectKey).toMatch(/^archive\/tenant-1\/.+\.jsonl\.gz$/);
      expect(manifest.dateRangeStart).toBeTruthy();
      expect(manifest.dateRangeEnd).toBeTruthy();
    });

    it('records status on failure', async () => {
      mockMinio.putObject.mockRejectedValueOnce(new Error('Upload failed'));
      const result = await engine.runOnce('tenant-1');
      // First entity type fails, so result may be null
      const status = engine.getStatus();
      expect(status.totalRuns).toBe(1);
      expect(status.lastRunAt).toBeTruthy();
    });

    it('updates totalRuns counter', async () => {
      await engine.runOnce();
      await engine.runOnce();
      expect(engine.getStatus().totalRuns).toBe(2);
    });
  });

  describe('archiveBatch', () => {
    it('produces valid JSONL format', async () => {
      const records = [
        { id: '1', type: 'ioc', value: '1.2.3.4', tenantId: 't1', createdAt: '2025-11-01T00:00:00Z' },
        { id: '2', type: 'ioc', value: '5.6.7.8', tenantId: 't1', createdAt: '2025-11-02T00:00:00Z' },
      ];

      const manifest = await engine.archiveBatch('t1', 'ioc', records);
      expect(manifest.recordCount).toBe(2);
      expect(manifest.entityType).toBe('ioc');

      const buffer = mockMinio.putObject.mock.calls[0][2] as Buffer;
      const lines = gunzipSync(buffer).toString('utf-8').split('\n').filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).value).toBe('1.2.3.4');
      expect(JSON.parse(lines[1]).value).toBe('5.6.7.8');
    });

    it('compresses data with gzip', async () => {
      const records = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`, type: 'ioc', value: `10.0.0.${i}`, tenantId: 't1',
        createdAt: '2025-11-01T00:00:00Z',
      }));

      const manifest = await engine.archiveBatch('t1', 'ioc', records);
      expect(manifest.compressionRatio).toBeGreaterThan(0);
      expect(manifest.fileSizeBytes).toBeGreaterThan(0);
    });

    it('sets date range from records', async () => {
      const records = [
        { id: '1', type: 'ioc', value: 'a', tenantId: 't1', createdAt: '2025-10-01T00:00:00Z' },
        { id: '2', type: 'ioc', value: 'b', tenantId: 't1', createdAt: '2025-12-31T00:00:00Z' },
      ];

      const manifest = await engine.archiveBatch('t1', 'ioc', records);
      expect(manifest.dateRangeStart).toBe('2025-10-01T00:00:00Z');
      expect(manifest.dateRangeEnd).toBe('2025-12-31T00:00:00Z');
    });
  });

  describe('restore', () => {
    it('decompresses and parses archived records', async () => {
      const records = [
        { id: '1', type: 'ioc', value: '1.2.3.4', tenantId: 't1', createdAt: '2025-11-01T00:00:00Z' },
      ];
      const manifest = await engine.archiveBatch('t1', 'ioc', records);

      // Mock getObject to return the same buffer that was uploaded
      const uploadedBuffer = mockMinio.putObject.mock.calls[0][2] as Buffer;
      const mockStream = {
        on: vi.fn().mockImplementation(function (this: Record<string, (...args: unknown[]) => void>, event: string, cb: (...args: unknown[]) => void) {
          if (event === 'data') cb(uploadedBuffer);
          if (event === 'end') cb();
          return this;
        }),
      };
      mockMinio.getObject.mockResolvedValueOnce(mockStream);

      const restored = await engine.restore(manifest.id);
      expect(restored).toHaveLength(1);
      expect(restored[0].value).toBe('1.2.3.4');
    });

    it('updates manifest status to restoring then completed', async () => {
      const records = [
        { id: '1', type: 'ioc', value: 'x', tenantId: 't1', createdAt: '2025-11-01T00:00:00Z' },
      ];
      const manifest = await engine.archiveBatch('t1', 'ioc', records);

      const uploadedBuffer = mockMinio.putObject.mock.calls[0][2] as Buffer;
      const mockStream = {
        on: vi.fn().mockImplementation(function (this: Record<string, (...args: unknown[]) => void>, event: string, cb: (...args: unknown[]) => void) {
          if (event === 'data') cb(uploadedBuffer);
          if (event === 'end') cb();
          return this;
        }),
      };
      mockMinio.getObject.mockResolvedValueOnce(mockStream);

      await engine.restore(manifest.id);
      const updated = store.getById(manifest.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.restoredAt).toBeTruthy();
    });

    it('throws for non-existent manifest', async () => {
      await expect(engine.restore('bad-id')).rejects.toThrow('Manifest bad-id not found');
    });
  });

  describe('getStatus', () => {
    it('reports cron not running by default', () => {
      const status = engine.getStatus();
      expect(status.cronRunning).toBe(false);
      expect(status.lastRunAt).toBeNull();
      expect(status.totalRuns).toBe(0);
    });

    it('reports cron running after start', () => {
      engine.startCron();
      expect(engine.getStatus().cronRunning).toBe(true);
      engine.stopCron();
    });

    it('updates after runOnce', async () => {
      await engine.runOnce();
      const status = engine.getStatus();
      expect(status.lastRunAt).toBeTruthy();
      expect(status.lastRunResult).toBe('success');
      expect(status.lastRunRecords).toBeGreaterThan(0);
    });
  });

  describe('startCron / stopCron', () => {
    it('starts and stops without error', () => {
      engine.startCron();
      expect(engine.getStatus().cronRunning).toBe(true);
      engine.stopCron();
      expect(engine.getStatus().cronRunning).toBe(false);
    });

    it('is idempotent', () => {
      engine.startCron();
      engine.startCron(); // no-op
      expect(engine.getStatus().cronRunning).toBe(true);
      engine.stopCron();
    });
  });
});
