import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Driver mock (must be hoisted before service import) ──────────

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockRun, close: mockClose }),
  getNeo4jDriver: vi.fn(),
}));

import { ClusterDetectionService } from '../src/services/cluster-detection.js';

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Builds a minimal Neo4j record object matching the fields
 * ClusterDetectionService.detectClusters reads from session.run():
 *   aId, aType, aLabel, aRisk, bId, bType, bLabel, bRisk, sharedNodes
 */
function makeRecord(opts: {
  aId: string;
  aType?: string;
  aLabel?: string;
  aRisk?: number;
  bId: string;
  bType?: string;
  bLabel?: string;
  bRisk?: number;
  sharedNodes?: Array<{ id: string; type: string; label: string }>;
}) {
  const data: Record<string, unknown> = {
    aId: opts.aId,
    aType: opts.aType ?? 'IOC',
    aLabel: opts.aLabel ?? opts.aId,
    aRisk: opts.aRisk ?? 0,
    bId: opts.bId,
    bType: opts.bType ?? 'IOC',
    bLabel: opts.bLabel ?? opts.bId,
    bRisk: opts.bRisk ?? 0,
    sharedNodes: opts.sharedNodes ?? [{ id: 'shared-1', type: 'Infrastructure', label: '185.1.2.3' }],
  };
  return { get: (key: string) => data[key] };
}

