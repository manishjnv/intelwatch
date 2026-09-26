import type pino from 'pino';
import { toIocDocument, iocIndexJobId, type IocRow } from '@etip/shared-utils';
import { getIocIndexQueue } from './queue.js';

/**
 * Fire-and-forget: enqueue a full re-index job for each row. Never throws into the
 * request path — a bad row or a dead queue is logged as a warning and skipped (S157).
 */
export function syncIocsToSearch(rows: IocRow[], logger: pino.Logger): void {
  const queue = getIocIndexQueue();
  if (!queue) return;

  for (const row of rows) {
    try {
      const payload = toIocDocument(row);
      queue.add(
        'ioc-index',
        { action: 'index', iocId: row.id, tenantId: row.tenantId, payload },
        { jobId: iocIndexJobId('index', row.id, row.updatedAt) },
      ).catch((err: unknown) => {
        logger.warn({ error: err instanceof Error ? err.message : String(err), iocId: row.id }, 'Failed to queue IOC index job');
      });
    } catch (err) {
      logger.warn({ error: err instanceof Error ? err.message : String(err), iocId: row.id }, 'IOC not indexable — skipped search index job');
    }
  }
}
