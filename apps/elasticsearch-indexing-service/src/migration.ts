/**
 * One-time migration: moves IOCs from the legacy single index
 * (`etip_{tenantId}_iocs`) to per-type indices (`etip_{tenantId}_iocs_{category}`).
 *
 * Uses the ES `_reindex` API with type-based queries.
 * Designed to be run per-tenant, non-blocking, idempotent.
 */

import { AppError } from '@etip/shared-utils';
import type { EsIndexClient } from './es-client.js';
import { getIndexName } from './es-client.js';
import { INDEX_CATEGORIES, getTypeIndex } from './index-naming.js';
import type { IndexCategory } from './index-naming.js';
import type { MigrationResult } from './schemas.js';

/** IOC types that belong to each index category. */
const CATEGORY_TYPES: Record<IndexCategory, string[]> = {
  ip:     ['ip', 'ipv6', 'cidr', 'asn'],
  domain: ['domain', 'fqdn', 'url'],
  hash:   ['md5', 'sha1', 'sha256', 'sha512'],
  email:  ['email'],
  cve:    ['cve'],
  other:  ['bitcoin_address'],
};

/**
 * Migrate a single tenant's IOCs from the legacy single index to per-type indices.
 *
 * For each index category, reindexes matching docs using the ES `_reindex` API
 * with a `terms` query on the `type` field.
 *
 * @returns Migration result with per-category counts.
 */
export async function migrateToPerTypeIndices(
  es: EsIndexClient,
  tenantId: string,
): Promise<MigrationResult> {
  const sourceIndex = getIndexName(tenantId);

  // Check if source index exists
  const sourceCount = await es.countDocs(sourceIndex);
  if (sourceCount === 0) {
    return {
      tenantId,
      totalMigrated: 0,
      perCategory: {},
      sourceIndex,
      status: 'skipped',
      message: 'Source index is empty or does not exist',
    };
  }

  const perCategory: Record<string, number> = {};
  let totalMigrated = 0;

  for (const category of INDEX_CATEGORIES) {
    const types = CATEGORY_TYPES[category];
    const destIndex = getTypeIndex(tenantId, types[0]!);

    try {
      // Ensure destination index exists with correct mappings
      await es.ensureTypeIndex(tenantId, types[0]!);

      const result = await es.reindexByQuery(sourceIndex, destIndex, {
        terms: { type: types },
      });

      perCategory[category] = result.total;
      totalMigrated += result.total;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        503,
        `Migration failed for tenant ${tenantId} category ${category}`,
        'ES_MIGRATION_FAILED',
        err,
      );
    }
  }

  return {
    tenantId,
    totalMigrated,
    perCategory,
    sourceIndex,
    status: 'completed',
  };
}
