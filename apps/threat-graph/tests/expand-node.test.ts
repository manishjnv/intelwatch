import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSession } from '../src/driver.js';

vi.mock('../src/driver.js', () => ({
  createSession: vi.fn(),
}));

import { ExpandNodeService } from '../src/services/expand-node.js';

// ─── Helpers ─────────────────────────────────────────────────────

function makeRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] ?? null };
}

/** Build a raw Neo4j record representing one expanded neighbor row. */
function makeNeighborRecord(opts: {
  nodeId: string;
  nodeType: string;
  riskScore: number;
  confidence?: number;
  relType: string;
  relConf?: number;
  fromId: string;          // startNode(r).id — determines direction from the query node's POV
  props?: Record<string, unknown>;
}) {
  const props: Record<string, unknown> = {
    id: opts.nodeId,
    riskScore: opts.riskScore,
    confidence: opts.confidence ?? 0.7,
    tenantId: 't1',
    ...(opts.props ?? {}),
  };
  return makeRecord({
    props,
    label: opts.nodeType,
    relType: opts.relType,
    relConf: opts.relConf ?? 0.8,
    fromId: opts.fromId,
  });
}

/** Build a count record as returned by the first session.run call. */
function makeCountRecord(total: number) {
  return makeRecord({ total });
}

// ─── Tests ───────────────────────────────────────────────────────

