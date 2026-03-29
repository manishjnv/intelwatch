/**
 * @module audit-replication.test
 * @description Tests for S3 audit log replication (I-15).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/prisma.js', () => ({
  prisma: {
    auditLog: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

describe('buildS3Key', () => {
  it('formats key with date padding', async () => {
    const { buildS3Key } = await import('../src/audit-replication.js');
    const key = buildS3Key('tenant-1', new Date('2026-03-05T10:30:00Z'), 'audit-123');
    expect(key).toBe('tenant-1/2026/03/05/audit-123.json');
  });

  it('pads single-digit months and days', async () => {
    const { buildS3Key } = await import('../src/audit-replication.js');
    const key = buildS3Key('t-1', new Date('2026-01-09T00:00:00Z'), 'a-1');
    expect(key).toBe('t-1/2026/01/09/a-1.json');
  });
});

describe('getS3Config', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('returns null when env vars missing', async () => {
    delete process.env.TI_AUDIT_S3_ENDPOINT;
    delete process.env.TI_AUDIT_S3_REGION;
    delete process.env.TI_AUDIT_S3_ACCESS_KEY;
    delete process.env.TI_AUDIT_S3_SECRET_KEY;
    delete process.env.TI_AUDIT_S3_BUCKET;
    const { getS3Config } = await import('../src/audit-replication.js');
    expect(getS3Config()).toBeNull();
  });

  it('returns config when all vars set', async () => {
    process.env.TI_AUDIT_S3_ENDPOINT = 'http://minio:9000';
    process.env.TI_AUDIT_S3_REGION = 'us-east-1';
    process.env.TI_AUDIT_S3_ACCESS_KEY = 'key';
    process.env.TI_AUDIT_S3_SECRET_KEY = 'secret';
    process.env.TI_AUDIT_S3_BUCKET = 'audit';
    const { getS3Config } = await import('../src/audit-replication.js');
    const config = getS3Config();
    expect(config).not.toBeNull();
    expect(config!.bucket).toBe('audit');
  });

  it('returns null with partial config', async () => {
    process.env.TI_AUDIT_S3_ENDPOINT = 'http://minio:9000';
    delete process.env.TI_AUDIT_S3_REGION;
    const { getS3Config } = await import('../src/audit-replication.js');
    expect(getS3Config()).toBeNull();
  });
});

describe('replicateAuditLog', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('logs warning when S3 not configured', async () => {
    delete process.env.TI_AUDIT_S3_ENDPOINT;
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { replicateAuditLog } = await import('../src/audit-replication.js');
    await replicateAuditLog('audit-1', 'tenant-1');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('S3 not configured'));
    spy.mockRestore();
  });

  it('logs warning when audit log not found', async () => {
    process.env.TI_AUDIT_S3_ENDPOINT = 'http://minio:9000';
    process.env.TI_AUDIT_S3_REGION = 'us-east-1';
    process.env.TI_AUDIT_S3_ACCESS_KEY = 'key';
    process.env.TI_AUDIT_S3_SECRET_KEY = 'secret';
    process.env.TI_AUDIT_S3_BUCKET = 'audit';

    const { prisma } = await import('../src/prisma.js');
    (prisma.auditLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { replicateAuditLog } = await import('../src/audit-replication.js');
    await replicateAuditLog('audit-1', 'tenant-1');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('not found'));
    spy.mockRestore();
  });
});

describe('buildAuditReplicationJob', () => {
  it('returns correct payload shape', async () => {
    const { buildAuditReplicationJob } = await import('../src/audit-replication.js');
    const job = buildAuditReplicationJob('audit-1', 'tenant-1');
    expect(job).toEqual({
      queue: 'etip-audit-replication',
      data: { auditLogId: 'audit-1', tenantId: 'tenant-1' },
    });
  });
});
