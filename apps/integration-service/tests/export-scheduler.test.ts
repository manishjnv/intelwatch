import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExportScheduler } from '../src/services/export-scheduler.js';
import { BulkExportService } from '../src/services/bulk-export.js';
import { StixExportService } from '../src/services/stix-export.js';
import { MemoryDocRepo } from '../src/services/doc-repo.js';
import type { DocRepo } from '../src/services/doc-repo.js';
import type { CreateExportScheduleInput, ExportSchedule } from '../src/schemas/integration.js';
import type { ExportRun } from '../src/services/export-scheduler.js';

const fakeFetchRecords = vi.fn().mockResolvedValue([
  { id: 'a', type: 'ip', value: '1.2.3.4', severity: 'high', confidence: 80, createdAt: new Date().toISOString() },
]);

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
  let schedulesRepo: DocRepo<ExportSchedule>;

  beforeEach(() => {
    const stixExport = new StixExportService();
    bulkExport = new BulkExportService(stixExport);
    schedulesRepo = new MemoryDocRepo<ExportSchedule>();
    scheduler = new ExportScheduler(bulkExport, fakeFetchRecords, schedulesRepo, new MemoryDocRepo<ExportRun>());
  });

  // ─── CRUD ───────────────────────────────────────────────────

  it('creates an export schedule', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
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

  it('gets a schedule by ID and tenant', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(await scheduler.getSchedule(s.id, TENANT)).toEqual(s);
  });

  it('returns undefined for wrong tenant', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(await scheduler.getSchedule(s.id, 'other-tenant')).toBeUndefined();
  });

  it('lists schedules for a tenant', async () => {
    await scheduler.createSchedule(TENANT, makeScheduleInput());
    await scheduler.createSchedule(TENANT, makeScheduleInput({ name: 'Weekly Export', cronExpression: '0 0 * * 1' }));
    const result = await scheduler.listSchedules(TENANT, { page: 1, limit: 50 });
    expect(result.total).toBe(2);
  });

  it('lists schedules filtered by enabled', async () => {
    await scheduler.createSchedule(TENANT, makeScheduleInput());
    await scheduler.createSchedule(TENANT, makeScheduleInput({ name: 'Disabled', enabled: false }));
    const result = await scheduler.listSchedules(TENANT, { enabled: true, page: 1, limit: 50 });
    expect(result.total).toBe(1);
    expect(result.data[0]!.name).toBe('Daily IOC Export');
  });

  it('updates a schedule', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    const updated = await scheduler.updateSchedule(s.id, TENANT, {
      name: 'Updated Schedule',
      format: 'csv',
      cronExpression: '0 12 * * *',
    });
    expect(updated?.name).toBe('Updated Schedule');
    expect(updated?.format).toBe('csv');
    expect(updated?.cronExpression).toBe('0 12 * * *');
    expect(updated?.nextRunAt).toBeDefined(); // recalculated
  });

  it('returns undefined when updating wrong tenant', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(await scheduler.updateSchedule(s.id, 'other', { name: 'X' })).toBeUndefined();
  });

  it('deletes a schedule', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(await scheduler.deleteSchedule(s.id, TENANT)).toBe(true);
    expect(await scheduler.getSchedule(s.id, TENANT)).toBeUndefined();
  });

  it('returns false when deleting wrong tenant', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    expect(await scheduler.deleteSchedule(s.id, 'other')).toBe(false);
  });

  // ─── Cron Validation ───────────────────────────────────────

  it('validates correct cron expressions', async () => {
    expect(scheduler.isValidCron('0 6 * * *')).toBe(true);   // daily at 6am
    expect(scheduler.isValidCron('*/5 * * * *')).toBe(true);  // every 5 min
    expect(scheduler.isValidCron('0 0 1 * *')).toBe(true);    // monthly
    expect(scheduler.isValidCron('0 0 * * 1')).toBe(true);    // weekly monday
  });

  it('rejects invalid cron expressions', async () => {
    expect(scheduler.isValidCron('invalid')).toBe(false);
    expect(scheduler.isValidCron('0 6')).toBe(false);         // too few fields
    expect(scheduler.isValidCron('0 6 * * * * *')).toBe(false); // too many fields
  });

  it('rejects schedule with invalid cron', async () => {
    await expect(
      scheduler.createSchedule(TENANT, makeScheduleInput({ cronExpression: 'bad' })),
    ).rejects.toThrow('Invalid cron');
  });

  it('rejects update with invalid cron', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    await expect(
      scheduler.updateSchedule(s.id, TENANT, { cronExpression: 'bad' }),
    ).rejects.toThrow('Invalid cron');
  });

  // ─── Execution ──────────────────────────────────────────────

  it('executes a scheduled export successfully', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    const result = await scheduler.executeSchedule(s.id, TENANT);

    expect(result).toBeDefined();
    expect(result?.contentType).toBe('application/json');
    expect(result?.filename).toContain('etip-iocs-export');

    // Check state updated
    const updated = await scheduler.getSchedule(s.id, TENANT);
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
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    await scheduler.executeSchedule(s.id, TENANT);
    await scheduler.executeSchedule(s.id, TENANT);

    const history = await scheduler.getRunHistory(s.id, TENANT, { page: 1, limit: 50 });
    expect(history?.total).toBe(2);
    expect(history?.data[0]!.status).toBe('success');
    expect(history?.data[0]!.recordCount).toBeGreaterThan(0);
  });

  it('returns null for history of nonexistent schedule', async () => {
    expect(await scheduler.getRunHistory('no-such', TENANT, { page: 1, limit: 50 })).toBeNull();
  });

  // ─── Due Schedules ─────────────────────────────────────────

  it('getSchedulesDue returns schedules with past nextRunAt', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput());
    // Manually set nextRunAt to past (direct repo write — nextRunAt isn't a settable API field)
    await schedulesRepo.save({ ...s, nextRunAt: new Date(Date.now() - 60000).toISOString() });

    const due = await scheduler.getSchedulesDue(TENANT);
    expect(due.some((d) => d.id === s.id)).toBe(true);
  });

  it('getSchedulesDue excludes disabled schedules', async () => {
    const s = await scheduler.createSchedule(TENANT, makeScheduleInput({ enabled: false }));
    await schedulesRepo.save({ ...s, nextRunAt: new Date(Date.now() - 60000).toISOString() });

    const due = await scheduler.getSchedulesDue(TENANT);
    expect(due.some((d) => d.id === s.id)).toBe(false);
  });

  // ─── Next Run Calculation ──────────────────────────────────

  it('calculateNextRun returns a future ISO date', async () => {
    const next = scheduler.calculateNextRun('0 6 * * *');
    const nextDate = new Date(next);
    expect(nextDate.getTime()).toBeGreaterThan(Date.now() - 1000); // at most 1s before now (race)
    expect(nextDate.getMinutes()).toBe(0);
  });

  // ─── Pagination ─────────────────────────────────────────────

  it('paginates schedule list', async () => {
    for (let i = 0; i < 5; i++) {
      await scheduler.createSchedule(TENANT, makeScheduleInput({ name: `Export ${i}` }));
    }
    const page1 = await scheduler.listSchedules(TENANT, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(5);
  });
});
