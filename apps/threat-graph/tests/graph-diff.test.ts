import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockRun, close: mockClose }),
}));

import { GraphDiffService } from '../src/services/graph-diff.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] ?? null };
}

/**
 * Builds a minimal Neo4j record representing a neighbor row from the
 * graph-diff Cypher query.
 */
function makeNeighborRecord(opts: {
  nId: string;
  nType?: string;
  nRisk?: number;
  nConf?: number;
  nFirstSeen?: string | null;
  nLastSeen?: string | null;
  nProps?: Record<string, unknown>;
  rType?: string;
  rConf?: number;
  rFrom?: string;
  rTo?: string;
  rFirstSeen?: string | null;
  rLastSeen?: string | null;
}) {
  const data: Record<string, unknown> = {
    nId: opts.nId,
    nType: opts.nType ?? 'IOC',
    nRisk: opts.nRisk ?? 50,
    nConf: opts.nConf ?? 0.8,
    nFirstSeen: opts.nFirstSeen ?? null,
    nLastSeen: opts.nLastSeen ?? null,
    nProps: opts.nProps ?? {},
    rType: opts.rType ?? 'USES',
    rConf: opts.rConf ?? 0.9,
    rFrom: opts.rFrom ?? 'center-1',
    rTo: opts.rTo ?? opts.nId,
    rFirstSeen: opts.rFirstSeen ?? null,
    rLastSeen: opts.rLastSeen ?? null,
  };
  return makeRecord(data);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GraphDiffService — getTimeline', () => {
  let svc: GraphDiffService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new GraphDiffService();
  });

  it('returns added nodes whose firstSeen is within the cutoff window', async () => {
    const recentFirstSeen = isoAgo(2); // 2 days ago — within 7-day window
    mockRun.mockResolvedValue({
      records: [
        makeNeighborRecord({
          nId: 'node-added',
          nFirstSeen: recentFirstSeen,
          nLastSeen: new Date().toISOString(),
          rFirstSeen: isoAgo(10),
          rLastSeen: new Date().toISOString(),
        }),
      ],
    });

    const result = await svc.getTimeline('t1', 'center-1', 7);

    expect(result.added.nodes).toHaveLength(1);
    expect(result.added.nodes[0]!.id).toBe('node-added');
    expect(result.stale.nodes).toHaveLength(0);
  });

  it('returns stale nodes whose lastSeen is before the cutoff', async () => {
    const oldLastSeen = isoAgo(20); // older than 7-day cutoff
    mockRun.mockResolvedValue({
      records: [
        makeNeighborRecord({
          nId: 'node-stale',
          nFirstSeen: isoAgo(90),
          nLastSeen: oldLastSeen,
          rFirstSeen: isoAgo(90),
          rLastSeen: new Date().toISOString(),
        }),
      ],
    });

    const result = await svc.getTimeline('t1', 'center-1', 7);

    expect(result.stale.nodes).toHaveLength(1);
    expect(result.stale.nodes[0]!.id).toBe('node-stale');
    expect(result.added.nodes).toHaveLength(0);
  });

  it('returns added edges whose firstSeen is within the cutoff window', async () => {
    const recentEdgeFirstSeen = isoAgo(1);
    mockRun.mockResolvedValue({
      records: [
        makeNeighborRecord({
          nId: 'node-x',
          nFirstSeen: isoAgo(60),
          nLastSeen: new Date().toISOString(),
          rFrom: 'center-1',
          rTo: 'node-x',
          rType: 'TARGETS',
          rFirstSeen: recentEdgeFirstSeen,
          rLastSeen: new Date().toISOString(),
        }),
      ],
    });

    const result = await svc.getTimeline('t1', 'center-1', 7);

    expect(result.added.edges).toHaveLength(1);
    expect(result.added.edges[0]!.id).toBe('center-1-TARGETS-node-x');
    expect(result.stale.edges).toHaveLength(0);
  });

  it('returns stale edges whose lastSeen is before the cutoff', async () => {
    const oldEdgeLastSeen = isoAgo(15);
    mockRun.mockResolvedValue({
      records: [
        makeNeighborRecord({
          nId: 'node-y',
          nFirstSeen: isoAgo(60),
          nLastSeen: new Date().toISOString(),
          rFrom: 'center-1',
          rTo: 'node-y',
          rType: 'USES',
          rFirstSeen: isoAgo(60),
          rLastSeen: oldEdgeLastSeen,
        }),
      ],
    });

    const result = await svc.getTimeline('t1', 'center-1', 7);

    expect(result.stale.edges).toHaveLength(1);
    expect(result.stale.edges[0]!.fromNodeId).toBe('center-1');
    expect(result.stale.edges[0]!.toNodeId).toBe('node-y');
    expect(result.added.edges).toHaveLength(0);
  });

  it('returns correct ISO dates for period.from and period.to', async () => {
    mockRun.mockResolvedValue({ records: [] });

    const before = Date.now();
    const result = await svc.getTimeline('t1', 'center-1', 30);
    const after = Date.now();

    const fromMs = new Date(result.period.from).getTime();
    const toMs = new Date(result.period.to).getTime();

    // period.to should be close to now
    expect(toMs).toBeGreaterThanOrEqual(before);
    expect(toMs).toBeLessThanOrEqual(after + 10);

    // period.from should be ~30 days before period.to
    const diffDays = (toMs - fromMs) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  it('summary counts match the lengths of added/stale arrays', async () => {
    const recent = isoAgo(1);
    const old = isoAgo(20);
    mockRun.mockResolvedValue({
      records: [
        // added node + added edge
        makeNeighborRecord({
          nId: 'n-added',
          nFirstSeen: recent,
          nLastSeen: new Date().toISOString(),
          rFrom: 'center-1',
          rTo: 'n-added',
          rType: 'USES',
          rFirstSeen: recent,
          rLastSeen: new Date().toISOString(),
        }),
        // stale node + stale edge
        makeNeighborRecord({
          nId: 'n-stale',
          nFirstSeen: isoAgo(90),
          nLastSeen: old,
          rFrom: 'center-1',
          rTo: 'n-stale',
          rType: 'TARGETS',
          rFirstSeen: isoAgo(90),
          rLastSeen: old,
        }),
      ],
    });

    const result = await svc.getTimeline('t1', 'center-1', 7);

    expect(result.summary.nodesAdded).toBe(result.added.nodes.length);
    expect(result.summary.nodesStale).toBe(result.stale.nodes.length);
    expect(result.summary.edgesAdded).toBe(result.added.edges.length);
    expect(result.summary.edgesStale).toBe(result.stale.edges.length);
  });

  it('excludes nodes that are neither added nor stale from both lists', async () => {
    // firstSeen is old (not added), lastSeen is recent (not stale)
    const activeFirstSeen = isoAgo(60);
    const activeLastSeen = isoAgo(2);
    mockRun.mockResolvedValue({
      records: [
        makeNeighborRecord({
          nId: 'node-active',
          nFirstSeen: activeFirstSeen,
          nLastSeen: activeLastSeen,
          rFirstSeen: activeFirstSeen,
          rLastSeen: activeLastSeen,
        }),
      ],
    });

    const result = await svc.getTimeline('t1', 'center-1', 7);

    expect(result.added.nodes).toHaveLength(0);
    expect(result.stale.nodes).toHaveLength(0);
    expect(result.added.edges).toHaveLength(0);
    expect(result.stale.edges).toHaveLength(0);
  });

  it('returns empty added and stale lists when neighborhood is empty', async () => {
    mockRun.mockResolvedValue({ records: [] });

    const result = await svc.getTimeline('t1', 'center-1', 30);

    expect(result.added.nodes).toHaveLength(0);
    expect(result.added.edges).toHaveLength(0);
    expect(result.stale.nodes).toHaveLength(0);
    expect(result.stale.edges).toHaveLength(0);
    expect(result.summary).toEqual({ nodesAdded: 0, nodesStale: 0, edgesAdded: 0, edgesStale: 0 });
  });

  it('deduplicates nodes seen through multiple edges', async () => {
    const recentFirstSeen = isoAgo(2);
    // Same node appears via two different edges
    const sharedNodeRecord = (edgeType: string) =>
      makeNeighborRecord({
        nId: 'shared-node',
        nFirstSeen: recentFirstSeen,
        nLastSeen: new Date().toISOString(),
        rFrom: 'center-1',
        rTo: 'shared-node',
        rType: edgeType,
        rFirstSeen: isoAgo(10),
        rLastSeen: new Date().toISOString(),
      });

    mockRun.mockResolvedValue({
      records: [sharedNodeRecord('USES'), sharedNodeRecord('TARGETS')],
    });

    const result = await svc.getTimeline('t1', 'center-1', 7);

    // Node should appear only once despite two edges
    expect(result.added.nodes).toHaveLength(1);
    expect(result.added.nodes[0]!.id).toBe('shared-node');
  });

  it('days parameter controls the cutoff date correctly', async () => {
    // A node firstSeen 8 days ago should be "added" with days=14 but NOT with days=5
    const firstSeenEightDaysAgo = isoAgo(8);
    mockRun.mockResolvedValue({
      records: [
        makeNeighborRecord({
          nId: 'node-boundary',
          nFirstSeen: firstSeenEightDaysAgo,
          nLastSeen: new Date().toISOString(),
          rFirstSeen: isoAgo(30),
          rLastSeen: new Date().toISOString(),
        }),
      ],
    });

    // With 14-day window: 8 days ago is within cutoff → should be added
    const result14 = await svc.getTimeline('t1', 'center-1', 14);
    expect(result14.added.nodes).toHaveLength(1);

    // With 5-day window: 8 days ago is outside cutoff → not added
    const result5 = await svc.getTimeline('t1', 'center-1', 5);
    expect(result5.added.nodes).toHaveLength(0);
  });
});
