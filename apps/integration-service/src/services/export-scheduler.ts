import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type {
  ExportSchedule,
  CreateExportScheduleInput,
  UpdateExportScheduleInput,
  BulkExportFormat,
} from '../schemas/integration.js';
import type { BulkExportService } from './bulk-export.js';
import type { DocRepo } from './doc-repo.js';
import { MemoryDocRepo } from './doc-repo.js';
import { getLogger } from '../logger.js';

/** A single export run record (Step 3 S157, kind `export_run`, parentId = scheduleId). */
export interface ExportRun {
  id: string;
  tenantId: string;
  scheduleId: string;
  runAt: string;
  status: 'success' | 'failure';
  error?: string;
  recordCount: number;
  format: BulkExportFormat;
}

/** Fetches real records for an export, injected by index.ts (Step 3 S157, DECISION-048). */
export type ExportRecordFetcher = (
  tenantId: string,
  entityType: string,
  filters: Record<string, unknown>,
  limit: number,
) => Promise<Record<string, unknown>[]>;

const MAX_RUNS_PER_SCHEDULE = 50;

/**
 * P1 #10: Cron-based bulk export scheduler.
 * Manages export job schedules with CRUD, last-run tracking,
 * configurable filters, and next-run calculation. Schedules persist as
 * `export_schedule` documents; each run as its own `export_run` document.
 */
export class ExportScheduler {
  constructor(
    private readonly bulkExport: BulkExportService,
    private readonly fetchRecords: ExportRecordFetcher,
    private readonly schedules: DocRepo<ExportSchedule> = new MemoryDocRepo<ExportSchedule>(),
    private readonly runs: DocRepo<ExportRun> = new MemoryDocRepo<ExportRun>(),
  ) {}

  /** Create a new export schedule. */
  async createSchedule(tenantId: string, input: CreateExportScheduleInput): Promise<ExportSchedule> {
    // Validate cron expression
    if (!this.isValidCron(input.cronExpression)) {
      throw new AppError(400, `Invalid cron expression: ${input.cronExpression}`, 'INVALID_CRON');
    }

    const now = new Date().toISOString();
    const schedule: ExportSchedule = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      cronExpression: input.cronExpression,
      format: input.format,
      entityType: input.entityType,
      filters: input.filters ?? {},
      enabled: input.enabled ?? true,
      limit: input.limit ?? 1000,
      lastRunAt: null,
      lastRunStatus: null,
      lastRunError: null,
      nextRunAt: this.calculateNextRun(input.cronExpression),
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    return this.schedules.save(schedule);
  }

  /** Get a schedule by ID, filtered by tenant. */
  async getSchedule(id: string, tenantId: string): Promise<ExportSchedule | undefined> {
    return (await this.schedules.get(id, tenantId)) ?? undefined;
  }

