import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';

export interface ScheduledMaintenance {
  id: string;
  title: string;
  cronExpr: string;
  durationMinutes: number;
  scope: string;
  notifyBefore: number; // minutes
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledMaintenanceInput {
  title: string;
  cronExpr: string;
  durationMinutes: number;
  scope: string;
  notifyBefore: number;
  enabled?: boolean;
}

const CRON_REGEX = /^(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)\s+(\*|[0-9,\-*/]+)$/;

/** Validate a cron expression (5-field standard). */
export function isValidCron(expr: string): boolean {
  return CRON_REGEX.test(expr.trim());
}

/** In-memory store for scheduled maintenance jobs (DECISION-013, P0 #8). */
export class ScheduledMaintenanceStore {
  private _jobs: Map<string, ScheduledMaintenance> = new Map();

  /** Create a scheduled maintenance job. Validates cron expression. */
  create(input: CreateScheduledMaintenanceInput): ScheduledMaintenance {
    if (!isValidCron(input.cronExpr)) {
      throw new AppError(400, `Invalid cron expression: ${input.cronExpr}`, 'VALIDATION_ERROR');
    }
    const now = new Date().toISOString();
    const job: ScheduledMaintenance = {
      id: randomUUID(),
      title: input.title,
      cronExpr: input.cronExpr,
      durationMinutes: input.durationMinutes,
      scope: input.scope,
      notifyBefore: input.notifyBefore,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this._jobs.set(job.id, job);
    return job;
  }

  /** List all scheduled jobs. */
  list(): ScheduledMaintenance[] {
    return Array.from(this._jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /** Get a job by id. */
  getById(id: string): ScheduledMaintenance | undefined {
    return this._jobs.get(id);
  }

  /** Toggle enabled state. */
  toggle(id: string, enabled: boolean): ScheduledMaintenance | undefined {
    const job = this._jobs.get(id);
    if (!job) return undefined;
    const updated = { ...job, enabled, updatedAt: new Date().toISOString() };
    this._jobs.set(id, updated);
    return updated;
  }

  /** Delete a job. */
  delete(id: string): boolean {
    return this._jobs.delete(id);
  }
}
