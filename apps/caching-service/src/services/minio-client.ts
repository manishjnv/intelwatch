/**
 * @module services/minio-client
 * @description MinIO/S3 client factory and bucket operations for archive storage.
 */
import * as Minio from 'minio';
import { getLogger } from '../logger.js';
import type { CachingConfig } from '../config.js';

export interface MinioClientOptions {
  endPoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  useSSL: boolean;
}

/** Create a MinIO client from service config. */
export function createMinioClient(config: CachingConfig): Minio.Client {
  return new Minio.Client({
    endPoint: config.TI_MINIO_ENDPOINT,
    port: config.TI_MINIO_PORT,
    accessKey: config.TI_MINIO_ACCESS_KEY,
    secretKey: config.TI_MINIO_SECRET_KEY,
    useSSL: config.TI_MINIO_USE_SSL,
  });
}

/** Ensure the archive bucket exists, creating it if needed. */
export async function ensureBucket(client: Minio.Client, bucket: string): Promise<void> {
  const logger = getLogger();
  try {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket);
      logger.info({ bucket }, 'Created MinIO bucket');
    } else {
      logger.info({ bucket }, 'MinIO bucket exists');
    }
  } catch (err) {
    logger.error({ bucket, err: (err as Error).message }, 'MinIO bucket check failed');
    throw err;
  }
}

/** Upload a gzipped buffer to MinIO. */
export async function uploadBuffer(
  client: Minio.Client,
  bucket: string,
  objectName: string,
  buffer: Buffer,
  metadata?: Record<string, string>
): Promise<void> {
  await client.putObject(bucket, objectName, buffer, buffer.length, {
    'Content-Type': 'application/gzip',
    ...metadata,
  });
}

/** Download an object from MinIO as a Buffer. */
export async function downloadBuffer(
  client: Minio.Client,
  bucket: string,
  objectName: string
): Promise<Buffer> {
  const stream = await client.getObject(bucket, objectName);
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/** Get object metadata (size, etag, last modified). */
export async function getObjectInfo(
  client: Minio.Client,
  bucket: string,
  objectName: string
): Promise<{ size: number; etag: string; lastModified: Date } | null> {
  try {
    const stat = await client.statObject(bucket, objectName);
    return { size: stat.size, etag: stat.etag, lastModified: stat.lastModified };
  } catch {
    return null;
  }
}

/** List all objects under a prefix. */
export async function listObjects(
  client: Minio.Client,
  bucket: string,
  prefix: string
): Promise<Array<{ name: string; size: number; lastModified: Date }>> {
  return new Promise((resolve, reject) => {
    const objects: Array<{ name: string; size: number; lastModified: Date }> = [];
    const stream = client.listObjectsV2(bucket, prefix, true);
    stream.on('data', (obj) => {
      if (obj.name) {
        objects.push({ name: obj.name, size: obj.size, lastModified: obj.lastModified });
      }
    });
    stream.on('end', () => resolve(objects));
    stream.on('error', reject);
  });
}

/** Delete an object from MinIO. */
export async function deleteObject(
  client: Minio.Client,
  bucket: string,
  objectName: string
): Promise<void> {
  await client.removeObject(bucket, objectName);
}

/** Check if MinIO is reachable by listing buckets. */
export async function pingMinio(client: Minio.Client): Promise<boolean> {
  try {
    await client.listBuckets();
    return true;
  } catch {
    return false;
  }
}
