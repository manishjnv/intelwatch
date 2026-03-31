/**
 * @module routes/public/filters
 * @description Shared IOC filter builder for public API routes.
 * Eliminates duplication between iocs.ts and export.ts.
 */
import type { PublicIocFilter } from '@etip/shared-types';

/**
 * Build a Prisma `where` clause from PublicIocFilter params.
 * Always enforces: tenantId, TLP:RED exclusion, archived exclusion.
 *
 * @param tenantId - Authenticated tenant ID
 * @param filters - Parsed PublicIocFilter from query/body
 * @param extra - Additional where conditions (cursor, updatedSince, etc.)
 */
export function buildIocWhere(
  tenantId: string,
  filters: Partial<PublicIocFilter>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    tenantId,
    tlp: { not: 'red' },
    archivedAt: null,
    ...extra,
  };

  if (filters.iocType) where.iocType = filters.iocType;
  if (filters.severity) where.severity = filters.severity;
  if (filters.lifecycle) where.lifecycle = filters.lifecycle;
  if (filters.tlp) where.tlp = filters.tlp;
  if (filters.minConfidence !== undefined || filters.maxConfidence !== undefined) {
    where.confidence = {
      ...(filters.minConfidence !== undefined && { gte: filters.minConfidence }),
      ...(filters.maxConfidence !== undefined && { lte: filters.maxConfidence }),
    };
  }
  if (filters.tags) {
    where.tags = { hasSome: filters.tags.split(',').map((t: string) => t.trim()) };
  }
  if (filters.threatActors) {
    where.threatActors = { hasSome: filters.threatActors.split(',').map((t: string) => t.trim()) };
  }
  if (filters.malwareFamilies) {
    where.malwareFamilies = { hasSome: filters.malwareFamilies.split(',').map((t: string) => t.trim()) };
  }
  if (filters.firstSeenFrom || filters.firstSeenTo) {
    where.firstSeen = {
      ...(filters.firstSeenFrom && { gte: new Date(filters.firstSeenFrom) }),
      ...(filters.firstSeenTo && { lte: new Date(filters.firstSeenTo) }),
    };
  }
  if (filters.lastSeenFrom || filters.lastSeenTo) {
    where.lastSeen = {
      ...(filters.lastSeenFrom && { gte: new Date(filters.lastSeenFrom) }),
      ...(filters.lastSeenTo && { lte: new Date(filters.lastSeenTo) }),
    };
  }

  return where;
}
