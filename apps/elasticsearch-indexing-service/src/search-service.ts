import { AppError } from '@etip/shared-utils';
import type { EsIndexClient } from './es-client.js';
import { getTypeIndex, getWildcardIndex, getAllTypeIndices } from './index-naming.js';
import type { SearchQueryParams, IocSearchResult, AggregationBucket } from './schemas.js';

export interface IndexStats {
  docCount: number;
  indexNames: string[];
}

/**
 * High-level IOC search operations backed by Elasticsearch.
 * Uses per-type indices: targets specific index when type filter is provided,
 * otherwise searches across all types using wildcard pattern.
 */
export class IocSearchService {
  constructor(private readonly es: EsIndexClient) {}

  /**
   * Full-text + faceted search for IOCs belonging to a tenant.
   *
   * - When `type` filter is provided, targets the specific per-type index directly
   *   (faster, avoids scanning irrelevant indices).
   * - Otherwise, uses wildcard pattern `etip_{tenantId}_iocs_*` for cross-type search.
   */
  async search(tenantId: string, params: Omit<SearchQueryParams, 'tenantId'>): Promise<IocSearchResult> {
    const index = params.type
      ? getTypeIndex(tenantId, params.type)
      : getWildcardIndex(tenantId);

    try {
      const raw = await this.es.search(index, params);

      const by_type = toBuckets(raw.aggregations.by_type?.buckets ?? []);
      const by_severity = toBuckets(raw.aggregations.by_severity?.buckets ?? []);
      const by_tlp = toBuckets(raw.aggregations.by_tlp?.buckets ?? []);

      return {
        total: raw.total,
        page: params.page,
        limit: params.limit,
        data: raw.hits,
        aggregations: { by_type, by_severity, by_tlp },
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `IOC search failed for tenant ${tenantId}`, 'ES_SEARCH_FAILED', err);
    }
  }

  /**
   * Get index statistics for a tenant: total document count across all per-type indices.
   * Returns docCount=0 if no indices exist yet.
   */
  async getIndexStats(tenantId: string): Promise<IndexStats> {
    const indexNames = getAllTypeIndices(tenantId);
    const counts = await Promise.all(indexNames.map((idx) => this.es.countDocs(idx)));
    const docCount = counts.reduce((sum, c) => sum + c, 0);
    return { docCount, indexNames };
  }
}

/** Convert raw ES bucket array to canonical AggregationBucket[]. */
function toBuckets(raw: Array<{ key: string; doc_count: number }>): AggregationBucket[] {
  return raw.map((b) => ({ key: b.key, count: b.doc_count }));
}
