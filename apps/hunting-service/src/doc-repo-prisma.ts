import type { PrismaClient, Prisma } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import { getLogger } from './logger.js';
import type { DocRepo } from './doc-repo.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** Hunting doc ids are VarChar(100), not UUID — any non-empty id up to 100 chars is valid. */
function isValidId(s: string): boolean {
  return typeof s === 'string' && s.length > 0 && s.length <= 100;
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
 * Prisma-backed DocRepo over the shared `hunting_docs` table, scoped to one `kind`
 * (Step 3 S159). Production rows are keyed by the composite (kind, id) — different
 * kinds may legitimately reuse the same id (e.g. a playbook_execution doc is keyed by
 * huntId, same id as the hunt_session doc); keying by id alone would let one overwrite
 * the other.
 */
export function createPrismaDocRepo<T extends { id: string; tenantId: string }>(
  prisma: PrismaClient,
  kind: string,
): DocRepo<T> {
  return {
    async list(tenantId, parentId) {
      if (!isUuid(tenantId)) return [];
      if (parentId !== undefined && !isValidId(parentId)) return [];
      return dbCall(async () => {
        const rows = await prisma.huntingDoc.findMany({
          where: { tenantId, kind, ...(parentId !== undefined ? { parentId } : {}) },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((r) => r.data as T);
      }, `Failed to list ${kind} documents`);
    },

    async get(id, tenantId) {
      if (!isValidId(id) || !isUuid(tenantId)) return null;
      return dbCall(async () => {
        const row = await prisma.huntingDoc.findFirst({ where: { id, tenantId, kind } });
        return row ? (row.data as T) : null;
      }, `Failed to get ${kind} document`);
    },

    async save(row, parentId = null) {
      if (!isUuid(row.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
      if (!isValidId(row.id)) {
        throw new AppError(400, 'id must be a non-empty string of at most 100 characters', 'VALIDATION_ERROR');
      }
      return dbCall(async () => {
        // Scoped by (kind, id, tenantId) so this can never overwrite another kind's row
        // sharing the same id, nor move/overwrite another tenant's row.
        const res = await prisma.huntingDoc.updateMany({
          where: { kind, id: row.id, tenantId: row.tenantId },
          data: { data: row as unknown as Prisma.InputJsonValue, parentId },
        });
        if (res.count === 0) {
          try {
            await prisma.huntingDoc.create({
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
      if (!isValidId(id) || !isUuid(tenantId)) return false;
      return dbCall(async () => {
        const result = await prisma.huntingDoc.deleteMany({ where: { id, tenantId, kind } });
        return result.count > 0;
      }, `Failed to delete ${kind} document`);
    },

    async deleteByParent(tenantId, parentId) {
      if (!isUuid(tenantId) || !isValidId(parentId)) return 0;
      return dbCall(async () => {
        const result = await prisma.huntingDoc.deleteMany({ where: { tenantId, kind, parentId } });
        return result.count;
      }, `Failed to delete ${kind} documents by parent`);
    },
  };
}
