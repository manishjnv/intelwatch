/**
 * @module audit-replication
 * @description S3/MinIO replication for tamper-proof audit log external storage (I-15).
 * Gracefully degrades when S3 is not configured (dev/staging environments).
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { findAuditLogById, updateAuditLogReplication } from './repository.js';

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Read S3 config from env vars — returns null if not fully configured */
export function getS3Config(): S3Config | null {
  const endpoint = process.env.TI_AUDIT_S3_ENDPOINT;
  const region = process.env.TI_AUDIT_S3_REGION;
  const accessKeyId = process.env.TI_AUDIT_S3_ACCESS_KEY;
  const secretAccessKey = process.env.TI_AUDIT_S3_SECRET_KEY;
  const bucket = process.env.TI_AUDIT_S3_BUCKET;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
}

/** Create S3 client from config */
export function getS3Client(config: S3Config): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true, // MinIO compatibility
  });
}

/** Build S3 key in format: {tenantId}/{YYYY}/{MM}/{DD}/{auditLogId}.json */
export function buildS3Key(tenantId: string, createdAt: Date, auditLogId: string): string {
  const y = createdAt.getUTCFullYear();
  const m = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(createdAt.getUTCDate()).padStart(2, '0');
  return `${tenantId}/${y}/${m}/${d}/${auditLogId}.json`;
}

/** Replicate a single audit log entry to S3. No-op if S3 not configured. */
export async function replicateAuditLog(auditLogId: string, tenantId: string): Promise<void> {
  const config = getS3Config();
  if (!config) {
    console.warn('[audit-replication] S3 not configured — skipping replication');
    return;
  }

  const entry = await findAuditLogById(auditLogId);
  if (!entry) {
    console.warn(`[audit-replication] Audit log ${auditLogId} not found — skipping`);
    return;
  }

  const key = buildS3Key(tenantId, entry.createdAt, auditLogId);
  const client = getS3Client(config);

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: JSON.stringify(entry),
    ContentType: 'application/json',
  }));

  await updateAuditLogReplication(auditLogId, `s3://${config.bucket}/${key}`);
}

/** Fetch audit log JSON from S3 (for integrity spot-check) */
export async function fetchFromS3(externalRef: string): Promise<Record<string, unknown> | null> {
  const config = getS3Config();
  if (!config) return null;

  // Parse s3://bucket/key
  const match = externalRef.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) return null;

  const client = getS3Client(config);
  const res = await client.send(new GetObjectCommand({ Bucket: match[1], Key: match[2] }));
  const body = await res.Body?.transformToString();
  return body ? JSON.parse(body) : null;
}

/** Build BullMQ job payload for audit replication (matches buildEmailJobPayload pattern) */
export function buildAuditReplicationJob(auditLogId: string, tenantId: string) {
  return {
    queue: 'etip-audit-replication',
    data: { auditLogId, tenantId },
  };
}
