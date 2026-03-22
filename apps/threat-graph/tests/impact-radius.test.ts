import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Driver mock — required even though ImpactRadiusService doesn't call it
// directly; RiskPropagationEngine constructor holds a repo reference. ─────

vi.mock('../src/driver.js', () => ({
  createSession: vi.fn(),
  getNeo4jDriver: vi.fn(),
}));

import { GraphRepository } from '../src/repository.js';
import { RiskPropagationEngine } from '../src/propagation.js';
import { ImpactRadiusService } from '../src/services/impact-radius.js';

// ─── Helpers ──────────────────────────────────────────────────────

const TENANT = 'tenant-abc';

/** Minimal pino-compatible logger. */
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
} as any;

/** Creates a mock GraphRepository with vi.fn() stubs. */
function makeMockRepo() {
  return {
    getNodeRiskScore: vi.fn(),
    getNode: vi.fn(),
    getNeighborsForPropagation: vi.fn(),
  } as unknown as GraphRepository;
}

/** Builds a minimal GraphNodeResponse for getNode() mock. */
function makeNodeResponse(id: string, name: string, nodeType = 'IOC') {
  return {
    id,
    nodeType,
    riskScore: 0,
    confidence: 0.8,
    properties: { name },
  };
}

/**
 * Builds a neighbor entry for getNeighborsForPropagation().
 * relLastSeen defaults to today so temporal decay ≈ 1.0.
 */
