import { describe, it, expect, beforeEach } from 'vitest';
import { RelationshipTrendingService } from '../src/services/relationship-trending.js';
import type { RelationshipType } from '../src/schemas/graph.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FROM  = 'node-from-001';
const TO    = 'node-to-001';
const TYPE: RelationshipType = 'USES';

const FROM2 = 'node-from-002';
const TO2   = 'node-to-002';
const TYPE2: RelationshipType = 'TARGETS';

function record(
  svc: RelationshipTrendingService,
  oldConf: number,
  newConf: number,
  from = FROM,
  type: RelationshipType = TYPE,
  to = TO,
) {
  svc.record(from, type, to, oldConf, newConf, 'auto-detected', 'user-test');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RelationshipTrendingService (#20)', () => {
  // maxChanges = 5 for circular buffer tests
  let svc: RelationshipTrendingService;

  beforeEach(() => {
    svc = new RelationshipTrendingService(5);
  });

  // ── 1. record() stores a confidence change ────────────────────────────────

  it('record() stores a confidence change that appears in getTrending()', () => {
    record(svc, 0.5, 0.7);

    const response = svc.getTrending(FROM, TYPE, TO, 0.7);

    expect(response.changes.length).toBe(1);
    expect(response.changes[0]!.oldConfidence).toBe(0.5);
    expect(response.changes[0]!.newConfidence).toBe(0.7);
  });

  // ── 2. getTrending() returns changes in reverse chronological order ────────

  it('getTrending() returns changes newest first (reverse chronological)', () => {
    record(svc, 0.3, 0.5);
    record(svc, 0.5, 0.6);
    record(svc, 0.6, 0.8);

    const response = svc.getTrending(FROM, TYPE, TO, 0.8);

    // Newest change: 0.6 → 0.8 should be first
    expect(response.changes[0]!.newConfidence).toBe(0.8);
    expect(response.changes[1]!.newConfidence).toBe(0.6);
    expect(response.changes[2]!.newConfidence).toBe(0.5);
  });

  // ── 3. getTrending() calculates correct delta ─────────────────────────────

  it('getTrending() calculates delta as newConfidence - oldConfidence', () => {
    record(svc, 0.4, 0.75);

    const response = svc.getTrending(FROM, TYPE, TO, 0.75);

    // delta = round((0.75 - 0.4) * 1000) / 1000 = 0.35
    expect(response.changes[0]!.delta).toBeCloseTo(0.35, 3);
  });

  // ── 4. trend is 'increasing' when recent changes are positive ─────────────

  it("getTrending() trend is 'increasing' when recent deltas are positive", () => {
    // 3+ changes with clearly positive deltas
    record(svc, 0.3, 0.5);  // delta +0.2
    record(svc, 0.5, 0.65); // delta +0.15
    record(svc, 0.65, 0.8); // delta +0.15

    const response = svc.getTrending(FROM, TYPE, TO, 0.8);

    expect(response.trend).toBe('increasing');
  });

  // ── 5. trend is 'decreasing' when recent changes are negative ─────────────

  it("getTrending() trend is 'decreasing' when recent deltas are negative", () => {
    record(svc, 0.9, 0.7);   // delta -0.2
    record(svc, 0.7, 0.55);  // delta -0.15
    record(svc, 0.55, 0.4);  // delta -0.15

    const response = svc.getTrending(FROM, TYPE, TO, 0.4);

    expect(response.trend).toBe('decreasing');
  });

  // ── 6. trend is 'stable' when deltas are near zero ────────────────────────

  it("getTrending() trend is 'stable' when recent deltas are near zero", () => {
    // deltas within ±0.01 threshold
    record(svc, 0.500, 0.502); // delta +0.002
    record(svc, 0.502, 0.501); // delta -0.001
    record(svc, 0.501, 0.500); // delta -0.001

    const response = svc.getTrending(FROM, TYPE, TO, 0.500);

    expect(response.trend).toBe('stable');
  });

  // ── 7. trend is 'insufficient_data' with fewer than 3 changes ─────────────

  it("getTrending() trend is 'insufficient_data' with fewer than 3 recorded changes", () => {
    record(svc, 0.3, 0.7);
    record(svc, 0.7, 0.8);

    const response = svc.getTrending(FROM, TYPE, TO, 0.8);

    expect(response.trend).toBe('insufficient_data');
  });

  // ── 8. avgConfidence calculated correctly ─────────────────────────────────

  it('getTrending() calculates avgConfidence from all newConfidence values', () => {
    // newConfidences: 0.5, 0.6, 0.7 → avg = 0.6
    record(svc, 0.3, 0.5);
    record(svc, 0.5, 0.6);
    record(svc, 0.6, 0.7);

    const response = svc.getTrending(FROM, TYPE, TO, 0.7);

    expect(response.avgConfidence).toBeCloseTo(0.6, 3);
  });

  // ── 9. Circular buffer evicts oldest when exceeding maxChanges ────────────

  it('circular buffer evicts oldest entries when maxChanges (5) is exceeded', () => {
    // Record 6 changes; only the last 5 should remain
    record(svc, 0.1, 0.2); // will be evicted
    record(svc, 0.2, 0.3);
    record(svc, 0.3, 0.4);
    record(svc, 0.4, 0.5);
    record(svc, 0.5, 0.6);
    record(svc, 0.6, 0.7); // 6th — causes eviction of first

    const response = svc.getTrending(FROM, TYPE, TO, 0.7);

    expect(response.changes.length).toBe(5);
    // The oldest (0.1→0.2) should have been evicted; newest first, so last entry is 0.3
    const confidences = response.changes.map((c) => c.newConfidence);
    expect(confidences).not.toContain(0.2); // evicted entry
    expect(confidences).toContain(0.7);     // most recent still present
  });

  // ── 10. Different relationships tracked independently ─────────────────────

  it('tracks different relationships (from/type/to) independently', () => {
    // Record on relationship 1
    record(svc, 0.5, 0.8, FROM, TYPE, TO);
    // Record on relationship 2
    record(svc, 0.1, 0.3, FROM2, TYPE2, TO2);

    const r1 = svc.getTrending(FROM, TYPE, TO, 0.8);
    const r2 = svc.getTrending(FROM2, TYPE2, TO2, 0.3);

    expect(r1.changes.length).toBe(1);
    expect(r1.changes[0]!.newConfidence).toBe(0.8);

    expect(r2.changes.length).toBe(1);
    expect(r2.changes[0]!.newConfidence).toBe(0.3);
  });

  // ── 11. size() returns number of tracked relationships ────────────────────

  it('size() returns the number of distinct relationships being tracked', () => {
    expect(svc.size()).toBe(0);

    record(svc, 0.5, 0.6, FROM, TYPE, TO);
    expect(svc.size()).toBe(1);

    record(svc, 0.5, 0.6, FROM2, TYPE2, TO2);
    expect(svc.size()).toBe(2);

    // Same relationship again — should not increment size
    record(svc, 0.6, 0.7, FROM, TYPE, TO);
    expect(svc.size()).toBe(2);
  });

  // ── 12. clear() removes all data ─────────────────────────────────────────

  it('clear() removes all tracked relationship data', () => {
    record(svc, 0.5, 0.7, FROM, TYPE, TO);
    record(svc, 0.2, 0.4, FROM2, TYPE2, TO2);

    svc.clear();

    expect(svc.size()).toBe(0);

    // getTrending on a cleared relationship returns no history and insufficient_data
    const response = svc.getTrending(FROM, TYPE, TO, 0.7);
    expect(response.changes.length).toBe(0);
    expect(response.trend).toBe('insufficient_data');
  });
});