describe('ExpandNodeService', () => {
  let service: ExpandNodeService;
  let mockSession: { run: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExpandNodeService();
    mockSession = {
      run: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createSession).mockReturnValue(mockSession as any);
  });

  it('returns immediate neighbors sorted by riskScore descending', async () => {
    // Neo4j does the ordering; we verify the service preserves the order returned
    mockSession.run
      .mockResolvedValueOnce({ records: [makeCountRecord(3)] })        // count query
      .mockResolvedValueOnce({
        records: [
          makeNeighborRecord({ nodeId: 'ioc-3', nodeType: 'IOC', riskScore: 90, relType: 'CONTROLS', fromId: 'malware-1' }),
          makeNeighborRecord({ nodeId: 'ioc-1', nodeType: 'IOC', riskScore: 60, relType: 'CONTROLS', fromId: 'malware-1' }),
          makeNeighborRecord({ nodeId: 'ioc-2', nodeType: 'IOC', riskScore: 30, relType: 'CONTROLS', fromId: 'malware-1' }),
        ],
      });

    const result = await service.expand('t1', 'malware-1', 20, 0);

    expect(result.neighbors).toHaveLength(3);
    expect(result.neighbors[0]!.node.riskScore).toBe(90);
    expect(result.neighbors[1]!.node.riskScore).toBe(60);
    expect(result.neighbors[2]!.node.riskScore).toBe(30);
  });

  it('offset pagination passes correct offset to the query', async () => {
    mockSession.run
      .mockResolvedValueOnce({ records: [makeCountRecord(10)] })
      .mockResolvedValueOnce({
        records: [
          makeNeighborRecord({ nodeId: 'ioc-6', nodeType: 'IOC', riskScore: 40, relType: 'CONTROLS', fromId: 'malware-1' }),
        ],
      });

    const result = await service.expand('t1', 'malware-1', 5, 5);

    expect(result.neighbors).toHaveLength(1);
    // Verify offset and limit were passed through to the paginated query
    expect(mockSession.run).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ offset: 5, limit: 5 }),
    );
  });

  it('hasMore is true when offset + limit is less than total', async () => {
    mockSession.run
      .mockResolvedValueOnce({ records: [makeCountRecord(15)] })
      .mockResolvedValueOnce({
        records: Array.from({ length: 5 }, (_, i) =>
          makeNeighborRecord({ nodeId: `ioc-${i}`, nodeType: 'IOC', riskScore: 50 - i * 5, relType: 'CONTROLS', fromId: 'malware-1' }),
        ),
      });

    const result = await service.expand('t1', 'malware-1', 5, 0);

    // offset(0) + limit(5) = 5 < total(15)
    expect(result.hasMore).toBe(true);
  });

  it('hasMore is false when all neighbors have been returned', async () => {
    mockSession.run
      .mockResolvedValueOnce({ records: [makeCountRecord(3)] })
      .mockResolvedValueOnce({
        records: [
          makeNeighborRecord({ nodeId: 'ioc-1', nodeType: 'IOC', riskScore: 70, relType: 'CONTROLS', fromId: 'malware-1' }),
          makeNeighborRecord({ nodeId: 'ioc-2', nodeType: 'IOC', riskScore: 50, relType: 'CONTROLS', fromId: 'malware-1' }),
          makeNeighborRecord({ nodeId: 'ioc-3', nodeType: 'IOC', riskScore: 30, relType: 'CONTROLS', fromId: 'malware-1' }),
        ],
      });

    // offset(0) + limit(20) = 20 >= total(3)
    const result = await service.expand('t1', 'malware-1', 20, 0);

    expect(result.hasMore).toBe(false);
  });

  it('nodeType filter is forwarded and limits results to matching types', async () => {
    mockSession.run
      .mockResolvedValueOnce({ records: [makeCountRecord(1)] })
      .mockResolvedValueOnce({
        records: [
          makeNeighborRecord({ nodeId: 'vuln-1', nodeType: 'Vulnerability', riskScore: 80, relType: 'EXPLOITS', fromId: 'actor-1' }),
        ],
      });

    const result = await service.expand('t1', 'actor-1', 20, 0, 'Vulnerability');

    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0]!.node.nodeType).toBe('Vulnerability');
    // Verify nodeType was passed in both queries
    expect(mockSession.run).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ nodeType: 'Vulnerability' }),
    );
    expect(mockSession.run).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ nodeType: 'Vulnerability' }),
    );
  });

  it('total reflects the count before pagination, not just the page size', async () => {
    mockSession.run
      .mockResolvedValueOnce({ records: [makeCountRecord(42)] })
      .mockResolvedValueOnce({
        records: Array.from({ length: 10 }, (_, i) =>
          makeNeighborRecord({ nodeId: `ioc-${i}`, nodeType: 'IOC', riskScore: 80 - i, relType: 'CONTROLS', fromId: 'malware-1' }),
        ),
      });

    const result = await service.expand('t1', 'malware-1', 10, 0);

    expect(result.total).toBe(42);
    expect(result.neighbors).toHaveLength(10);
  });

  it('empty neighbors returns empty array and total 0', async () => {
    mockSession.run
      .mockResolvedValueOnce({ records: [makeCountRecord(0)] })
      .mockResolvedValueOnce({ records: [] });

    const result = await service.expand('t1', 'orphan-node', 20, 0);

    expect(result.nodeId).toBe('orphan-node');
    expect(result.neighbors).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  it("direction is 'outbound' when fromId matches the queried nodeId", async () => {
    const nodeId = 'malware-1';
    mockSession.run
      .mockResolvedValueOnce({ records: [makeCountRecord(1)] })
      .mockResolvedValueOnce({
        records: [
          makeNeighborRecord({
            nodeId: 'ioc-1',
            nodeType: 'IOC',
            riskScore: 70,
            relType: 'CONTROLS',
            fromId: nodeId,   // startNode is the queried node → outbound
          }),
        ],
      });

    const result = await service.expand('t1', nodeId, 20, 0);

    expect(result.neighbors[0]!.relationship.direction).toBe('outbound');
  });

  it("direction is 'inbound' when fromId does not match the queried nodeId", async () => {
    const nodeId = 'malware-1';
    mockSession.run
      .mockResolvedValueOnce({ records: [makeCountRecord(1)] })
      .mockResolvedValueOnce({
        records: [
          makeNeighborRecord({
            nodeId: 'actor-1',
            nodeType: 'ThreatActor',
            riskScore: 85,
            relType: 'USES',
            fromId: 'actor-1',   // startNode is the neighbor, not the queried node → inbound
          }),
        ],
      });

    const result = await service.expand('t1', nodeId, 20, 0);

    expect(result.neighbors[0]!.relationship.direction).toBe('inbound');
  });
});