  /** List schedules for a tenant. */
  async listSchedules(
    tenantId: string,
    opts: { enabled?: boolean; page: number; limit: number },
  ): Promise<{ data: ExportSchedule[]; total: number }> {
    let items = await this.schedules.list(tenantId);
    if (opts.enabled !== undefined) {
      items = items.filter((s) => s.enabled === opts.enabled);
    }
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Update a schedule. */
  async updateSchedule(
    id: string,
    tenantId: string,
    input: UpdateExportScheduleInput,
  ): Promise<ExportSchedule | undefined> {
    const existing = await this.getSchedule(id, tenantId);
    if (!existing) return undefined;

    if (input.cronExpression && !this.isValidCron(input.cronExpression)) {
      throw new AppError(400, `Invalid cron expression: ${input.cronExpression}`, 'INVALID_CRON');
    }

    const updated: ExportSchedule = {
      ...existing,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.cronExpression !== undefined && {
        cronExpression: input.cronExpression,
        nextRunAt: this.calculateNextRun(input.cronExpression),
      }),
      ...(input.format !== undefined && { format: input.format }),
      ...(input.entityType !== undefined && { entityType: input.entityType }),
      ...(input.filters !== undefined && { filters: input.filters }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
      ...(input.limit !== undefined && { limit: input.limit }),
      updatedAt: new Date().toISOString(),
    };
    return this.schedules.save(updated);
  }

  /** Delete a schedule and its run history. */
  async deleteSchedule(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getSchedule(id, tenantId);
    if (!existing) return false;
    await this.schedules.delete(id, tenantId);
    await this.runs.deleteByParent(tenantId, id);
    return true;
  }

  /**
   * Execute a scheduled export manually or via cron trigger.
   * Fetches real records via the injected fetcher (Step 3 S157, DECISION-048 — no demo data).
   */
  async executeSchedule(
    id: string,
    tenantId: string,
  ): Promise<{ content: string; contentType: string; filename: string } | null> {
    const logger = getLogger();
    const schedule = await this.getSchedule(id, tenantId);
    if (!schedule) return null;

    try {
      const records = await this.fetchRecords(tenantId, schedule.entityType, schedule.filters, schedule.limit);

      const result = await this.bulkExport.export(
        {
          format: schedule.format,
          entityType: schedule.entityType as 'iocs',
          filters: schedule.filters as { severity?: 'critical' | 'high' | 'medium' | 'low' | 'info' },
          limit: schedule.limit,
        },
        records,
        tenantId,
      );

      // Update schedule state
      const now = new Date().toISOString();
      schedule.lastRunAt = now;
      schedule.lastRunStatus = 'success';
      schedule.lastRunError = null;
      schedule.nextRunAt = this.calculateNextRun(schedule.cronExpression);
      schedule.runCount++;
      schedule.updatedAt = now;
      await this.schedules.save(schedule);

      await this.recordRun(tenantId, id, { runAt: now, status: 'success', recordCount: records.length, format: schedule.format });

      logger.info({ scheduleId: id, format: schedule.format, records: records.length }, 'Export schedule executed');
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      schedule.lastRunAt = now;
      schedule.lastRunStatus = 'failure';
      schedule.lastRunError = errorMsg;
      schedule.nextRunAt = this.calculateNextRun(schedule.cronExpression);
      schedule.runCount++;
      schedule.updatedAt = now;
      await this.schedules.save(schedule);

      await this.recordRun(tenantId, id, { runAt: now, status: 'failure', error: errorMsg, recordCount: 0, format: schedule.format });

      logger.error({ scheduleId: id, error: errorMsg }, 'Export schedule failed');
      return null;
    }
  }

  /** Record a run doc and trim history to the newest 50 for this schedule. */
  private async recordRun(
    tenantId: string,
    scheduleId: string,
    run: Omit<ExportRun, 'id' | 'tenantId' | 'scheduleId'>,
  ): Promise<void> {
    await this.runs.save({ id: randomUUID(), tenantId, scheduleId, ...run }, scheduleId);
    const history = await this.runs.list(tenantId, scheduleId); // newest first
    const stale = history.slice(MAX_RUNS_PER_SCHEDULE);
    for (const old of stale) {
      await this.runs.delete(old.id, tenantId);
    }
  }

  /** Get run history for a schedule. */
  async getRunHistory(
    id: string,
    tenantId: string,
    opts: { page: number; limit: number },
  ): Promise<{ data: Array<{ runAt: string; status: string; error?: string; recordCount: number; format: string }>; total: number } | null> {
    const schedule = await this.getSchedule(id, tenantId);
    if (!schedule) return null;

    const history = await this.runs.list(tenantId, id); // newest first
    const total = history.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: history.slice(start, start + opts.limit), total };
  }

  /** Get schedules due for execution. */
  async getSchedulesDue(tenantId: string): Promise<ExportSchedule[]> {
    const now = new Date().toISOString();
    return (await this.schedules.list(tenantId))
      .filter((s) => s.enabled)
      .filter((s) => s.nextRunAt && s.nextRunAt <= now);
  }

  /**
   * Validate a cron expression (basic 5-field format).
   * Supports: minute hour day-of-month month day-of-week
   */
  isValidCron(expression: string): boolean {
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) return false;

    const fieldPattern = /^(\*(?:\/\d{1,2})?|\d{1,2}(?:[-/]\d{1,2})?)$/;
    const patterns = [
      fieldPattern, // minute (0-59)
      fieldPattern, // hour (0-23)
      fieldPattern, // day (1-31)
      fieldPattern, // month (1-12)
      fieldPattern, // weekday (0-6)
    ];

    for (let i = 0; i < 5; i++) {
      if (!patterns[i]!.test(parts[i]!)) return false;
    }
    return true;
  }

  /**
   * Calculate next run time from a cron expression (simplified).
   * Returns an ISO string approximately matching the next scheduled time.
   */
  calculateNextRun(cronExpression: string): string {
    const parts = cronExpression.trim().split(/\s+/);
    const now = new Date();

    // Simple: use minute and hour fields to estimate next run
    const minute = parts[0] === '*' ? now.getMinutes() : parseInt(parts[0]!, 10);
    const hour = parts[1] === '*' ? now.getHours() : parseInt(parts[1]!, 10);

    const next = new Date(now);
    next.setMinutes(minute, 0, 0);
    next.setHours(hour);

    // If the calculated time is in the past, advance to next day
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }

    return next.toISOString();
  }
}
