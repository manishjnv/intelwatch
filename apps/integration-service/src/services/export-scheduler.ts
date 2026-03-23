import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import type {
  ExportSchedule,
  CreateExportScheduleInput,
  UpdateExportScheduleInput,
  BulkExportFormat,
} from '../schemas/integration.js';
import type { BulkExportService } from './bulk-export.js';
import { getLogger } from '../logger.js';

/**
 * P1 #10: Cron-based bulk export scheduler.
 * Manages export job schedules with CRUD, last-run tracking,
 * configurable filters, and next-run calculation.
 */
export class ExportScheduler {
  private schedules = new Map<string, ExportSchedule>();
  private runHistory = new Map<string, Array<{
    runAt: string;
    status: 'success' | 'failure';
    error?: string;
    recordCount: number;
    format: BulkExportFormat;
  }>>();

  constructor(private readonly bulkExport: BulkExportService) {}

  /** Create a new export schedule. */
  createSchedule(tenantId: string, input: CreateExportScheduleInput): ExportSchedule {
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
    this.schedules.set(schedule.id, schedule);
    this.runHistory.set(schedule.id, []);
    return schedule;
  }

  /** Get a schedule by ID, filtered by tenant. */
  getSchedule(id: string, tenantId: string): ExportSchedule | undefined {
    const s = this.schedules.get(id);
    if (!s || s.tenantId !== tenantId) return undefined;
    return s;
  }

  /** List schedules for a tenant. */
  listSchedules(
    tenantId: string,
    opts: { enabled?: boolean; page: number; limit: number },
  ): { data: ExportSchedule[]; total: number } {
    let items = Array.from(this.schedules.values()).filter(
      (s) => s.tenantId === tenantId,
    );
    if (opts.enabled !== undefined) {
      items = items.filter((s) => s.enabled === opts.enabled);
    }
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Update a schedule. */
  updateSchedule(
    id: string,
    tenantId: string,
    input: UpdateExportScheduleInput,
  ): ExportSchedule | undefined {
    const existing = this.getSchedule(id, tenantId);
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
    this.schedules.set(id, updated);
    return updated;
  }

  /** Delete a schedule. */
  deleteSchedule(id: string, tenantId: string): boolean {
    const existing = this.getSchedule(id, tenantId);
    if (!existing) return false;
    this.schedules.delete(id);
    this.runHistory.delete(id);
    return true;
  }

  /**
   * Execute a scheduled export manually or via cron trigger.
   * Uses demo data — in production would fetch from relevant service.
   */
  async executeSchedule(
    id: string,
    tenantId: string,
  ): Promise<{ content: string; contentType: string; filename: string } | null> {
    const logger = getLogger();
    const schedule = this.getSchedule(id, tenantId);
    if (!schedule) return null;

    try {
      // Demo data — production would fetch from IOC/alert/correlation service
      const demoData: Record<string, unknown>[] = [
        { id: 'export-1', type: 'ip', value: '10.0.0.1', severity: 'high', confidence: 85, createdAt: new Date().toISOString() },
        { id: 'export-2', type: 'domain', value: 'scheduled-export.example.com', severity: 'medium', confidence: 70, createdAt: new Date().toISOString() },
      ];

      const result = await this.bulkExport.export(
        {
          format: schedule.format,
          entityType: schedule.entityType as 'iocs',
          filters: schedule.filters as { severity?: 'critical' | 'high' | 'medium' | 'low' | 'info' },
          limit: schedule.limit,
        },
        demoData,
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

      // Record run
      const history = this.runHistory.get(id) ?? [];
      history.unshift({
        runAt: now,
        status: 'success',
        recordCount: demoData.length,
        format: schedule.format,
      });
      // Keep last 50 runs
      if (history.length > 50) history.length = 50;
      this.runHistory.set(id, history);

      logger.info({ scheduleId: id, format: schedule.format, records: demoData.length }, 'Export schedule executed');
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

      const history = this.runHistory.get(id) ?? [];
      history.unshift({ runAt: now, status: 'failure', error: errorMsg, recordCount: 0, format: schedule.format });
      if (history.length > 50) history.length = 50;
      this.runHistory.set(id, history);

      logger.error({ scheduleId: id, error: errorMsg }, 'Export schedule failed');
      return null;
    }
  }

  /** Get run history for a schedule. */
  getRunHistory(
    id: string,
    tenantId: string,
    opts: { page: number; limit: number },
  ): { data: Array<{ runAt: string; status: string; error?: string; recordCount: number; format: string }>; total: number } | null {
    const schedule = this.getSchedule(id, tenantId);
    if (!schedule) return null;

    const history = this.runHistory.get(id) ?? [];
    const total = history.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: history.slice(start, start + opts.limit), total };
  }

  /** Get schedules due for execution. */
  getSchedulesDue(tenantId: string): ExportSchedule[] {
    const now = new Date().toISOString();
    return Array.from(this.schedules.values())
      .filter((s) => s.tenantId === tenantId && s.enabled)
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
