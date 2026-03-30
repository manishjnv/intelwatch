/**
 * @module RetentionWorker
 * @description BullMQ worker for daily data retention enforcement (I-20).
 * Processes DATA_RETENTION queue jobs, delegates to RetentionService.
 */
import type { RetentionService } from './retention-service.js';
import type { RetentionJobPayload } from '@etip/shared-types';

/**
 * Process a data retention job.
 * Called by BullMQ worker on DATA_RETENTION queue.
 */
export async function processRetentionJob(
  _payload: RetentionJobPayload,
  retentionService: RetentionService,
): Promise<{ processed: number; totalArchived: number }> {
  const results = await retentionService.enforceRetention();

  let totalArchived = 0;
  for (const r of results) {
    totalArchived += r.recordsArchived.iocs + r.recordsArchived.threatActors +
      r.recordsArchived.malwareProfiles + r.recordsArchived.vulnerabilityProfiles +
      r.recordsArchived.articles;
  }

  return { processed: results.length, totalArchived };
}
