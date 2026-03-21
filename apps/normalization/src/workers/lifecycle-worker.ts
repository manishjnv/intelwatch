import { schedule, type ScheduledTask } from 'node-cron';
import type pino from 'pino';
import type { IOCRepository } from '../repository.js';

export interface LifecycleWorkerConfig {
  /** Days of no sighting before ACTIVE → AGING */
  staleDays: number;
  /** Days of no sighting before AGING → EXPIRED */
  expireDays: number;
  /** Days of no sighting before EXPIRED → ARCHIVED */
  archiveDays: number;
  /** Max IOCs to process per cycle */
  batchSize: number;
  /** Cron expression (default: every 6 hours) */
  cronSchedule: string;
}

const DEFAULT_CONFIG: LifecycleWorkerConfig = {
  staleDays: 30,
  expireDays: 60,
  archiveDays: 90,
  batchSize: 1000,
  cronSchedule: '0 */6 * * *', // every 6 hours
};

export function createLifecycleWorker(
  repo: IOCRepository,
  logger: pino.Logger,
  config: Partial<LifecycleWorkerConfig> = {},
): ScheduledTask {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const task = schedule(cfg.cronSchedule, async () => {
    logger.info('Lifecycle worker: starting transition cycle');
    try {
      const result = await repo.transitionLifecycles({
        staleDays: cfg.staleDays,
        expireDays: cfg.expireDays,
        archiveDays: cfg.archiveDays,
        batchSize: cfg.batchSize,
      });

      if (result.aged > 0 || result.expired > 0 || result.archived > 0) {
        logger.info(
          { aged: result.aged, expired: result.expired, archived: result.archived },
          'Lifecycle transitions applied',
        );
      } else {
        logger.debug('Lifecycle worker: no transitions needed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, 'Lifecycle worker failed');
    }
  }, { scheduled: false });

  task.start();
  logger.info(
    { schedule: cfg.cronSchedule, staleDays: cfg.staleDays, expireDays: cfg.expireDays, archiveDays: cfg.archiveDays },
    'Lifecycle worker started',
  );

  return task;
}
