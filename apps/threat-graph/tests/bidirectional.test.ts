import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSession } from '../src/driver.js';

vi.mock('../src/driver.js', () => ({
  createSession: vi.fn(),
}));

import { BidirectionalService } from '../src/services/bidirectional.js';

// ─── Helpers ─────────────────────────────────────────────────────

function makeRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] ?? null };
}

/** Build a raw Neo4j record representing one relationship row. */
function makeRelRecord(opts: {
  fromId: string;
  toId: string;
  relType: string;
  confidence?: number;
  source?: string;
  firstSeen?: string;
  lastSeen?: string;
  props?: Record<string, unknown>;
}) {
  return makeRecord({
    fromId: opts.fromId,
    toId: opts.toId,
    relType: opts.relType,
    confidence: opts.confidence ?? 0.8,
    source: opts.source ?? 'auto-detected',
    firstSeen: opts.firstSeen ?? '2026-01-01T00:00:00.000Z',
    lastSeen: opts.lastSeen ?? '2026-03-22T00:00:00.000Z',
    props: opts.props ?? {},
  });
}

// ─── Tests ───────────────────────────────────────────────────────

describe('BidirectionalService', () => {
  let service: BidirectionalService;
  let mockSession: { run: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BidirectionalService();
    mockSession = {
      run: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createSession).mockReturnValue(mockSession as any);
  });

  it('returns outbound relationships correctly when startNode matches nodeId', async () => {
    const nodeId = 'actor-1';
    mockSession.run.mockResolvedValue({
      records: [
        makeRelRecord({ fromId: nodeId, toId: 'malware-1', relType: 'USES' }),
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId);

    expect(result.relationships).toHaveLength(1);
    const edge = result.relationships[0]!;
    expect(edge.direction).toBe('outbound');
    expect(edge.fromNodeId).toBe(nodeId);
    expect(edge.toNodeId).toBe('malware-1');
    expect(edge.type).toBe('USES');
  });

  it('returns inbound relationships correctly when endNode matches nodeId', async () => {
    const nodeId = 'malware-1';
    mockSession.run.mockResolvedValue({
      records: [
        makeRelRecord({ fromId: 'actor-1', toId: nodeId, relType: 'USES' }),
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId);

    expect(result.relationships).toHaveLength(1);
    const edge = result.relationships[0]!;
    expect(edge.direction).toBe('inbound');
    expect(edge.fromNodeId).toBe('actor-1');
    expect(edge.toNodeId).toBe(nodeId);
  });

  it('counts inbound and outbound correctly across a mixed result set', async () => {
    const nodeId = 'campaign-1';
    mockSession.run.mockResolvedValue({
      records: [
        // outbound: campaign → victim
        makeRelRecord({ fromId: nodeId, toId: 'victim-1', relType: 'TARGETS' }),
        makeRelRecord({ fromId: nodeId, toId: 'victim-2', relType: 'TARGETS' }),
        // inbound: actor → campaign
        makeRelRecord({ fromId: 'actor-1', toId: nodeId, relType: 'CONDUCTS' }),
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId);

    expect(result.outboundCount).toBe(2);
    expect(result.inboundCount).toBe(1);
    expect(result.relationships).toHaveLength(3);
  });

  it('type filter narrows results to only matching relationship type', async () => {
    const nodeId = 'ioc-1';
    mockSession.run.mockResolvedValue({
      records: [
        makeRelRecord({ fromId: nodeId, toId: 'infra-1', relType: 'HOSTED_ON' }),
        makeRelRecord({ fromId: nodeId, toId: 'actor-1', relType: 'INDICATES' }),
        makeRelRecord({ fromId: nodeId, toId: 'campaign-1', relType: 'OBSERVED_IN' }),
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId, 'INDICATES');

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.type).toBe('INDICATES');
    expect(result.outboundCount).toBe(1);
    expect(result.inboundCount).toBe(0);
  });

  it("direction filter 'inbound' returns only inbound edges", async () => {
    const nodeId = 'malware-1';
    mockSession.run.mockResolvedValue({
      records: [
        makeRelRecord({ fromId: 'actor-1', toId: nodeId, relType: 'USES' }),
        makeRelRecord({ fromId: nodeId, toId: 'ioc-1', relType: 'CONTROLS' }),
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId, undefined, 'inbound');

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.direction).toBe('inbound');
    expect(result.inboundCount).toBe(1);
    expect(result.outboundCount).toBe(0);
  });

  it("direction filter 'outbound' returns only outbound edges", async () => {
    const nodeId = 'malware-1';
    mockSession.run.mockResolvedValue({
      records: [
        makeRelRecord({ fromId: 'actor-1', toId: nodeId, relType: 'USES' }),
        makeRelRecord({ fromId: nodeId, toId: 'ioc-1', relType: 'CONTROLS' }),
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId, undefined, 'outbound');

    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]!.direction).toBe('outbound');
    expect(result.outboundCount).toBe(1);
    expect(result.inboundCount).toBe(0);
  });

  it("direction filter 'both' returns all edges without filtering", async () => {
    const nodeId = 'ioc-1';
    mockSession.run.mockResolvedValue({
      records: [
        makeRelRecord({ fromId: nodeId, toId: 'infra-1', relType: 'HOSTED_ON' }),
        makeRelRecord({ fromId: 'actor-1', toId: nodeId, relType: 'INDICATES' }),
        makeRelRecord({ fromId: nodeId, toId: 'campaign-1', relType: 'OBSERVED_IN' }),
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId, undefined, 'both');

    expect(result.relationships).toHaveLength(3);
    expect(result.inboundCount).toBe(1);
    expect(result.outboundCount).toBe(2);
  });

  it('limit parameter is forwarded and caps the result set', async () => {
    const nodeId = 'actor-1';
    // Simulate Neo4j returning 2 records (as if LIMIT 2 was applied)
    mockSession.run.mockResolvedValue({
      records: [
        makeRelRecord({ fromId: nodeId, toId: 'malware-1', relType: 'USES' }),
        makeRelRecord({ fromId: nodeId, toId: 'malware-2', relType: 'USES' }),
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId, undefined, undefined, 2);

    expect(result.relationships).toHaveLength(2);
    // Verify the limit was passed to the Neo4j query
    expect(mockSession.run).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ limit: 2 }),
    );
  });

  it('empty result returns nodeId with zero inbound and outbound counts', async () => {
    const nodeId = 'orphan-node';
    mockSession.run.mockResolvedValue({ records: [] });

    const result = await service.getNodeRelationships('t1', nodeId);

    expect(result.nodeId).toBe(nodeId);
    expect(result.relationships).toHaveLength(0);
    expect(result.inboundCount).toBe(0);
    expect(result.outboundCount).toBe(0);
  });

  it("source field defaults to 'auto-detected' when not present in record", async () => {
    const nodeId = 'actor-1';
    // Provide a record where source returns null (simulating missing property)
    mockSession.run.mockResolvedValue({
      records: [
        {
          get: (key: string) => {
            const data: Record<string, unknown> = {
              fromId: nodeId,
              toId: 'malware-1',
              relType: 'USES',
              confidence: 0.9,
              source: null,   // explicitly absent
              firstSeen: '2026-01-01T00:00:00.000Z',
              lastSeen: '2026-03-22T00:00:00.000Z',
              props: {},
            };
            return data[key] ?? null;
          },
        },
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId);

    expect(result.relationships[0]!.source).toBe('auto-detected');
  });

  it('edge id is composed from fromId, relType, and toId', async () => {
    const nodeId = 'actor-1';
    mockSession.run.mockResolvedValue({
      records: [
        makeRelRecord({ fromId: nodeId, toId: 'malware-99', relType: 'USES' }),
      ],
    });

    const result = await service.getNodeRelationships('t1', nodeId);

    expect(result.relationships[0]!.id).toBe('actor-1-USES-malware-99');
  });
});
