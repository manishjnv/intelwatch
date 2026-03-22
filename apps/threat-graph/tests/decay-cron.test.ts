import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pino from 'pino';

// ─── Mock driver (must be hoisted before imports that use it) ─────────────────

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockRun, close: mockClose }),
}));

import { DecayCronService } from '../src/services/decay-cron.js';
import type { RiskPropagationEngine } from '../src/propagation.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] ?? null };
}

function makeNodeRecord(id: string, riskScore: number, lastSeen: string | null = null) {
  return makeRecord({ id, riskScore, lastSeen });
}

const TENANT = 'tenant-decay-test';

const mockLogger: pino.Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
} as any;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DecayCronService (#18)', () => {
  let propagation: RiskPropagationEngine;
  let svc: DecayCronService;

  beforeEach(() => {
    vi.clearAllMocks();

    propagation = {
      calculateTemporalDecay: vi.fn().mockReturnValue(0.5),
      propagate: vi.fn(),
      onAudit: vi.fn(),
    } as unknown as RiskPropagationEngine;

    // 60 000 ms interval, threshold = 1.0
    svc = new DecayCronService(propagation, 60_000, 1.0, mockLogger);
  });

  // ── 1. getStatus() returns running=false initially ────────────────────────

  it('getStatus() returns running=false before start()', () => {
    const status = svc.getStatus();
    expect(status.running).toBe(false);
    expect(status.lastRun).toBeNull();
    expect(status.lastResult).toBeNull();
  });

  // ── 2. start() sets running=true ─────────────────────────────────────────

  it('start() sets running=true', () => {
    svc.start();
    try {
      expect(svc.getStatus().running).toBe(true);
    } finally {
      svc.stop();
    }
  });

  // ── 3. stop() sets running=false ─────────────────────────────────────────

  it('stop() sets running=false after start()', () => {
    svc.start();
    svc.stop();
    expect(svc.getStatus().running).toBe(false);
  });

  // ── 4. triggerDecay fetches nodes with riskScore > 0 ─────────────────────

  it('triggerDecay fetches nodes where riskScore > 0', async () => {
    mockRun.mockResolvedValue({ records: [] });

    await svc.triggerDecay(TENANT);

    // First call is the MATCH query — verify the Cypher contains the > 0 filter
    const [query] = mockRun.mock.calls[0] as [string, ...unknown[]];
    expect(query).toMatch(/riskScore\s*>\s*0/);
  });

  // ── 5. Decays node score using temporal decay formula ─────────────────────

  it('applies temporal decay: newScore = currentScore × temporalFactor', async () => {
    // Node with score 80, decay returns 0.5 → decayed = 40 → drop = 40 >= threshold 1.0
    vi.mocked(propagation.calculateTemporalDecay).mockReturnValue(0.5);
    mockRun
      .mockResolvedValueOnce({ records: [makeNodeRecord('node-1', 80, '2025-01-01T00:00:00Z')] })
      .mockResolvedValue({ records: [] }); // SET query

    const result = await svc.triggerDecay(TENANT);

    // Verify the SET call received the decayed score: 80 × 0.5 = 40
    const setCall = mockRun.mock.calls.find(
      ([q]: [string]) => typeof q === 'string' && q.includes('SET n.riskScore'),
    );
    expect(setCall).toBeDefined();
    const setParams = setCall![1] as Record<string, unknown>;
    expect(setParams['newScore']).toBe(40);
    expect(result.nodesDecayed).toBe(1);
  });

  // ── 6. Updates nodes where score drop >= threshold ────────────────────────

  it('updates nodes where score drop >= threshold', async () => {
    // threshold = 1.0; drop = 80 - 40 = 40 → should update
    vi.mocked(propagation.calculateTemporalDecay).mockReturnValue(0.5);
    mockRun
      .mockResolvedValueOnce({ records: [makeNodeRecord('node-a', 80, '2025-01-01T00:00:00Z')] })
      .mockResolvedValue({ records: [] });

    const result = await svc.triggerDecay(TENANT);
    expect(result.nodesDecayed).toBe(1);
  });

  // ── 7. Skips nodes where score drop < threshold ───────────────────────────

  it('skips nodes where score drop < threshold', async () => {
    // threshold = 1.0; decay factor = 0.99 → score 10 × 0.99 = 9.9 → drop = 0.1 < 1.0
    vi.mocked(propagation.calculateTemporalDecay).mockReturnValue(0.99);
    mockRun.mockResolvedValueOnce({
      records: [makeNodeRecord('node-b', 10, new Date().toISOString())],
    });

    const result = await svc.triggerDecay(TENANT);

    expect(result.nodesDecayed).toBe(0);
    // No SET query should have been executed
    const setCall = mockRun.mock.calls.find(([q]: [string]) => q.includes('SET n.riskScore'));
    expect(setCall).toBeUndefined();
  });

  // ── 8. Returns correct nodesEvaluated count ───────────────────────────────

  it('returns correct nodesEvaluated count', async () => {
    vi.mocked(propagation.calculateTemporalDecay).mockReturnValue(0.5);
    mockRun
      .mockResolvedValueOnce({
        records: [
          makeNodeRecord('n1', 80, '2025-01-01T00:00:00Z'),
          makeNodeRecord('n2', 60, '2025-01-01T00:00:00Z'),
          makeNodeRecord('n3', 40, '2025-01-01T00:00:00Z'),
        ],
      })
      .mockResolvedValue({ records: [] }); // SET queries

    const result = await svc.triggerDecay(TENANT);

    expect(result.nodesEvaluated).toBe(3);
  });

  // ── 9. Returns correct nodesDecayed count ────────────────────────────────

  it('returns correct nodesDecayed count when only some nodes cross threshold', async () => {
    // threshold = 1.0
    // node-x: score 80 × 0.5 = 40 → drop 40 ✓ decayed
    // node-y: score 10 × 0.99 = 9.9 → drop 0.1 ✗ skipped
    vi.mocked(propagation.calculateTemporalDecay)
      .mockReturnValueOnce(0.5)  // node-x
      .mockReturnValueOnce(0.99); // node-y

    mockRun
      .mockResolvedValueOnce({
        records: [
          makeNodeRecord('node-x', 80, '2025-01-01T00:00:00Z'),
          makeNodeRecord('node-y', 10, new Date().toISOString()),
        ],
      })
      .mockResolvedValue({ records: [] });

    const result = await svc.triggerDecay(TENANT);

    expect(result.nodesEvaluated).toBe(2);
    expect(result.nodesDecayed).toBe(1);
  });

  // ── 10. avgDecayAmount calculation is correct ─────────────────────────────

  it('calculates avgDecayAmount correctly across multiple decayed nodes', async () => {
    // node1: 80 × 0.5 = 40  → drop = 40
    // node2: 60 × 0.5 = 30  → drop = 30
    // avg = (40 + 30) / 2 = 35
    vi.mocked(propagation.calculateTemporalDecay).mockReturnValue(0.5);
    mockRun
      .mockResolvedValueOnce({
        records: [
          makeNodeRecord('n1', 80, '2025-01-01T00:00:00Z'),
          makeNodeRecord('n2', 60, '2025-01-01T00:00:00Z'),
        ],
      })
      .mockResolvedValue({ records: [] });

    const result = await svc.triggerDecay(TENANT);

    expect(result.nodesDecayed).toBe(2);
    expect(result.avgDecayAmount).toBe(35);
  });

  // ── 11. getStatus() returns lastResult after a run ────────────────────────

  it('getStatus() reflects lastResult after triggerDecay', async () => {
    vi.mocked(propagation.calculateTemporalDecay).mockReturnValue(0.5);
    mockRun
      .mockResolvedValueOnce({ records: [makeNodeRecord('n1', 80, '2025-01-01T00:00:00Z')] })
      .mockResolvedValue({ records: [] });

    await svc.triggerDecay(TENANT);

    const status = svc.getStatus();
    expect(status.lastResult).not.toBeNull();
    expect(status.lastResult!.nodesEvaluated).toBe(1);
    expect(status.lastResult!.nodesDecayed).toBe(1);
    expect(status.lastRun).toBeTruthy();
  });

  // ── 12. Multiple runs update lastRun timestamp ────────────────────────────

  it('multiple triggerDecay calls update lastRun each time', async () => {
    mockRun.mockResolvedValue({ records: [] });

    await svc.triggerDecay(TENANT);
    const firstRun = svc.getStatus().lastRun;

    // Small delay to guarantee a different timestamp
    await new Promise((r) => setTimeout(r, 5));

    await svc.triggerDecay(TENANT);
    const secondRun = svc.getStatus().lastRun;

    expect(firstRun).not.toBeNull();
    expect(secondRun).not.toBeNull();
    // Second run must be at or after first run
    expect(new Date(secondRun!).getTime()).toBeGreaterThanOrEqual(new Date(firstRun!).getTime());
  });
});
