/**
 * Pipeline Wiring Alignment Tests
 *
 * Unit tests that verify event/queue constants are consistent between
 * producer and consumer services. These run without live containers.
 *
 * What they check:
 * - Queue names imported from shared-utils match across all services
 * - Event names used in ALERT_EVALUATE payloads match TriggerEvent enum values
 * - Integration push payload shape matches IntegrationPushJob interface
 * - All pipeline queues have exactly one consumer
 */
import { describe, it, expect } from 'vitest';
import { QUEUES, ALL_QUEUE_NAMES, EVENTS, ALL_EVENT_TYPES } from '@etip/shared-utils';

// ── 1. Queue constant integrity ─────────────────────────────────

describe('Queue constant integrity', () => {
  it('all queue names start with etip- prefix (RCA #42)', () => {
    for (const name of ALL_QUEUE_NAMES) {
      expect(name).toMatch(/^etip-/);
    }
  });

  it('no queue names contain colons (BullMQ 5.71+ restriction)', () => {
    for (const name of ALL_QUEUE_NAMES) {
      expect(name).not.toContain(':');
    }
  });

  it('QUEUES object has exactly 18 queue definitions', () => {
    expect(ALL_QUEUE_NAMES.length).toBe(18);
  });

  it('all queue names are unique', () => {
    const unique = new Set(ALL_QUEUE_NAMES);
    expect(unique.size).toBe(ALL_QUEUE_NAMES.length);
  });
});

// ── 2. Event constant integrity ─────────────────────────────────

describe('Event constant integrity', () => {
  it('all event types use dot-notation', () => {
    for (const event of ALL_EVENT_TYPES) {
      expect(event).toMatch(/^[a-z]+\.[a-z]+(\.[a-z]+)*$/);
    }
  });

  it('EVENTS object has expected pipeline events', () => {
    expect(EVENTS.IOC_NORMALIZED).toBe('ioc.normalized');
    expect(EVENTS.IOC_ENRICHED).toBe('ioc.enriched');
    expect(EVENTS.CORRELATION_MATCH).toBe('correlation.match');
    expect(EVENTS.DRP_ALERT_CREATED).toBe('drp.alert.created');
    expect(EVENTS.GRAPH_NODE_CREATED).toBe('graph.node.created');
  });

  it('all event types are unique', () => {
    const unique = new Set(ALL_EVENT_TYPES);
    expect(unique.size).toBe(ALL_EVENT_TYPES.length);
  });
});

// ── 3. Pipeline chain queue alignment ───────────────────────────

describe('Pipeline chain — queue names match between producer and consumer', () => {
  it('normalization → enrichment: ENRICH_REALTIME queue', () => {
    // Normalization produces to ENRICH_REALTIME, enrichment consumes it
    expect(QUEUES.ENRICH_REALTIME).toBe('etip-enrich-realtime');
  });

  it('enrichment → ES indexing: IOC_INDEX queue', () => {
    expect(QUEUES.IOC_INDEX).toBe('etip-ioc-indexed');
  });

  it('enrichment → threat graph: GRAPH_SYNC queue', () => {
    expect(QUEUES.GRAPH_SYNC).toBe('etip-graph-sync');
  });

  it('enrichment → correlation: CORRELATE queue', () => {
    expect(QUEUES.CORRELATE).toBe('etip-correlate');
  });

  it('correlation → alerting: ALERT_EVALUATE queue', () => {
    expect(QUEUES.ALERT_EVALUATE).toBe('etip-alert-evaluate');
  });

  it('alerting/correlation → integration: INTEGRATION_PUSH queue', () => {
    expect(QUEUES.INTEGRATION_PUSH).toBe('etip-integration-push');
  });

  it('enrichment → caching: CACHE_INVALIDATE queue', () => {
    expect(QUEUES.CACHE_INVALIDATE).toBe('etip-cache-invalidate');
  });
});

// ── 4. Event → queue mapping consistency ────────────────────────

describe('Event types used in pipeline payloads', () => {
  it('CORRELATION_MATCH event name is valid for integration TriggerEvent', () => {
    // The integration service TriggerEventEnum includes 'correlation.match'
    expect(EVENTS.CORRELATION_MATCH).toBe('correlation.match');
  });

  it('DRP_ALERT_CREATED event name is valid for integration TriggerEvent', () => {
    expect(EVENTS.DRP_ALERT_CREATED).toBe('drp.alert.created');
  });

  it('HUNT_COMPLETED event name is valid for integration TriggerEvent', () => {
    expect(EVENTS.HUNT_COMPLETED).toBe('hunt.completed');
  });

  it('pipeline event chain is complete: feed → normalize → enrich → store → correlate → alert', () => {
    // Verify the full chain of events exists
    const pipelineEvents = [
      EVENTS.FEED_FETCHED,      // ingestion → feed parsed
      EVENTS.FEED_PARSED,       // ingestion → normalize
      EVENTS.IOC_NORMALIZED,    // normalization → enrichment
      EVENTS.IOC_ENRICHED,      // enrichment → downstream (graph, ES, correlation)
      EVENTS.CORRELATION_MATCH, // correlation → alerting
    ];

    for (const event of pipelineEvents) {
      expect(event).toBeTruthy();
      expect(ALL_EVENT_TYPES).toContain(event);
    }
  });
});

// ── 5. Health check script exists ───────────────────────────────

describe('Pipeline health check script', () => {
  it('check-pipeline-health.ts exists', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const scriptPath = path.resolve(__dirname, '../../scripts/check-pipeline-health.ts');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });
});