function makeNeighbor(
  id: string,
  opts: {
    riskScore?: number;
    relConfidence?: number;
    relType?: string;
    relLastSeen?: string | null;
  } = {},
) {
  return {
    id,
    riskScore: opts.riskScore ?? 20,
    relConfidence: opts.relConfidence ?? 1.0,
    relType: opts.relType ?? 'USES',
    relLastSeen: opts.relLastSeen ?? new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('ImpactRadiusService', () => {
  let mockRepo: GraphRepository;
  let propagation: RiskPropagationEngine;
  let service: ImpactRadiusService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = makeMockRepo();
    propagation = new RiskPropagationEngine(mockRepo, 0.7, mockLogger);
    service = new ImpactRadiusService(mockRepo, propagation);
  });

  it('1. returns trigger node info (id, score, depth)', async () => {
    const triggerMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    triggerMock.mockResolvedValue(75);
    (mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.calculate(TENANT, 'trigger-1', 2);

    expect(result.triggerNodeId).toBe('trigger-1');
    expect(result.triggerScore).toBe(75);
    expect(result.depth).toBe(2);
  });

  it('2. identifies affected nodes at distance 1', async () => {
    // Trigger score: 90, neighbor current score: 10 → should be affected
    const triggerMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    // First call: trigger score; second call: neighbor score
    triggerMock
      .mockResolvedValueOnce(90)  // trigger
      .mockResolvedValueOnce(10); // neighbor-1

    (mockRepo.getNode as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeNodeResponse('neighbor-1', 'evil.com', 'IOC'),
    );
    (mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([makeNeighbor('neighbor-1', { relConfidence: 1.0, relType: 'USES' })])
      .mockResolvedValueOnce([]); // no further neighbors

    const result = await service.calculate(TENANT, 'trigger-node', 2);

    expect(result.affectedNodes).toHaveLength(1);
    expect(result.affectedNodes[0]!.id).toBe('neighbor-1');
    expect(result.affectedNodes[0]!.distance).toBe(1);
  });

  it('3. identifies affected nodes at distance 2 (multi-hop)', async () => {
    // Trigger → hop1 → hop2 chain
    // trigger=80; hop1 current=10; hop2 current=5
    const getScoreMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    getScoreMock
      .mockResolvedValueOnce(80)   // trigger score
      .mockResolvedValueOnce(10)   // hop1 current score
      .mockResolvedValueOnce(5);   // hop2 current score

    (mockRepo.getNode as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeNodeResponse('hop1', 'malware-a', 'Malware'))
      .mockResolvedValueOnce(makeNodeResponse('hop2', 'ioc-b', 'IOC'));

    const getNeighborsMock = mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>;
    getNeighborsMock
      .mockResolvedValueOnce([makeNeighbor('hop1', { relConfidence: 1.0, relType: 'USES' })])
      .mockResolvedValueOnce([makeNeighbor('hop2', { relConfidence: 1.0, relType: 'USES' })])
      .mockResolvedValueOnce([]); // hop2 has no further neighbors

    const result = await service.calculate(TENANT, 'trigger-node', 2);

    const ids = result.affectedNodes.map((n) => n.id);
    expect(ids).toContain('hop1');
    expect(ids).toContain('hop2');

    const hop2Node = result.affectedNodes.find((n) => n.id === 'hop2');
    expect(hop2Node!.distance).toBe(2);
  });

  it('4. scoreDelta is correct (projectedScore - currentScore)', async () => {
    // triggerScore=90, neighbor currentScore=30
    // projectedScore = Math.min(100, Math.round(parentScore * 100) / 100) = 90 (parentScore is the propagated score)
    // But parentScore passed to hop1 comes from the propagation formula.
    // For depth=1, the queue item pushed is [neighbor.id, 1, propagatedScore].
    // propagatedScore = 90 * 0.7^1 * 1.0 * temporal * USES(0.90)
    // With temporal ≈ 1.0 (today): propagatedScore ≈ 90 * 0.7 * 1.0 * 0.90 = 56.7
    // projectedScore = Math.min(100, Math.round(56.7 * 100) / 100) = 56.7
    // currentScore = 10
    // scoreDelta = 56.7 - 10 = 46.7

    const getScoreMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    getScoreMock
      .mockResolvedValueOnce(90)   // trigger
      .mockResolvedValueOnce(10);  // neighbor current

    (mockRepo.getNode as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeNodeResponse('n1', 'test-node'),
    );
    (mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([makeNeighbor('n1', { relConfidence: 1.0, relType: 'USES', relLastSeen: new Date().toISOString() })])
      .mockResolvedValueOnce([]);

    const result = await service.calculate(TENANT, 'trigger', 2);

    expect(result.affectedNodes).toHaveLength(1);
    const node = result.affectedNodes[0]!;
    // scoreDelta must equal projectedScore - currentScore, rounded to 2dp
    expect(node.scoreDelta).toBeCloseTo(node.projectedScore - node.currentScore, 5);
    expect(node.currentScore).toBe(10);
    expect(node.scoreDelta).toBeGreaterThan(0);
  });

  it('5. nodes are sorted by scoreDelta descending', async () => {
    // Two neighbors: one with low current (large delta), one with high current (small delta)
    // triggerScore = 90
    const getScoreMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    getScoreMock
      .mockResolvedValueOnce(90)   // trigger
      .mockResolvedValueOnce(5)    // neighbor-low current  → large delta
      .mockResolvedValueOnce(50);  // neighbor-high current → smaller delta

    (mockRepo.getNode as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeNodeResponse('low-current', 'node-a'))
      .mockResolvedValueOnce(makeNodeResponse('high-current', 'node-b'));

    (mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        makeNeighbor('low-current',  { relConfidence: 1.0, relType: 'USES' }),
        makeNeighbor('high-current', { relConfidence: 1.0, relType: 'USES' }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.calculate(TENANT, 'trigger', 1);

    expect(result.affectedNodes).toHaveLength(2);
    expect(result.affectedNodes[0]!.scoreDelta).toBeGreaterThanOrEqual(
      result.affectedNodes[1]!.scoreDelta,
    );
  });

  it('6. blastRadius excludes the trigger node', async () => {
    // Trigger + 2 neighbors visited → blastRadius should be 2 (not 3)
    const getScoreMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    getScoreMock
      .mockResolvedValueOnce(80)   // trigger
      .mockResolvedValueOnce(10)   // n1 current
      .mockResolvedValueOnce(10);  // n2 current

    (mockRepo.getNode as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeNodeResponse('n1', 'alpha'))
      .mockResolvedValueOnce(makeNodeResponse('n2', 'beta'));

    (mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        makeNeighbor('n1', { relConfidence: 1.0, relType: 'USES' }),
        makeNeighbor('n2', { relConfidence: 1.0, relType: 'USES' }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.calculate(TENANT, 'trigger', 2);

    // visited = {trigger, n1, n2} → size 3; blastRadius = 3 - 1 = 2
    expect(result.blastRadius).toBe(2);
  });

  it("7. doesn't propose score below current (only raises, matching DECISION-020)", async () => {
    // Neighbor current score (95) > propagated score → should NOT appear in affectedNodes
    const getScoreMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    getScoreMock
      .mockResolvedValueOnce(50)    // trigger score = 50 (low)
      .mockResolvedValueOnce(95);   // neighbor current = 95 (high — no raise possible)

    (mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([makeNeighbor('rich-node', { relConfidence: 1.0, relType: 'USES' })])
      .mockResolvedValueOnce([]);

    const result = await service.calculate(TENANT, 'trigger', 2);

    // propagatedScore << 95, so rich-node should not appear in affectedNodes
    expect(result.affectedNodes.map((n) => n.id)).not.toContain('rich-node');
  });

  it('8. depth limit stops traversal', async () => {
    // With depth=1, hop2 (distance 2) must not appear in affectedNodes.
    // We still need getNode stubs for hop1 only.
    const getScoreMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    getScoreMock
      .mockResolvedValueOnce(90)  // trigger
      .mockResolvedValueOnce(5);  // hop1 current (hop2 never reached)

    (mockRepo.getNode as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeNodeResponse('hop1', 'stop-here'),
    );

    const getNeighborsMock = mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>;
    // At depth=1 the service skips getNeighborsForPropagation for distance>=depth,
    // so only the trigger's neighbors are fetched.
    getNeighborsMock.mockResolvedValue([makeNeighbor('hop1', { relConfidence: 1.0, relType: 'USES' })]);

    const result = await service.calculate(TENANT, 'trigger', 1);

    // Only hop1 (distance 1) should appear; nothing at distance 2
    const distances = result.affectedNodes.map((n) => n.distance);
    expect(distances.every((d) => d <= 1)).toBe(true);
    // getNeighborsForPropagation should be called for trigger (distance 0) only
    expect(getNeighborsMock).toHaveBeenCalledTimes(1);
  });

  it('9. empty neighbors returns totalAffected = 0', async () => {
    (mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>).mockResolvedValue(60);
    (mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.calculate(TENANT, 'isolated-node', 3);

    expect(result.totalAffected).toBe(0);
    expect(result.affectedNodes).toHaveLength(0);
    expect(result.maxScoreIncrease).toBe(0);
  });

  it('10. maxScoreIncrease is the max delta among affected nodes', async () => {
    // n1: current=5, n2: current=50 → n1 will have a larger delta
    const getScoreMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    getScoreMock
      .mockResolvedValueOnce(90)   // trigger
      .mockResolvedValueOnce(5)    // n1 current (large delta)
      .mockResolvedValueOnce(50);  // n2 current (small delta)

    (mockRepo.getNode as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeNodeResponse('n1', 'alpha'))
      .mockResolvedValueOnce(makeNodeResponse('n2', 'beta'));

    (mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        makeNeighbor('n1', { relConfidence: 1.0, relType: 'USES' }),
        makeNeighbor('n2', { relConfidence: 1.0, relType: 'USES' }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.calculate(TENANT, 'trigger', 1);

    const expectedMax = Math.max(...result.affectedNodes.map((n) => n.scoreDelta));
    expect(result.maxScoreIncrease).toBeCloseTo(expectedMax, 5);
  });

  it('11. propagation below 1.0 threshold is skipped', async () => {
    // Low trigger score + low confidence so propagated < 1.0 → neighbor NOT queued
    const getScoreMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    getScoreMock.mockResolvedValue(2); // trigger score = 2 (very low)

    (mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeNeighbor('below-threshold', { relConfidence: 0.01, relType: 'OBSERVED_IN' }),
    ]);

    const result = await service.calculate(TENANT, 'weak-trigger', 3);

    // propagatedScore = 2 * 0.7^1 * 0.01 * temporal * OBSERVED_IN(0.60) ≈ 0.0084 < 1.0
    // So below-threshold must NOT be queued or appear in affectedNodes
    expect(result.affectedNodes.map((n) => n.id)).not.toContain('below-threshold');
    expect(result.totalAffected).toBe(0);
  });

  it('12. circular graph is handled — visited set prevents infinite loop', async () => {
    // A → B → C → A (cycle); trigger = A with depth=3
    // Without visited-set protection this would loop forever.
    const getScoreMock = mockRepo.getNodeRiskScore as ReturnType<typeof vi.fn>;
    // Trigger score; then each visited node's current score
    getScoreMock
      .mockResolvedValueOnce(80)   // A trigger score
      .mockResolvedValueOnce(10)   // B current
      .mockResolvedValueOnce(10);  // C current (A already visited, never queried again)

    (mockRepo.getNode as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeNodeResponse('node-b', 'b'))
      .mockResolvedValueOnce(makeNodeResponse('node-c', 'c'));

    const getNeighborsMock = mockRepo.getNeighborsForPropagation as ReturnType<typeof vi.fn>;
    // A's neighbors: [B]
    getNeighborsMock.mockResolvedValueOnce([
      makeNeighbor('node-b', { relConfidence: 1.0, relType: 'USES' }),
    ]);
    // B's neighbors: [C]
    getNeighborsMock.mockResolvedValueOnce([
      makeNeighbor('node-c', { relConfidence: 1.0, relType: 'USES' }),
    ]);
    // C's neighbors: [A] — already visited, should be skipped
    getNeighborsMock.mockResolvedValueOnce([
      makeNeighbor('node-a', { relConfidence: 1.0, relType: 'USES' }),
    ]);

    // This must resolve without hanging
    const result = await service.calculate(TENANT, 'node-a', 3);

    // A is the trigger; B and C are the only affected nodes
    const affectedIds = result.affectedNodes.map((n) => n.id);
    expect(affectedIds).toContain('node-b');
    expect(affectedIds).toContain('node-c');
    expect(affectedIds).not.toContain('node-a');
    // blastRadius = visited.size - 1 = 3 - 1 = 2
    expect(result.blastRadius).toBe(2);
  });
});
