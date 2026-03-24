import { randomUUID } from 'crypto';
import cron from 'node-cron';
import { AppError } from '@etip/shared-utils';
import type { ReportType, ReportFormat, CreateScheduleDto, UpdateScheduleDto } from '../schemas/report.js';

export interface ScheduleRecord {
  id: string;
  name: string;
  reportType: ReportType;
  format: ReportFormat;
  cronExpression: string;
  tenantId: string;
  enabled: boolean;
  filters: Record<string, unknown>;
  configVersion: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleCallback = (schedule: ScheduleRecord) => void;

export class ScheduleStore {
  private _schedules: Map<string, ScheduleRecord> = new Map();
  private _cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private _callback: ScheduleCallback | null = null;

  setCallback(cb: ScheduleCallback): void {
    this._callback = cb;
  }

  create(input: CreateScheduleDto): ScheduleRecord {
    if (!cron.validate(input.cronExpression)) {
      throw new AppError(400, `Invalid cron expression: ${input.cronExpression}`, 'INVALID_CRON');
    }

    const now = new Date().toISOString();
    const schedule: ScheduleRecord = {
      id: randomUUID(),
      name: input.name,
      reportType: input.reportType,
      format: input.format,
      cronExpression: input.cronExpression,
      tenantId: input.tenantId,
      enabled: input.enabled,
      filters: (input.filters as Record<string, unknown>) || {},
      configVersion: input.configVersion,
      lastRunAt: null,
      nextRunAt: null,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this._schedules.set(schedule.id, schedule);

    if (schedule.enabled) {
      this._registerCron(schedule);
    }

    return schedule;
  }

  getById(id: string): ScheduleRecord | undefined {
    return this._schedules.get(id);
  }

  list(tenantId: string): ScheduleRecord[] {
    return Array.from(this._schedules.values())
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  update(id: string, input: UpdateScheduleDto): ScheduleRecord {
    const schedule = this._schedules.get(id);
    if (!schedule) throw new AppError(404, `Schedule not found: ${id}`, 'NOT_FOUND');

    if (input.cronExpression && !cron.validate(input.cronExpression)) {
      throw new AppError(400, `Invalid cron expression: ${input.cronExpression}`, 'INVALID_CRON');
    }

    if (input.name !== undefined) schedule.name = input.name;
    if (input.reportType !== undefined) schedule.reportType = input.reportType;
    if (input.format !== undefined) schedule.format = input.format;
    if (input.cronExpression !== undefined) schedule.cronExpression = input.cronExpression;
    if (input.enabled !== undefined) schedule.enabled = input.enabled;
    if (input.filters !== undefined) schedule.filters = (input.filters as Record<string, unknown>) || {};
    if (input.configVersion !== undefined) schedule.configVersion = input.configVersion;
    schedule.updatedAt = new Date().toISOString();

    this._unregisterCron(id);
    if (schedule.enabled) {
      this._registerCron(schedule);
    }

    return schedule;
  }

  delete(id: string): boolean {
    const exists = this._schedules.has(id);
    if (!exists) return false;

    this._unregisterCron(id);
    this._schedules.delete(id);
    return true;
  }

  markRun(id: string): void {
    const schedule = this._schedules.get(id);
    if (schedule) {
      schedule.lastRunAt = new Date().toISOString();
      schedule.runCount++;
      schedule.updatedAt = new Date().toISOString();
    }
  }

  stopAll(): void {
    for (const [id] of this._cronJobs) {
      this._unregisterCron(id);
    }
  }

  getActiveCount(): number {
    return this._cronJobs.size;
  }

  private _registerCron(schedule: ScheduleRecord): void {
    const task = cron.schedule(schedule.cronExpression, () => {
      this.markRun(schedule.id);
      if (this._callback) {
        this._callback(schedule);
      }
    });

    this._cronJobs.set(schedule.id, task);
  }

  private _unregisterCron(id: string): void {
    const task = this._cronJobs.get(id);
    if (task) {
      task.stop();
      this._cronJobs.delete(id);
    }
  }
}