/** Returns the result structure session.run() resolves with. */
function neo4jResult(records: ReturnType<typeof makeRecord>[]) {
  return { records };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('ClusterDetectionService', () => {
  let service: ClusterDetectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClusterDetectionService();
  });

  it('1. finds a cluster of 3+ nodes sharing common infrastructure', async () => {
    // Three pairs forming one triangle: A-B, B-C, A-C
    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'node-a', aRisk: 80, bId: 'node-b', bRisk: 60 }),
      makeRecord({ aId: 'node-b', aRisk: 60, bId: 'node-c', bRisk: 50 }),
      makeRecord({ aId: 'node-a', aRisk: 80, bId: 'node-c', bRisk: 50 }),
    ]));

    const result = await service.detectClusters('tenant-1', 3);

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.size).toBe(3);
    expect(result.clusters[0]!.nodes.map((n) => n.id).sort()).toEqual(
      ['node-a', 'node-b', 'node-c'].sort(),
    );
  });

  it('2. returns correct avgRiskScore and maxRiskScore per cluster', async () => {
    // Cluster with scores 80, 60, 40 → avg = 60, max = 80
    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'node-a', aRisk: 80, bId: 'node-b', bRisk: 60 }),
      makeRecord({ aId: 'node-b', aRisk: 60, bId: 'node-c', bRisk: 40 }),
      makeRecord({ aId: 'node-a', aRisk: 80, bId: 'node-c', bRisk: 40 }),
    ]));

    const result = await service.detectClusters('tenant-1', 3);

    expect(result.clusters).toHaveLength(1);
    const cluster = result.clusters[0]!;
    expect(cluster.maxRiskScore).toBe(80);
    expect(cluster.avgRiskScore).toBe(60);
  });

  it('3. minSize filter excludes small clusters', async () => {
    // Only one pair → size 2, below minSize 3
    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'node-a', aRisk: 90, bId: 'node-b', bRisk: 70 }),
    ]));

    const result = await service.detectClusters('tenant-1', 3);

    expect(result.clusters).toHaveLength(0);
    expect(result.totalClusters).toBe(0);
  });

  it('4. nodeType filter is passed to Neo4j query (IOC)', async () => {
    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'ioc-1', aType: 'IOC', bId: 'ioc-2', bType: 'IOC' }),
      makeRecord({ aId: 'ioc-1', aType: 'IOC', bId: 'ioc-3', bType: 'IOC' }),
      makeRecord({ aId: 'ioc-2', aType: 'IOC', bId: 'ioc-3', bType: 'IOC' }),
    ]));

    await service.detectClusters('tenant-1', 3, 'IOC');

    // Verify the Cypher query included nodeType parameter
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('labels(a)[0] = $nodeType'),
      expect.objectContaining({ nodeType: 'IOC' }),
    );
  });

  it('5. limit parameter caps number of clusters returned', async () => {
    // Build 4 separate clusters of size 2 each, then use minSize 2 and limit 2
    // Cluster 1: a1-a2; Cluster 2: b1-b2; Cluster 3: c1-c2; Cluster 4: d1-d2
    // (no cross-edges so they remain separate)
    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'a1', aRisk: 80, bId: 'a2', bRisk: 80 }),
      makeRecord({ aId: 'b1', aRisk: 60, bId: 'b2', bRisk: 60 }),
      makeRecord({ aId: 'c1', aRisk: 40, bId: 'c2', bRisk: 40 }),
      makeRecord({ aId: 'd1', aRisk: 20, bId: 'd2', bRisk: 20 }),
    ]));

    const result = await service.detectClusters('tenant-1', 2, undefined, 2);

    expect(result.clusters).toHaveLength(2);
    // totalClusters reflects all clusters before limit
    expect(result.totalClusters).toBe(4);
  });

  it('6. clusters are sorted by maxRiskScore descending', async () => {
    // Cluster 1: high risk (a1-a2, scores 90); Cluster 2: low risk (b1-b2, scores 20)
    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'a1', aRisk: 90, bId: 'a2', bRisk: 85 }),
      makeRecord({ aId: 'b1', aRisk: 20, bId: 'b2', bRisk: 15 }),
    ]));

    const result = await service.detectClusters('tenant-1', 2);

    expect(result.clusters[0]!.maxRiskScore).toBeGreaterThan(
      result.clusters[1]!.maxRiskScore,
    );
    expect(result.clusters[0]!.maxRiskScore).toBe(90);
    expect(result.clusters[1]!.maxRiskScore).toBe(20);
  });

  it('7. empty graph returns zero clusters', async () => {
    mockRun.mockResolvedValue(neo4jResult([]));

    const result = await service.detectClusters('tenant-1', 2);

    expect(result.clusters).toHaveLength(0);
    expect(result.totalClusters).toBe(0);
  });

  it('8. two separate clusters are detected as distinct', async () => {
    // Group X: x1-x2-x3 (connected triangle)
    // Group Y: y1-y2-y3 (separate triangle, no cross-edges)
    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'x1', aRisk: 70, bId: 'x2', bRisk: 65 }),
      makeRecord({ aId: 'x2', aRisk: 65, bId: 'x3', bRisk: 60 }),
      makeRecord({ aId: 'x1', aRisk: 70, bId: 'x3', bRisk: 60 }),
      makeRecord({ aId: 'y1', aRisk: 30, bId: 'y2', bRisk: 25 }),
      makeRecord({ aId: 'y2', aRisk: 25, bId: 'y3', bRisk: 20 }),
      makeRecord({ aId: 'y1', aRisk: 30, bId: 'y3', bRisk: 20 }),
    ]));

    const result = await service.detectClusters('tenant-1', 3);

    expect(result.clusters).toHaveLength(2);
    expect(result.totalClusters).toBe(2);

    // Verify no overlap between cluster node IDs
    const ids0 = new Set(result.clusters[0]!.nodes.map((n) => n.id));
    const ids1 = new Set(result.clusters[1]!.nodes.map((n) => n.id));
    const intersection = [...ids0].filter((id) => ids1.has(id));
    expect(intersection).toHaveLength(0);
  });

  it('9. sharedEntities lists correct shared nodes', async () => {
    const sharedNode = { id: 'infra-99', type: 'Infrastructure', label: '192.168.0.1' };

    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'node-a', bId: 'node-b', sharedNodes: [sharedNode] }),
      makeRecord({ aId: 'node-b', bId: 'node-c', sharedNodes: [sharedNode] }),
      makeRecord({ aId: 'node-a', bId: 'node-c', sharedNodes: [sharedNode] }),
    ]));

    const result = await service.detectClusters('tenant-1', 3);

    expect(result.clusters).toHaveLength(1);
    const shared = result.clusters[0]!.sharedEntities;
    // Despite appearing in multiple pairs, infra-99 is deduplicated
    expect(shared).toHaveLength(1);
    expect(shared[0]!.id).toBe('infra-99');
    expect(shared[0]!.label).toBe('192.168.0.1');
  });

  it('10. cluster.size matches actual node count', async () => {
    // Four distinct nodes: a1-a2, a2-a3, a1-a3, a3-a4 (chain reaching a4)
    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'a1', bId: 'a2' }),
      makeRecord({ aId: 'a2', bId: 'a3' }),
      makeRecord({ aId: 'a1', bId: 'a3' }),
      makeRecord({ aId: 'a3', bId: 'a4' }),
    ]));

    const result = await service.detectClusters('tenant-1', 2);

    expect(result.clusters).toHaveLength(1);
    const cluster = result.clusters[0]!;
    expect(cluster.size).toBe(cluster.nodes.length);
    expect(cluster.size).toBe(4);
  });

  it('11. single pair below minSize is excluded', async () => {
    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'lone-a', bId: 'lone-b' }),
    ]));

    // minSize 3 — a pair of 2 must be excluded
    const result = await service.detectClusters('tenant-1', 3);

    expect(result.clusters).toHaveLength(0);
  });

  it('12. cluster IDs are valid UUIDs', async () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    mockRun.mockResolvedValue(neo4jResult([
      makeRecord({ aId: 'n1', bId: 'n2' }),
      makeRecord({ aId: 'n2', bId: 'n3' }),
      makeRecord({ aId: 'n1', bId: 'n3' }),
    ]));

    const result = await service.detectClusters('tenant-1', 3);

    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0]!.id).toMatch(uuidRegex);
  });
});
