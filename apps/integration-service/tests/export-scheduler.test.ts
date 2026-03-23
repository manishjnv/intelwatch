import { describe, it, expect, beforeEach } from 'vitest';
import { ExportScheduler } from '../src/services/export-scheduler.js';
import { BulkExportService } from '../src/services/bulk-export.js';
import { StixExportService } from '../src/services/stix-export.js';
import type { CreateExportScheduleInput } from '../src/schemas/integration.js';

const TENANT = 'tenant-sched';

const makeScheduleInput = (overrides: Partial<CreateExportScheduleInput> = {}): CreateExportScheduleInput => ({
  name: 'Daily IOC Export',
  cronExpression: '0 6 * * *',
  format: 'json',
  entityType: 'iocs',
  filters: { severity: 'high' },
  enabled: true,
  limit: 500,
  ...overrides,
});

describe('ExportScheduler', () => {
  let scheduler: ExportScheduler;
  let bulkExport: BulkExportService;

  beforeEach(() => {
    const stixExport = new StixExportService();
    bulkExport = new BulkExportService(stixExport);
    scheduler = new ExportScheduler(bulkExport);
  });

  // ─── CRUD ───────────────────────────────────────────────────

  it('creates an export schedule', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(s.id).toBeDefined();
    expect(s.name).toBe('Daily IOC Export');
    expect(s.cronExpression).toBe('0 6 * * *');
    expect(s.format).toBe('json');
    expect(s.entityType).toBe('iocs');
    expect(s.enabled).toBe(true);
    expect(s.limit).toBe(500);
    expect(s.lastRunAt).toBeNull();
    expect(s.lastRunStatus).toBeNull();
    expect(s.nextRunAt).toBeDefined();
    expect(s.runCount).toBe(0);
  });

  it('gets a schedule by ID and tenant', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(scheduler.getSchedule(s.id, TENANT)).toEqual(s);
  });

  it('returns undefined for wrong tenant', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(scheduler.getSchedule(s.id, 'other-tenant')).toBeUndefined();
  });

  it('lists schedules for a tenant', () => {
    scheduler.createSchedule(TENANT, makeScheduleInput());
    scheduler.createSchedule(TENANT, makeScheduleInput({ name: 'Weekly Export', cronExpression: '0 0 * * 1' }));
    const result = scheduler.listSchedules(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(2);
  });

  it('lists schedules filtered by enabled', () => {
    scheduler.createSchedule(TENANT, makeScheduleInput());
    scheduler.createSchedule(TENANT, makeScheduleInput({ name: 'Disabled', enabled: false }));
    const result = scheduler.listSchedules(TENANT, { enabled: true, page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0]!.name).toBe('Daily IOC Export');
  });

  it('updates a schedule', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    const updated = scheduler.updateSchedule(s.id, TENANT, {
      name: 'Updated Schedule',
      format: 'csv',
      cronExpression: '0 12 * * *',
    });
    expect(updated?.name).toBe('Updated Schedule');
    expect(updated?.format).toBe('csv');
    expect(updated?.cronExpression).toBe('0 12 * * *');
    expect(updated?.nextRunAt).toBeDefined(); // recalculated
  });

  it('returns undefined when updating wrong tenant', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(scheduler.updateSchedule(s.id, 'other', { name: 'X' })).toBeUndefined();
  });

  it('deletes a schedule', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(scheduler.deleteSchedule(s.id, TENANT)).toBe(true);
    expect(scheduler.getSchedule(s.id, TENANT)).toBeUndefined();
  });

  it('returns false when deleting wrong tenant', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(scheduler.deleteSchedule(s.id, 'other')).toBe(false);
  });

  // ─── Cron Validation ───────────────────────────────────────

  it('validates correct cron expressions', () => {
    expect(scheduler.isValidCron('0 6 * * *')).toBe(true);   // daily at 6am
    expect(scheduler.isValidCron('*/5 * * * *')).toBe(true);  // every 5 min
    expect(scheduler.isValidCron('0 0 1 * *')).toBe(true);    // monthly
    expect(scheduler.isValidCron('0 0 * * 1')).toBe(true);    // weekly monday
  });

  it('rejects invalid cron expressions', () => {
    expect(scheduler.isValidCron('invalid')).toBe(false);
    expect(scheduler.isValidCron('0 6')).toBe(false);         // too few fields
    expect(scheduler.isValidCron('0 6 * * * * *')).toBe(false); // too many fields
  });

  it('rejects schedule with invalid cron', () => {
    expect(() =>
      scheduler.createSchedule(TENANT, makeScheduleInput({ cronExpression: 'bad' })),
    ).toThrow('Invalid cron');
  });

  it('rejects update with invalid cron', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(() =>
      scheduler.updateSchedule(s.id, TENANT, { cronExpression: 'bad' }),
    ).toThrow('Invalid cron');
  });

  // ─── Execution ──────────────────────────────────────────────

  it('executes a scheduled export successfully', async () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    const result = await scheduler.executeSchedule(s.id, TENANT);

    expect(result).toBeDefined();
    expect(result?.contentType).toBe('application/json');
    expect(result?.filename).toContain('etip-iocs-export');

    // Check state updated
    const updated = scheduler.getSchedule(s.id, TENANT);
    expect(updated?.lastRunAt).toBeDefined();
    expect(updated?.lastRunStatus).toBe('success');
    expect(updated?.lastRunError).toBeNull();
    expect(updated?.runCount).toBe(1);
  });

  it('returns null for nonexistent schedule', async () => {
    const result = await scheduler.executeSchedule('no-such', TENANT);
    expect(result).toBeNull();
  });

  // ─── Run History ────────────────────────────────────────────

  it('tracks run history after execution', async () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    await scheduler.executeSchedule(s.id, TENANT);
    await scheduler.executeSchedule(s.id, TENANT);

    const history = scheduler.getRunHistory(s.id, TENANT, { page: 1, limit: 50 });
    expect(history?.total).toBe(2);
    expect(history?.data[0]!.status).toBe('success');
    expect(history?.data[0]!.recordCount).toBeGreaterThan(0);
  });

  it('returns null for history of nonexistent schedule', () => {
    expect(scheduler.getRunHistory('no-such', TENANT, { page: 1, limit: 50 })).toBeNull();
  });

  // ─── Due Schedules ─────────────────────────────────────────

  it('getSchedulesDue returns schedules with past nextRunAt', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput());
    // Manually set nextRunAt to past
    const schedule = scheduler.getSchedule(s.id, TENANT)!;
    schedule.nextRunAt = new Date(Date.now() - 60000).toISOString();

    const due = scheduler.getSchedulesDue(TENANT);
    expect(due.some((d) => d.id === s.id)).toBe(true);
  });

  it('getSchedulesDue excludes disabled schedules', () => {
    const s = scheduler.createSchedule(TENANT, makeScheduleInput({ enabled: false }));
    const schedule = scheduler.getSchedule(s.id, TENANT)!;
    schedule.nextRunAt = new Date(Date.now() - 60000).toISOString();

    const due = scheduler.getSchedulesDue(TENANT);
    expect(due.some((d) => d.id === s.id)).toBe(false);
  });

  // ─── Next Run Calculation ──────────────────────────────────

  it('calculateNextRun returns a future ISO date', () => {
    const next = scheduler.calculateNextRun('0 6 * * *');
    const nextDate = new Date(next);
    expect(nextDate.getTime()).toBeGreaterThan(Date.now() - 1000); // at most 1s before now (race)
    expect(nextDate.getMinutes()).toBe(0);
  });

  // ─── Pagination ─────────────────────────────────────────────

  it('paginates schedule list', () => {
    for (let i = 0; i < 5; i++) {
      scheduler.createSchedule(TENANT, makeScheduleInput({ name: `Export ${i}` }));
    }
    const page1 = scheduler.listSchedules(TENANT, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
  });
});
