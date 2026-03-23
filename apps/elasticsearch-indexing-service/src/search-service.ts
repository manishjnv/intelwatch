import { AppError } from '@etip/shared-utils';
import type { EsIndexClient } from './es-client.js';
import { getIndexName } from './es-client.js';
import type { SearchQueryParams, IocSearchResult, AggregationBucket } from './schemas.js';

export interface IndexStats {
  docCount: number;
  indexName: string;
}

/**
 * High-level IOC search operations backed by Elasticsearch.
 * Converts EsIndexClient results into the canonical IocSearchResult shape.
 */
export class IocSearchService {
  constructor(private readonly es: EsIndexClient) {}

  /**
   * Full-text + faceted search for IOCs belonging to a tenant.
   * Supports optional filters: q (full-text), type, severity, tlp, enriched.
   * Returns paginated results with aggregation buckets.
   */
  async search(tenantId: string, params: Omit<SearchQueryParams, 'tenantId'>): Promise<IocSearchResult> {
    const index = getIndexName(tenantId);
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
   * Get index statistics for a tenant: document count and index name.
   * Returns docCount=0 if the index does not exist yet.
   */
  async getIndexStats(tenantId: string): Promise<IndexStats> {
    const indexName = getIndexName(tenantId);
    const docCount = await this.es.countDocs(indexName);
    return { docCount, indexName };
  }
}

/** Convert raw ES bucket array to canonical AggregationBucket[]. */
function toBuckets(raw: Array<{ key: string; doc_count: number }>): AggregationBucket[] {
  return raw.map((b) => ({ key: b.key, count: b.doc_count }));
}
