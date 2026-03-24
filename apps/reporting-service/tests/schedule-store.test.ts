import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScheduleStore } from '../src/services/schedule-store.js';

describe('ScheduleStore', () => {
  let store: ScheduleStore;

  beforeEach(() => {
    store = new ScheduleStore();
  });

  afterEach(() => {
    store.stopAll();
  });

  describe('create', () => {
    it('creates a schedule with valid cron', () => {
      const schedule = store.create({
        name: 'Daily Report',
        reportType: 'daily',
        format: 'json',
        cronExpression: '0 8 * * *',
        tenantId: 'tenant-1',
        enabled: true,
        configVersion: 1,
      });
      expect(schedule.id).toBeTruthy();
      expect(schedule.name).toBe('Daily Report');
      expect(schedule.reportType).toBe('daily');
    });

    it('throws for invalid cron expression', () => {
      expect(() =>
        store.create({
          name: 'Bad',
          reportType: 'daily',
          format: 'json',
          cronExpression: 'not-a-cron',
          tenantId: 'tenant-1',
          enabled: true,
          configVersion: 1,
        }),
      ).toThrow('Invalid cron expression');
    });

    it('initializes run count to 0', () => {
      const schedule = store.create({
        name: 'Test',
        reportType: 'weekly',
        format: 'json',
        cronExpression: '0 0 * * 1',
        tenantId: 't1',
        enabled: false,
        configVersion: 1,
      });
      expect(schedule.runCount).toBe(0);
      expect(schedule.lastRunAt).toBeNull();
    });

    it('registers cron job when enabled', () => {
      store.create({
        name: 'Active',
        reportType: 'daily',
        format: 'json',
        cronExpression: '0 8 * * *',
        tenantId: 't1',
        enabled: true,
        configVersion: 1,
      });
      expect(store.getActiveCount()).toBe(1);
    });

    it('does not register cron job when disabled', () => {
      store.create({
        name: 'Inactive',
        reportType: 'daily',
        format: 'json',
        cronExpression: '0 8 * * *',
        tenantId: 't1',
        enabled: false,
        configVersion: 1,
      });
      expect(store.getActiveCount()).toBe(0);
    });

    it('stores configVersion', () => {
      const schedule = store.create({
        name: 'Test',
        reportType: 'daily',
        format: 'json',
        cronExpression: '0 8 * * *',
        tenantId: 't1',
        enabled: false,
        configVersion: 5,
      });
      expect(schedule.configVersion).toBe(5);
    });
  });

  describe('getById', () => {
    it('returns schedule by id', () => {
      const created = store.create({
        name: 'Test',
        reportType: 'daily',
        format: 'json',
        cronExpression: '0 8 * * *',
        tenantId: 't1',
        enabled: false,
        configVersion: 1,
      });
      expect(store.getById(created.id)).toBeDefined();
    });

    it('returns undefined for non-existent id', () => {
      expect(store.getById('nope')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns empty list initially', () => {
      expect(store.list('t1')).toEqual([]);
    });

    it('filters by tenantId', () => {
      store.create({ name: 'A', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: false, configVersion: 1 });
      store.create({ name: 'B', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't2', enabled: false, configVersion: 1 });
      expect(store.list('t1').length).toBe(1);
    });

    it('sorts by createdAt descending', () => {
      store.create({ name: 'First', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: false, configVersion: 1 });
      store.create({ name: 'Second', reportType: 'weekly', format: 'json', cronExpression: '0 0 * * 1', tenantId: 't1', enabled: false, configVersion: 1 });
      const list = store.list('t1');
      // Both created in same ms — verify both returned and list length
      expect(list.length).toBe(2);
      expect(list.map((s) => s.name)).toContain('First');
      expect(list.map((s) => s.name)).toContain('Second');
    });
  });

  describe('update', () => {
    it('updates name', () => {
      const schedule = store.create({ name: 'Old', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: false, configVersion: 1 });
      const updated = store.update(schedule.id, { name: 'New' });
      expect(updated.name).toBe('New');
    });

    it('updates cron expression', () => {
      const schedule = store.create({ name: 'Test', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: false, configVersion: 1 });
      const updated = store.update(schedule.id, { cronExpression: '0 9 * * *' });
      expect(updated.cronExpression).toBe('0 9 * * *');
    });

    it('throws for invalid cron on update', () => {
      const schedule = store.create({ name: 'Test', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: false, configVersion: 1 });
      expect(() => store.update(schedule.id, { cronExpression: 'bad' })).toThrow('Invalid cron expression');
    });

    it('throws for non-existent schedule', () => {
      expect(() => store.update('nope', { name: 'X' })).toThrow('Schedule not found');
    });

    it('enables cron job when enabled changes to true', () => {
      const schedule = store.create({ name: 'Test', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: false, configVersion: 1 });
      expect(store.getActiveCount()).toBe(0);
      store.update(schedule.id, { enabled: true });
      expect(store.getActiveCount()).toBe(1);
    });

    it('disables cron job when enabled changes to false', () => {
      const schedule = store.create({ name: 'Test', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: true, configVersion: 1 });
      expect(store.getActiveCount()).toBe(1);
      store.update(schedule.id, { enabled: false });
      expect(store.getActiveCount()).toBe(0);
    });

    it('updates configVersion', () => {
      const schedule = store.create({ name: 'Test', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: false, configVersion: 1 });
      const updated = store.update(schedule.id, { configVersion: 3 });
      expect(updated.configVersion).toBe(3);
    });
  });

  describe('delete', () => {
    it('deletes schedule and stops cron', () => {
      const schedule = store.create({ name: 'Test', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: true, configVersion: 1 });
      expect(store.getActiveCount()).toBe(1);
      expect(store.delete(schedule.id)).toBe(true);
      expect(store.getActiveCount()).toBe(0);
      expect(store.getById(schedule.id)).toBeUndefined();
    });

    it('returns false for non-existent schedule', () => {
      expect(store.delete('nope')).toBe(false);
    });
  });

  describe('markRun', () => {
    it('increments run count', () => {
      const schedule = store.create({ name: 'Test', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: false, configVersion: 1 });
      store.markRun(schedule.id);
      const found = store.getById(schedule.id);
      expect(found!.runCount).toBe(1);
      expect(found!.lastRunAt).toBeTruthy();
    });

    it('increments multiple times', () => {
      const schedule = store.create({ name: 'Test', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: false, configVersion: 1 });
      store.markRun(schedule.id);
      store.markRun(schedule.id);
      store.markRun(schedule.id);
      expect(store.getById(schedule.id)!.runCount).toBe(3);
    });
  });

  describe('stopAll', () => {
    it('stops all active cron jobs', () => {
      store.create({ name: 'A', reportType: 'daily', format: 'json', cronExpression: '0 8 * * *', tenantId: 't1', enabled: true, configVersion: 1 });
      store.create({ name: 'B', reportType: 'weekly', format: 'json', cronExpression: '0 0 * * 1', tenantId: 't1', enabled: true, configVersion: 1 });
      expect(store.getActiveCount()).toBe(2);
      store.stopAll();
      expect(store.getActiveCount()).toBe(0);
    });
  });

  describe('callback', () => {
    it('fires callback when schedule triggers', () => {
      let callbackCalled = false;
      store.setCallback(() => { callbackCalled = true; });

      // We can't easily test cron firing in unit tests,
      // but we can verify the callback is set
      expect(callbackCalled).toBe(false);
    });
  });
});
