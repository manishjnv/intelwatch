import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { EVENTS } from '@etip/shared-utils';
import {
  GlobalIocAlertHandler,
  type CriticalIocPayload,
  type UpdatedIocPayload,
  type SubscriptionRepository,
  type TenantSubscription,
} from '../src/handlers/global-ioc-alert-handler.js';
import { AlertStore } from '../src/services/alert-store.js';

function makeSub(tenantId: string, config: TenantSubscription['alertConfig'] = {}): TenantSubscription {
  return { tenantId, globalFeedId: 'gf-1', alertConfig: config };
}

function criticalPayload(overrides: Partial<CriticalIocPayload> = {}): CriticalIocPayload {
  return {
    globalIocId: 'ioc-1',
    globalFeedId: 'gf-1',
    iocType: 'ip',
    value: '185.220.101.34',
    confidence: 92,
    severity: 'critical',
    stixConfidenceTier: 'High',
    crossFeedCorroboration: 4,
    enrichmentSummary: 'Tor exit node used by APT28',
    ...overrides,
  };
}

describe('GlobalIocAlertHandler', () => {
  let alertStore: AlertStore;
  let subRepo: SubscriptionRepository;
  let handler: GlobalIocAlertHandler;
  let subs: TenantSubscription[];

  beforeEach(() => {
    alertStore = new AlertStore(1000);
    vi.spyOn(alertStore, 'create');
    subs = [
      makeSub('tenant-1', { minSeverity: 'high', minConfidence: 80 }),
      makeSub('tenant-2', { minSeverity: 'critical', minConfidence: 90 }),
      makeSub('tenant-3', { iocTypes: ['domain'] }),
    ];
    subRepo = {
      getSubscriptionsForFeed: vi.fn().mockResolvedValue(subs),
      getAllSubscriptions: vi.fn().mockResolvedValue(subs),
    };
    handler = new GlobalIocAlertHandler(alertStore, subRepo);
  });

  // ─── handleCriticalIoc ───────────────────────────────────────

  it('fans out to all subscribed tenants that pass filters', async () => {
    const count = await handler.handleCriticalIoc(criticalPayload());
    // tenant-1: severity=critical >= high ✓, confidence=92 >= 80 ✓ → alert
    // tenant-2: severity=critical >= critical ✓, confidence=92 >= 90 ✓ → alert
    // tenant-3: iocTypes=['domain'], iocType='ip' → NO alert
    expect(count).toBe(2);
    expect(alertStore.create).toHaveBeenCalledTimes(2);
  });

  it('respects tenant minSeverity filter', async () => {
    const count = await handler.handleCriticalIoc(criticalPayload({ severity: 'medium' }));
    // tenant-1: medium < high → no
    // tenant-2: medium < critical → no
    // tenant-3: iocTypes=['domain'] → no
    expect(count).toBe(0);
  });

  it('respects tenant minConfidence filter', async () => {
    const count = await handler.handleCriticalIoc(criticalPayload({ confidence: 85 }));
    // tenant-1: 85 >= 80 ✓
    // tenant-2: 85 < 90 → no
    // tenant-3: iocTypes=['domain'] → no
    expect(count).toBe(1);
  });

  it('respects tenant iocTypes filter', async () => {
    const count = await handler.handleCriticalIoc(criticalPayload({ iocType: 'domain' }));
    // tenant-1: ✓
    // tenant-2: ✓
    // tenant-3: iocTypes=['domain'] matches → ✓
    expect(count).toBe(3);
  });

  it('tenant not subscribed → no alert', async () => {
    (subRepo.getSubscriptionsForFeed as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const count = await handler.handleCriticalIoc(criticalPayload());
    expect(count).toBe(0);
    expect(alertStore.create).not.toHaveBeenCalled();
  });

  it('alert payload includes correct fields', async () => {
    subs = [makeSub('tenant-1', {})];
    (subRepo.getSubscriptionsForFeed as ReturnType<typeof vi.fn>).mockResolvedValue(subs);
    await handler.handleCriticalIoc(criticalPayload());
    expect(alertStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: 'global-ioc-critical',
        tenantId: 'tenant-1',
        severity: 'critical',
        title: expect.stringContaining('[GLOBAL]'),
        source: expect.objectContaining({
          globalIocId: 'ioc-1',
          origin: 'global_pipeline',
        }),
      }),
    );
  });

  it('logs correct notification count', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const h = new GlobalIocAlertHandler(alertStore, subRepo, logger);
    await h.handleCriticalIoc(criticalPayload());
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ notified: 2, total: 3 }),
      expect.stringContaining('notified 2/3'),
    );
  });

  // ─── handleUpdatedIoc ────────────────────────────────────────

  it('confidence jump >= 20 → alerts', async () => {
    subs = [makeSub('tenant-1', {})];
    (subRepo.getSubscriptionsForFeed as ReturnType<typeof vi.fn>).mockResolvedValue(subs);
    const payload: UpdatedIocPayload = {
      globalIocId: 'ioc-1', globalFeedId: 'gf-1', iocType: 'ip', value: '1.2.3.4',
      previousConfidence: 50, newConfidence: 75, severity: 'high',
      previousLifecycle: 'active', newLifecycle: 'active',
    };
    const count = await handler.handleUpdatedIoc(payload);
    expect(count).toBe(1);
  });

  it('confidence jump < 20 → no alert', async () => {
    subs = [makeSub('tenant-1', {})];
    (subRepo.getSubscriptionsForFeed as ReturnType<typeof vi.fn>).mockResolvedValue(subs);
    const payload: UpdatedIocPayload = {
      globalIocId: 'ioc-1', globalFeedId: 'gf-1', iocType: 'ip', value: '1.2.3.4',
      previousConfidence: 50, newConfidence: 60, severity: 'high',
      previousLifecycle: 'active', newLifecycle: 'active',
    };
    const count = await handler.handleUpdatedIoc(payload);
    expect(count).toBe(0);
  });

  it('lifecycle new→active → alerts', async () => {
    subs = [makeSub('tenant-1', {})];
    (subRepo.getSubscriptionsForFeed as ReturnType<typeof vi.fn>).mockResolvedValue(subs);
    const payload: UpdatedIocPayload = {
      globalIocId: 'ioc-1', globalFeedId: 'gf-1', iocType: 'ip', value: '1.2.3.4',
      previousConfidence: 50, newConfidence: 55, severity: 'high',
      previousLifecycle: 'new', newLifecycle: 'active',
    };
    const count = await handler.handleUpdatedIoc(payload);
    expect(count).toBe(1);
  });

  it('lifecycle active→active → no alert (no change)', async () => {
    subs = [makeSub('tenant-1', {})];
    (subRepo.getSubscriptionsForFeed as ReturnType<typeof vi.fn>).mockResolvedValue(subs);
    const payload: UpdatedIocPayload = {
      globalIocId: 'ioc-1', globalFeedId: 'gf-1', iocType: 'ip', value: '1.2.3.4',
      previousConfidence: 80, newConfidence: 85, severity: 'high',
      previousLifecycle: 'active', newLifecycle: 'active',
    };
    const count = await handler.handleUpdatedIoc(payload);
    expect(count).toBe(0);
  });

  // ─── registerEventListeners ──────────────────────────────────

  it('subscribes to both global events', () => {
    const bus = new EventEmitter();
    vi.spyOn(bus, 'on');
    handler.registerEventListeners(bus);
    expect(bus.on).toHaveBeenCalledWith(EVENTS.GLOBAL_IOC_CRITICAL, expect.any(Function));
    expect(bus.on).toHaveBeenCalledWith(EVENTS.GLOBAL_IOC_UPDATED, expect.any(Function));
  });
});
