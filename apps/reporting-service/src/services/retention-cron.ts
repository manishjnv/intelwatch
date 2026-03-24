import { getLogger } from '../logger.js';
import type { ReportStore } from './report-store.js';

/**
 * Periodically purges expired reports from memory.
 * Prevents memory leaks in long-running containers that rarely call list()/getById().
 */
export class RetentionCron {
  private _intervalHandle: ReturnType<typeof setInterval> | null = null;
  private _logger = getLogger();
  private _reportStore: ReportStore;
  private _intervalMs: number;

  constructor(reportStore: ReportStore, intervalMs = 60 * 60 * 1000) {
    this._reportStore = reportStore;
    this._intervalMs = intervalMs;
  }

  /** Start the periodic purge. Safe to call multiple times (idempotent). */
  start(): void {
    if (this._intervalHandle) return;
    this._logger.info({ intervalMs: this._intervalMs }, 'Retention cron started');
    this._intervalHandle = setInterval(() => {
      this._run();
    }, this._intervalMs);
    // Don't keep the process alive just for cleanup
    if (this._intervalHandle.unref) {
      this._intervalHandle.unref();
    }
  }

  /** Stop the periodic purge. */
  stop(): void {
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
      this._logger.info('Retention cron stopped');
    }
  }

  /** Run a single purge cycle. Exposed for testing. */
  runOnce(): number {
    return this._run();
  }

  /** Returns whether the cron is currently active. */
  isRunning(): boolean {
    return this._intervalHandle !== null;
  }

  private _run(): number {
    const purged = this._reportStore.purgeExpired();
    if (purged > 0) {
      this._logger.info({ purged }, 'Retention cron purged expired reports');
    }
    return purged;
  }
}
