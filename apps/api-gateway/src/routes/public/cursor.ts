/**
 * @module routes/public/cursor
 * @description Cursor-based pagination helpers for the public API.
 * Cursors are opaque base64url-encoded JSON: { s: sortValue, i: id }.
 * Uses keyset pagination (no OFFSET) for consistent performance.
 */
import { AppError } from '@etip/shared-utils';

interface CursorData {
  /** Sort field value (ISO datetime string or number) */
  s: string | number;
  /** Record UUID (tiebreaker) */
  i: string;
}

/** Encode a cursor from a sort value + record ID. */
export function encodeCursor(sortValue: string | number | Date, id: string): string {
  const s = sortValue instanceof Date ? sortValue.toISOString() : sortValue;
  return Buffer.from(JSON.stringify({ s, i: id })).toString('base64url');
}

/** Decode an opaque cursor string. Throws 400 on invalid cursor. */
export function decodeCursor(cursor: string): CursorData {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw) as CursorData;
    if (parsed.s === undefined || !parsed.i) {
      throw new Error('Missing fields');
    }
    return parsed;
  } catch {
    throw new AppError(400, 'Invalid cursor', 'INVALID_CURSOR');
  }
}

/**
 * Build Prisma `where` clause for keyset pagination.
 * Handles compound ordering: sort field + id tiebreaker.
 *
 * @param sortField - Prisma field name to sort by
 * @param order - 'asc' or 'desc'
 * @param cursor - Decoded cursor data (or null for first page)
 */
export function buildCursorWhere(
  sortField: string,
  order: 'asc' | 'desc',
  cursor: CursorData | null,
): Record<string, unknown> {
  if (!cursor) return {};

  const op = order === 'desc' ? 'lt' : 'gt';
  return {
    OR: [
      { [sortField]: { [op]: cursor.s } },
      { [sortField]: cursor.s, id: { [op]: cursor.i } },
    ],
  };
}

/**
 * Build Prisma `orderBy` for cursor pagination.
 */
export function buildCursorOrderBy(
  sortField: string,
  order: 'asc' | 'desc',
): Array<Record<string, 'asc' | 'desc'>> {
  return [{ [sortField]: order }, { id: order }];
}

/**
 * Extract pagination metadata from query results.
 * Expects `limit + 1` items fetched; trims and builds cursor.
 */
export function extractPaginationMeta<T extends { id: string; [k: string]: unknown }>(
  items: T[],
  limit: number,
  sortField: string,
): { data: T[]; hasMore: boolean; nextCursor: string | null } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem
    ? encodeCursor(lastItem[sortField] as string | number, lastItem.id)
    : null;

  return { data, hasMore, nextCursor };
}
