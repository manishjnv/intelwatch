import { AppError } from '@etip/shared-utils';
import type { EsIndexClient } from './es-client.js';
import { getIndexName } from './es-client.js';
import type { IocDocument, ReindexResult } from './schemas.js';

/**
 * High-level IOC indexing operations that wrap EsIndexClient.
 * All methods throw AppError on failure.
 */
export class IocIndexer {
  constructor(private readonly es: EsIndexClient) {}

  /**
   * Index a new IOC document for a tenant.
   * Creates the tenant index if it does not exist.
   */
  async indexIOC(tenantId: string, iocId: string, payload: IocDocument): Promise<void> {
    const index = getIndexName(tenantId);
    try {
      await this.es.ensureIndex(tenantId);
      await this.es.indexDoc(index, iocId, payload);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `Failed to index IOC ${iocId}`, 'ES_INDEX_FAILED', err);
    }
  }

  /**
   * Update an existing IOC document in the tenant index.
   * Only the provided fields are updated (partial update).
   */
  async updateIOC(tenantId: string, iocId: string, payload: Partial<IocDocument>): Promise<void> {
    const index = getIndexName(tenantId);
    try {
      await this.es.ensureIndex(tenantId);
      await this.es.updateDoc(index, iocId, payload);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `Failed to update IOC ${iocId}`, 'ES_UPDATE_FAILED', err);
    }
  }

  /**
   * Delete an IOC document from the tenant index.
   */
  async deleteIOC(tenantId: string, iocId: string): Promise<void> {
    const index = getIndexName(tenantId);
    try {
      await this.es.deleteDoc(index, iocId);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `Failed to delete IOC ${iocId}`, 'ES_DELETE_FAILED', err);
    }
  }

  /**
   * Bulk re-index all provided IOC documents for a tenant.
   * Creates the index if needed, then performs a bulk operation.
   */
  async reindexTenant(tenantId: string, iocs: IocDocument[]): Promise<ReindexResult> {
    const index = getIndexName(tenantId);
    try {
      await this.es.ensureIndex(tenantId);
      return await this.es.bulkIndex(index, iocs);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(503, `Failed to reindex tenant ${tenantId}`, 'ES_REINDEX_FAILED', err);
    }
  }
}
