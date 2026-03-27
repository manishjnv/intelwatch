import { describe, it, expect } from 'vitest';
import { QUEUES, ALL_QUEUE_NAMES } from '../src/queues.js';
import { EVENTS } from '../src/events.js';

describe('Global queue constants (DECISION-029)', () => {
  const globalQueues = [
    QUEUES.FEED_FETCH_GLOBAL_RSS,
    QUEUES.FEED_FETCH_GLOBAL_NVD,
    QUEUES.FEED_FETCH_GLOBAL_STIX,
    QUEUES.FEED_FETCH_GLOBAL_REST,
    QUEUES.NORMALIZE_GLOBAL,
    QUEUES.ENRICH_GLOBAL,
  ];

  it('all 6 global queue constants start with etip-', () => {
    for (const q of globalQueues) {
      expect(q).toMatch(/^etip-/);
    }
  });

  it('no colons in any queue name (RCA #42)', () => {
    for (const name of ALL_QUEUE_NAMES) {
      expect(name).not.toContain(':');
    }
  });

  it('no duplicate values across all queues', () => {
    const unique = new Set(ALL_QUEUE_NAMES);
    expect(unique.size).toBe(ALL_QUEUE_NAMES.length);
  });
});

describe('Global event constants (DECISION-029)', () => {
  it('GLOBAL_IOC_UPDATED is a non-empty string', () => {
    expect(EVENTS.GLOBAL_IOC_UPDATED).toBeTruthy();
    expect(typeof EVENTS.GLOBAL_IOC_UPDATED).toBe('string');
  });

  it('GLOBAL_IOC_CRITICAL is a non-empty string', () => {
    expect(EVENTS.GLOBAL_IOC_CRITICAL).toBeTruthy();
    expect(typeof EVENTS.GLOBAL_IOC_CRITICAL).toBe('string');
  });
});

describe('Downstream pipeline lifecycle events', () => {
  it('ENRICHMENT_COMPLETE event exists and uses dot notation', () => {
    expect(EVENTS.ENRICHMENT_COMPLETE).toBe('enrichment.complete');
  });

  it('ALERT_FIRED event exists and uses dot notation', () => {
    expect(EVENTS.ALERT_FIRED).toBe('alert.fired');
  });

  it('INTEGRATION_PUSHED event exists and uses dot notation', () => {
    expect(EVENTS.INTEGRATION_PUSHED).toBe('integration.pushed');
  });

  it('all downstream queue constants have etip- prefix', () => {
    const downstreamQueues = [
      QUEUES.GRAPH_SYNC,
      QUEUES.IOC_INDEX,
      QUEUES.CORRELATE,
      QUEUES.ALERT_EVALUATE,
      QUEUES.INTEGRATION_PUSH,
    ];
    for (const q of downstreamQueues) {
      expect(q).toMatch(/^etip-/);
    }
  });

  it('downstream queues have no colons (RCA #42)', () => {
    const downstreamQueues = [
      QUEUES.GRAPH_SYNC,
      QUEUES.IOC_INDEX,
      QUEUES.CORRELATE,
      QUEUES.ALERT_EVALUATE,
      QUEUES.INTEGRATION_PUSH,
    ];
    for (const q of downstreamQueues) {
      expect(q).not.toContain(':');
    }
  });
});
