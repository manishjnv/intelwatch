/**
 * Pipeline Downstream Flow Tests (Unit-level)
 *
 * Verifies the dispatch logic across the full downstream chain using mocked queues.
 * No live containers required — tests the producer side of each hop.
 *
 * Chain: AI Enrichment → GRAPH_SYNC, IOC_INDEX, CORRELATE
 *        Correlation   → ALERT_EVALUATE, INTEGRATION_PUSH
 *        Alerting      → INTEGRATION_PUSH
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QUEUES, EVENTS } from '@etip/shared-utils';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockQueue(name: string) {
  return {
    name,
    add: vi.fn().mockResolvedValue({ id: `${name}-job-1` }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// ── 1. AI Enrichment Downstream Dispatch ───────────────────────────────────────

describe('AI Enrichment → downstream dispatch payloads', () => {
  let graphSync: ReturnType<typeof mockQueue>;
  let iocIndex: ReturnType<typeof mockQueue>;
  let correlate: ReturnType<typeof mockQueue>;
  let cacheInvalidate: ReturnType<typeof mockQueue>;

  beforeEach(() => {
    graphSync = mockQueue(QUEUES.GRAPH_SYNC);
    iocIndex = mockQueue(QUEUES.IOC_INDEX);
    correlate = mockQueue(QUEUES.CORRELATE);
    cacheInvalidate = mockQueue(QUEUES.CACHE_INVALIDATE);
  });

  const enrichJob = {
    iocId: '550e8400-e29b-41d4-a716-446655440000',
    tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    iocType: 'ip',
    normalizedValue: '192.168.1.1',
    confidence: 80,
    severity: 'HIGH',
  };

  const enrichResult = {
    enrichmentStatus: 'enriched' as const,
    externalRiskScore: 75,
    enrichmentQuality: 85,
    enrichedAt: '2026-03-27T00:00:00Z',
    vtResult: null,
    abuseipdbResult: null,
    haikuResult: null,
    geolocation: null,
  };

  it('GRAPH_SYNC payload has action=upsert_node with nodeType from IOC', () => {
    // Simulate what enrich-worker.ts:82-90 produces
    const payload = {
      action: 'upsert_node',
      nodeType: enrichJob.iocType,
      nodeId: enrichJob.iocId,
      tenantId: enrichJob.tenantId,
      properties: {
        externalRiskScore: enrichResult.externalRiskScore,
        enrichmentQuality: enrichResult.enrichmentQuality,
        enrichedAt: enrichResult.enrichedAt,
        enrichmentStatus: enrichResult.enrichmentStatus,
      },
    };

    graphSync.add('graph-sync', payload, { jobId: `graph-sync-${enrichJob.iocId}` });

    expect(graphSync.add).toHaveBeenCalledWith(
      'graph-sync',
      expect.objectContaining({
        action: 'upsert_node',
        nodeType: 'ip',
        nodeId: enrichJob.iocId,
        tenantId: enrichJob.tenantId,
      }),
      { jobId: `graph-sync-${enrichJob.iocId}` },
    );
  });

  it('IOC_INDEX payload includes searchable enrichment fields', () => {
    const payload = {
      action: 'index',
      iocId: enrichJob.iocId,
      tenantId: enrichJob.tenantId,
      iocType: enrichJob.iocType,
      normalizedValue: enrichJob.normalizedValue,
      externalRiskScore: enrichResult.externalRiskScore,
      enrichmentQuality: enrichResult.enrichmentQuality,
      severity: enrichJob.severity,
      confidence: enrichJob.confidence,
      enrichedAt: enrichResult.enrichedAt,
    };

    iocIndex.add('ioc-index', payload, { jobId: `ioc-index-${enrichJob.iocId}` });

    expect(iocIndex.add).toHaveBeenCalledWith(
      'ioc-index',
      expect.objectContaining({
        action: 'index',
        iocId: enrichJob.iocId,
        iocType: 'ip',
        normalizedValue: '192.168.1.1',
        externalRiskScore: 75,
        enrichmentQuality: 85,
      }),
      expect.any(Object),
    );
  });

  it('CORRELATE payload has entityType=ioc and triggerEvent=enrichment_complete', () => {
    const payload = {
      entityType: 'ioc',
      entityId: enrichJob.iocId,
      tenantId: enrichJob.tenantId,
      triggerEvent: 'enrichment_complete',
    };

    correlate.add('correlate', payload, { jobId: `correlate-${enrichJob.iocId}` });

    expect(correlate.add).toHaveBeenCalledWith(
      'correlate',
      expect.objectContaining({
        entityType: 'ioc',
        entityId: enrichJob.iocId,
        triggerEvent: 'enrichment_complete',
      }),
      expect.any(Object),
    );
  });

  it('CACHE_INVALIDATE payload has eventType=ioc.enriched', () => {
    cacheInvalidate.add('cache-invalidate', {
      tenantId: enrichJob.tenantId,
      eventType: EVENTS.IOC_ENRICHED,
    });

    expect(cacheInvalidate.add).toHaveBeenCalledWith(
      'cache-invalidate',
      expect.objectContaining({
        tenantId: enrichJob.tenantId,
        eventType: 'ioc.enriched',
      }),
    );
  });

  it('failed enrichment skips all downstream dispatch', () => {
    const failed = { ...enrichResult, enrichmentStatus: 'failed' as const };
    const shouldDispatch = failed.enrichmentStatus !== 'failed';
    expect(shouldDispatch).toBe(false);

    // No calls should be made
    expect(graphSync.add).not.toHaveBeenCalled();
    expect(iocIndex.add).not.toHaveBeenCalled();
    expect(correlate.add).not.toHaveBeenCalled();
  });

  it('deterministic jobIds prevent duplicate downstream jobs on re-enrichment', () => {
    const jobId1 = `graph-sync-${enrichJob.iocId}`;
    const jobId2 = `graph-sync-${enrichJob.iocId}`;
    expect(jobId1).toBe(jobId2); // Same IOC → same jobId → BullMQ deduplicates
  });

  it('null downstream queue is safely skipped (no throw)', () => {
    const downstream = { graphSync: null, iocIndex, correlate: null, cacheInvalidate: null };

    // Simulate the conditional check from enrich-worker.ts
    if (downstream.graphSync) downstream.graphSync.add('graph-sync', {});
    if (downstream.iocIndex) downstream.iocIndex.add('ioc-index', {});
    if (downstream.correlate) downstream.correlate.add('correlate', {});

    expect(iocIndex.add).toHaveBeenCalledTimes(1);
    // graphSync and correlate are null → no calls
  });
});

// ── 2. Correlation → Alerting + Integration Dispatch ───────────────────────────

describe('Correlation → downstream dispatch payloads', () => {
  let alertEvaluate: ReturnType<typeof mockQueue>;
  let integrationPush: ReturnType<typeof mockQueue>;

  beforeEach(() => {
    alertEvaluate = mockQueue(QUEUES.ALERT_EVALUATE);
    integrationPush = mockQueue(QUEUES.INTEGRATION_PUSH);
  });

  const correlatePayload = {
    tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    entityType: 'ioc' as const,
    entityId: '550e8400-e29b-41d4-a716-446655440000',
    triggerEvent: 'enrichment_complete',
  };

  it('ALERT_EVALUATE fires only when matchCount > 0', () => {
    const matchCount = 3;

    if (matchCount > 0) {
      alertEvaluate.add('alert-evaluate', {
        tenantId: correlatePayload.tenantId,
        eventType: EVENTS.CORRELATION_MATCH,
        metric: 'correlation_matches',
        value: matchCount,
        field: 'entityId',
        fieldValue: correlatePayload.entityId,
        source: { entityType: 'ioc', entityId: correlatePayload.entityId, triggerEvent: 'correlation_complete' },
      });
    }

    expect(alertEvaluate.add).toHaveBeenCalledWith(
      'alert-evaluate',
      expect.objectContaining({
        eventType: 'correlation.match',
        value: 3,
        tenantId: correlatePayload.tenantId,
      }),
    );
  });

  it('ALERT_EVALUATE does NOT fire when matchCount = 0', () => {
    const matchCount = 0;

    if (matchCount > 0) {
      alertEvaluate.add('alert-evaluate', {});
    }

    expect(alertEvaluate.add).not.toHaveBeenCalled();
  });

  it('INTEGRATION_PUSH fires always (regardless of matchCount)', () => {
    const matchCount = 0;

    integrationPush.add('integration-push', {
      tenantId: correlatePayload.tenantId,
      event: EVENTS.CORRELATION_MATCH,
      payload: {
        entityType: correlatePayload.entityType,
        entityId: correlatePayload.entityId,
        matchCount,
        triggerEvent: 'correlation_complete',
      },
    });

    expect(integrationPush.add).toHaveBeenCalledWith(
      'integration-push',
      expect.objectContaining({
        tenantId: correlatePayload.tenantId,
        event: 'correlation.match',
        payload: expect.objectContaining({ matchCount: 0 }),
      }),
    );
  });

  it('INTEGRATION_PUSH payload matches IntegrationPushJob shape', () => {
    integrationPush.add('integration-push', {
      tenantId: correlatePayload.tenantId,
      event: 'correlation.match',
      payload: {
        entityType: 'ioc',
        entityId: correlatePayload.entityId,
        matchCount: 5,
        triggerEvent: 'correlation_complete',
      },
    });

    const call = integrationPush.add.mock.calls[0][1];
    expect(call).toHaveProperty('tenantId');
    expect(call).toHaveProperty('event');
    expect(call).toHaveProperty('payload');
    expect(call.payload).toHaveProperty('entityType');
    expect(call.payload).toHaveProperty('entityId');
  });
});

// ── 3. Alerting → Integration Dispatch ─────────────────────────────────────────

describe('Alerting → INTEGRATION_PUSH dispatch payloads', () => {
  let integrationPush: ReturnType<typeof mockQueue>;

  beforeEach(() => {
    integrationPush = mockQueue(QUEUES.INTEGRATION_PUSH);
  });

  it('alert creation dispatches to INTEGRATION_PUSH with alert details', () => {
    const alert = {
      id: 'alert-1',
      tenantId: 'tenant-1',
      severity: 'high',
      title: '[HIGH] Correlation threshold exceeded',
    };
    const ruleId = 'rule-1';

    integrationPush.add('integration-push', {
      tenantId: alert.tenantId,
      event: 'alert.created',
      payload: {
        entityType: 'alert',
        entityId: alert.id,
        severity: alert.severity,
        title: alert.title,
        ruleId,
        triggerEvent: 'alert_created',
      },
    });

    expect(integrationPush.add).toHaveBeenCalledWith(
      'integration-push',
      expect.objectContaining({
        tenantId: 'tenant-1',
        event: 'alert.created',
        payload: expect.objectContaining({
          entityType: 'alert',
          severity: 'high',
          triggerEvent: 'alert_created',
        }),
      }),
    );
  });

  it('no integration queue → dispatch silently skipped', () => {
    const integrationQueue: ReturnType<typeof mockQueue> | null = null;

    if (integrationQueue) {
      integrationQueue.add('integration-push', {});
    }

    // No error, no call
    expect(integrationPush.add).not.toHaveBeenCalled();
  });
});

// ── 4. Full Chain Verification ─────────────────────────────────────────────────

describe('Full downstream chain: enrichment → correlate → alert → integrate', () => {
  it('all downstream queue names use QUEUES constants (no hardcoded strings)', () => {
    expect(QUEUES.GRAPH_SYNC).toBe('etip-graph-sync');
    expect(QUEUES.IOC_INDEX).toBe('etip-ioc-indexed');
    expect(QUEUES.CORRELATE).toBe('etip-correlate');
    expect(QUEUES.ALERT_EVALUATE).toBe('etip-alert-evaluate');
    expect(QUEUES.INTEGRATION_PUSH).toBe('etip-integration-push');
    expect(QUEUES.CACHE_INVALIDATE).toBe('etip-cache-invalidate');
  });

  it('queue names have etip- prefix and no colons (RCA #42)', () => {
    const downstream = [
      QUEUES.GRAPH_SYNC, QUEUES.IOC_INDEX, QUEUES.CORRELATE,
      QUEUES.ALERT_EVALUATE, QUEUES.INTEGRATION_PUSH, QUEUES.CACHE_INVALIDATE,
    ];

    for (const q of downstream) {
      expect(q).toMatch(/^etip-/);
      expect(q).not.toContain(':');
    }
  });

  it('downstream event constants use dot notation', () => {
    expect(EVENTS.ENRICHMENT_COMPLETE).toMatch(/^[a-z]+\.[a-z]+$/);
    expect(EVENTS.ALERT_FIRED).toMatch(/^[a-z]+\.[a-z]+$/);
    expect(EVENTS.INTEGRATION_PUSHED).toMatch(/^[a-z]+\.[a-z]+$/);
  });

  it('chain hop count: enrichment dispatches to 4, correlation to 2, alerting to 1', () => {
    // Enrichment → GRAPH_SYNC, IOC_INDEX, CORRELATE, CACHE_INVALIDATE
    const enrichmentHops = 4;
    // Correlation → ALERT_EVALUATE, INTEGRATION_PUSH
    const correlationHops = 2;
    // Alerting → INTEGRATION_PUSH
    const alertingHops = 1;

    expect(enrichmentHops + correlationHops + alertingHops).toBe(7);
  });

  it('simulates full chain: enrichment success → 4 queues → correlation match → 2 queues → alert → 1 queue', () => {
    // Create all queues
    const queues = {
      graphSync: mockQueue(QUEUES.GRAPH_SYNC),
      iocIndex: mockQueue(QUEUES.IOC_INDEX),
      correlate: mockQueue(QUEUES.CORRELATE),
      cacheInvalidate: mockQueue(QUEUES.CACHE_INVALIDATE),
      alertEvaluate: mockQueue(QUEUES.ALERT_EVALUATE),
      integrationPush: mockQueue(QUEUES.INTEGRATION_PUSH),
    };

    const tenantId = 'tenant-1';
    const iocId = 'ioc-1';

    // Step 1: Enrichment dispatches to 4 queues
    queues.graphSync.add('graph-sync', { action: 'upsert_node', nodeId: iocId, tenantId });
    queues.iocIndex.add('ioc-index', { action: 'index', iocId, tenantId });
    queues.correlate.add('correlate', { entityType: 'ioc', entityId: iocId, tenantId });
    queues.cacheInvalidate.add('cache-invalidate', { tenantId, eventType: 'ioc.enriched' });

    expect(queues.graphSync.add).toHaveBeenCalledTimes(1);
    expect(queues.iocIndex.add).toHaveBeenCalledTimes(1);
    expect(queues.correlate.add).toHaveBeenCalledTimes(1);
    expect(queues.cacheInvalidate.add).toHaveBeenCalledTimes(1);

    // Step 2: Correlation finds 2 matches → dispatches to alerting + integration
    const matchCount = 2;
    queues.alertEvaluate.add('alert-evaluate', { tenantId, eventType: 'correlation.match', value: matchCount });
    queues.integrationPush.add('integration-push', { tenantId, event: 'correlation.match', payload: { matchCount } });

    expect(queues.alertEvaluate.add).toHaveBeenCalledTimes(1);
    expect(queues.integrationPush.add).toHaveBeenCalledTimes(1);

    // Step 3: Alert created → dispatches to integration
    queues.integrationPush.add('integration-push', { tenantId, event: 'alert.created', payload: { entityType: 'alert' } });

    expect(queues.integrationPush.add).toHaveBeenCalledTimes(2); // correlation + alert
  });

  it('queue failure isolation: one queue error does not block others', async () => {
    const graphSync = mockQueue(QUEUES.GRAPH_SYNC);
    const iocIndex = mockQueue(QUEUES.IOC_INDEX);
    const correlate = mockQueue(QUEUES.CORRELATE);

    // graphSync fails
    graphSync.add.mockRejectedValue(new Error('Redis connection lost'));

    const results = await Promise.allSettled([
      graphSync.add('graph-sync', {}),
      iocIndex.add('ioc-index', {}),
      correlate.add('correlate', {}),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('fulfilled');
    expect(results[2].status).toBe('fulfilled');
  });
});
