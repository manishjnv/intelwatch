import type { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import { getLogger } from '../logger.js';
import type { DocRepo } from './doc-repo.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Prisma P2002 = unique constraint violation. */
function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

async function dbCall<T>(fn: () => Promise<T>, message: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    getLogger().error({ error: err instanceof Error ? err.message : String(err) }, message);
    throw new AppError(503, message, 'DB_UNAVAILABLE');
  }
}

/**
 * Prisma-backed DocRepo over the shared `integration_docs` table, scoped to one `kind`
 * (Step 3 S157). Production rows are keyed by the composite (kind, id) — two stores of
 * different kinds may legitimately save the same id (e.g. a taxii_collection and its
 * taxii_objects doc share the collection id); keying by id alone would let one overwrite
 * the other (fixed post-S157 revision).
 */
export function createPrismaDocRepo<T extends { id: string; tenantId: string }>(
  prisma: PrismaClient,
  kind: string,
): DocRepo<T> {
  return {
    async list(tenantId, parentId) {
      if (!isUuid(tenantId)) return [];
      if (parentId !== undefined && !isUuid(parentId)) return [];
      return dbCall(async () => {
        const rows = await prisma.integrationDoc.findMany({
          where: { tenantId, kind, ...(parentId !== undefined ? { parentId } : {}) },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((r) => r.data as T);
      }, `Failed to list ${kind} documents`);
    },

    async get(id, tenantId) {
      if (!isUuid(id) || !isUuid(tenantId)) return null;
      return dbCall(async () => {
        const row = await prisma.integrationDoc.findFirst({ where: { id, tenantId, kind } });
        return row ? (row.data as T) : null;
      }, `Failed to get ${kind} document`);
    },

    async save(row, parentId = null) {
      if (!isUuid(row.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      return dbCall(async () => {
        // Scoped by (kind, id, tenantId) so this can never overwrite another kind's row sharing
        // the same id, nor move/overwrite another tenant's row (Bug 1 + Bug 2 fix).
        const res = await prisma.integrationDoc.updateMany({
          where: { kind, id: row.id, tenantId: row.tenantId },
          data: { data: row as unknown as Prisma.InputJsonValue, parentId },
        });
        if (res.count === 0) {
          try {
            await prisma.integrationDoc.create({
              data: {
                id: row.id,
                tenantId: row.tenantId,
                kind,
                parentId,
                data: row as unknown as Prisma.InputJsonValue,
              },
            });
          } catch (err) {
            if (isP2002(err)) throw new AppError(409, 'Record id already in use', 'CONFLICT');
            throw err;
          }
        }
        return row;
      }, `Failed to persist ${kind} document`);
    },

    async delete(id, tenantId) {
      if (!isUuid(id) || !isUuid(tenantId)) return false;
      return dbCall(async () => {
        const result = await prisma.integrationDoc.deleteMany({ where: { id, tenantId, kind } });
        return result.count > 0;
      }, `Failed to delete ${kind} document`);
    },

    async deleteByParent(tenantId, parentId) {
      if (!isUuid(tenantId) || !isUuid(parentId)) return 0;
      return dbCall(async () => {
        const result = await prisma.integrationDoc.deleteMany({ where: { tenantId, kind, parentId } });
        return result.count;
      }, `Failed to delete ${kind} documents by parent`);
    },
  };
}
