import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RetentionCron } from '../src/services/retention-cron.js';
import { ReportStore } from '../src/services/report-store.js';

describe('RetentionCron', () => {
  let store: ReportStore;
  let cron: RetentionCron;

  beforeEach(() => {
    store = new ReportStore(100, 30);
    cron = new RetentionCron(store, 1000); // 1s interval for tests
  });

  afterEach(() => {
    cron.stop();
  });

  it('starts and reports isRunning', () => {
    expect(cron.isRunning()).toBe(false);
    cron.start();
    expect(cron.isRunning()).toBe(true);
  });

  it('stops and reports not running', () => {
    cron.start();
    cron.stop();
    expect(cron.isRunning()).toBe(false);
  });

  it('start is idempotent — calling twice does not create duplicate intervals', () => {
    cron.start();
    cron.start();
    expect(cron.isRunning()).toBe(true);
    cron.stop();
    expect(cron.isRunning()).toBe(false);
  });

  it('stop is idempotent — calling twice does not throw', () => {
    cron.stop();
    cron.stop();
    expect(cron.isRunning()).toBe(false);
  });

  it('runOnce returns 0 when no expired reports', () => {
    store.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
    const purged = cron.runOnce();
    expect(purged).toBe(0);
  });

  it('runOnce purges expired reports', () => {
    // Create a store with 0-day retention so reports expire immediately
    const shortStore = new ReportStore(100, 0);
    const shortCron = new RetentionCron(shortStore, 60000);

    shortStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });
    shortStore.create({ type: 'weekly', format: 'json', tenantId: 't1', configVersion: 1 });

    // Advance time so reports are expired
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);

    const purged = shortCron.runOnce();
    expect(purged).toBe(2);

    vi.useRealTimers();
    shortCron.stop();
  });

  it('periodic execution purges on interval', async () => {
    vi.useFakeTimers();

    const shortStore = new ReportStore(100, 0);
    const shortCron = new RetentionCron(shortStore, 100); // 100ms interval

    shortStore.create({ type: 'daily', format: 'json', tenantId: 't1', configVersion: 1 });

    shortCron.start();

    // Advance past the interval
    vi.advanceTimersByTime(200);

    // After purge, list should be empty
    const result = shortStore.list('t1');
    expect(result.total).toBe(0);

    shortCron.stop();
    vi.useRealTimers();
  });
});
