import { AppError } from '@etip/shared-utils';
import type { EsIndexClient } from './es-client.js';
import { getTypeIndex } from './index-naming.js';
import type { IocDocument, ReindexResult } from './schemas.js';

/**
 * High-level IOC indexing operations that wrap EsIndexClient.
 * Routes all writes to per-type indices based on IOC type.
 * All methods throw AppError on failure.
 */
export class IocIndexer {
  constructor(private readonly es: EsIndexClient) {}

  /**
   * Index a new IOC document for a tenant.
   * Routes to the correct per-type index based on iocType.
   * Creates the index if it does not exist.
   */
  async indexIOC(tenantId: string, iocId: string, payload: IocDocument): Promise<void> {
    const index = getTypeIndex(tenantId, payload.type);
    try {
      await this.es.ensureTypeIndex(tenantId, payload.type);
      await this.es.indexDoc(index, iocId, payload);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `Failed to index IOC ${iocId}`, 'ES_INDEX_FAILED', err);
    }
  }

  /**
   * Update an existing IOC document in the correct per-type index.
   * Requires iocType to route to the correct index.
   * Only the provided fields are updated (partial update).
   */
  async updateIOC(tenantId: string, iocId: string, payload: Partial<IocDocument>, iocType?: string): Promise<void> {
    const type = iocType ?? payload.type ?? 'other';
    const index = getTypeIndex(tenantId, type);
    try {
      await this.es.ensureTypeIndex(tenantId, type);
      await this.es.updateDoc(index, iocId, payload);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `Failed to update IOC ${iocId}`, 'ES_UPDATE_FAILED', err);
    }
  }

  /**
   * Delete an IOC document from the correct per-type index.
   * Requires iocType to route to the correct index.
   */
  async deleteIOC(tenantId: string, iocId: string, iocType?: string): Promise<void> {
    const type = iocType ?? 'other';
    const index = getTypeIndex(tenantId, type);
    try {
      await this.es.deleteDoc(index, iocId);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `Failed to delete IOC ${iocId}`, 'ES_DELETE_FAILED', err);
    }
  }

  /**
   * Bulk re-index all provided IOC documents for a tenant.
   * Groups IOCs by type and sends them to their respective per-type indices.
   * Ensures all required type indices exist before bulk indexing.
   */
  async reindexTenant(tenantId: string, iocs: IocDocument[]): Promise<ReindexResult> {
    if (iocs.length === 0) return { indexed: 0, failed: 0 };

    // Collect unique IOC types to ensure their indices exist
    const uniqueTypes = [...new Set(iocs.map((ioc) => ioc.type))];
    try {
      await Promise.all(uniqueTypes.map((t) => this.es.ensureTypeIndex(tenantId, t)));
      return await this.es.bulkIndexMultiType(tenantId, iocs);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `Failed to reindex tenant ${tenantId}`, 'ES_REINDEX_FAILED', err);
    }
  }
}
