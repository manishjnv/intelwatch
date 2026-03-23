import { Client } from '@elastic/elasticsearch';
import { AppError } from '@etip/shared-utils';

// Minimal local alias — avoids importing from non-exported ES subpath
type QueryContainer = Record<string, unknown>;
import type { IocDocument, ReindexResult } from './schemas.js';

// ── Index naming ─────────────────────────────────────────────────────────────

/** Returns the Elasticsearch index name for a given tenant. */
export function getIndexName(tenantId: string): string {
  return `etip_${tenantId}_iocs`;
}

// ── IOC index mapping ─────────────────────────────────────────────────────────

const IOC_INDEX_MAPPING = {
  mappings: {
    properties: {
      iocId:       { type: 'keyword' as const },
      value:       { type: 'text' as const, analyzer: 'standard', fields: { keyword: { type: 'keyword' as const } } },
      type:        { type: 'keyword' as const },
      severity:    { type: 'keyword' as const },
      confidence:  { type: 'integer' as const },
      tags:        { type: 'text' as const, fields: { keyword: { type: 'keyword' as const } } },
      firstSeen:   { type: 'date' as const },
      lastSeen:    { type: 'date' as const },
      tenantId:    { type: 'keyword' as const },
      sourceId:    { type: 'keyword' as const },
      enriched:    { type: 'boolean' as const },
      tlp:         { type: 'keyword' as const },
      campaignIds: { type: 'keyword' as const },
      actorIds:    { type: 'keyword' as const },
    },
  },
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    refresh_interval: '5s',
  },
};

// ── Search params + result (internal) ────────────────────────────────────────

export interface EsSearchParams {
  q?: string;
  type?: string;
  severity?: string;
  tlp?: string;
  enriched?: boolean;
  page: number;
  limit: number;
}

interface AggBuckets {
  buckets: Array<{ key: string; doc_count: number }>;
}

export interface EsSearchResult {
  total: number;
  hits: IocDocument[];
  aggregations: {
    by_type?: AggBuckets;
    by_severity?: AggBuckets;
    by_tlp?: AggBuckets;
  };
}

// ── EsIndexClient ─────────────────────────────────────────────────────────────

export interface EsClientOptions {
  url: string;
  username?: string;
  password?: string;
}

/**
 * Wrapper around the Elasticsearch 8.x TypeScript client.
 * All methods throw AppError on failure — never raw Error.
 */
export class EsIndexClient {
  private client: Client;

  constructor(opts: EsClientOptions) {
    this.client = new Client({
      node: opts.url,
      auth: opts.username ? { username: opts.username, password: opts.password ?? '' } : undefined,
    });
  }

  /** Ping Elasticsearch to check connectivity. Returns true on success. */
  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  /** Create the IOC index for a tenant if it does not already exist. */
  async ensureIndex(tenantId: string): Promise<void> {
    const index = getIndexName(tenantId);
    try {
      const exists = await this.client.indices.exists({ index });
      if (!exists) {
        await this.client.indices.create({ index, ...IOC_INDEX_MAPPING });
      }
    } catch (err) {
      throw new AppError(503, `Failed to ensure ES index for tenant ${tenantId}`, 'ES_INDEX_ENSURE_FAILED', err);
    }
  }

  /** Index a single IOC document. */
  async indexDoc(index: string, docId: string, doc: IocDocument): Promise<void> {
    try {
      await this.client.index({ index, id: docId, document: doc, refresh: 'wait_for' });
    } catch (err) {
      throw new AppError(503, `Failed to index document ${docId}`, 'ES_INDEX_DOC_FAILED', err);
    }
  }

  /** Partially update an existing IOC document. */
  async updateDoc(index: string, docId: string, doc: Partial<IocDocument>): Promise<void> {
    try {
      await this.client.update({ index, id: docId, doc, refresh: 'wait_for' });
    } catch (err) {
      throw new AppError(503, `Failed to update document ${docId}`, 'ES_UPDATE_DOC_FAILED', err);
    }
  }

  /** Delete an IOC document by id. */
  async deleteDoc(index: string, docId: string): Promise<void> {
    try {
      await this.client.delete({ index, id: docId, refresh: 'wait_for' });
    } catch (err) {
      throw new AppError(503, `Failed to delete document ${docId}`, 'ES_DELETE_DOC_FAILED', err);
    }
  }

  /** Full-text + faceted search with aggregations. */
  async search(index: string, params: EsSearchParams): Promise<EsSearchResult> {
    const { q, type, severity, tlp, enriched, page, limit } = params;
    const from = (page - 1) * limit;

    const must: QueryContainer[] = q
      ? [{ query_string: { query: q, fields: ['value', 'tags'] } }]
      : [];
    const filter: QueryContainer[] = [];
    if (type) filter.push({ term: { type } });
    if (severity) filter.push({ term: { severity } });
    if (tlp) filter.push({ term: { tlp } });
    if (enriched !== undefined) filter.push({ term: { enriched } });

    try {
      const resp = await this.client.search({
        index,
        from,
        size: limit,
        query: { bool: { must, filter } },
        aggregations: {
          by_type:     { terms: { field: 'type',     size: 20 } },
          by_severity: { terms: { field: 'severity', size: 10 } },
          by_tlp:      { terms: { field: 'tlp',      size: 10 } },
        },
      });

      const total = typeof resp.hits.total === 'number'
        ? resp.hits.total
        : (resp.hits.total?.value ?? 0);

      const hits = resp.hits.hits.map((h: { _source?: unknown }) => h._source as IocDocument);
      const aggs = (resp.aggregations ?? {}) as Record<string, AggBuckets>;

      return { total, hits, aggregations: aggs };
    } catch (err) {
      throw new AppError(503, 'Elasticsearch search failed', 'ES_SEARCH_FAILED', err);
    }
  }

  /** Bulk index a list of IOC documents. */
  async bulkIndex(index: string, docs: IocDocument[]): Promise<ReindexResult> {
    if (docs.length === 0) return { indexed: 0, failed: 0 };

    const operations = docs.flatMap((doc) => [
      { index: { _index: index, _id: doc.iocId } },
      doc,
    ]);

    try {
      const resp = await this.client.bulk({ operations, refresh: 'wait_for' });
      const failed = resp.items.filter((i: { index?: { error?: unknown } }) => i.index?.error).length;
      return { indexed: docs.length - failed, failed };
    } catch (err) {
      throw new AppError(503, 'Elasticsearch bulk index failed', 'ES_BULK_FAILED', err);
    }
  }

  /** Count documents in an index. Returns 0 if index does not exist. */
  async countDocs(index: string): Promise<number> {
    try {
      const resp = await this.client.count({ index });
      return resp.count;
    } catch {
      return 0;
    }
  }
}
