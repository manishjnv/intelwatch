import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockRun, close: mockClose }),
}));

import { GraphRepository } from '../src/repository.js';
import { getOverviewSubgraph } from '../src/repository-extended.js';
import { OverviewQuerySchema } from '../src/schemas/search.js';

function makeRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] ?? null };
}

const TENANT = 'tenant-abc';

describe('getOverviewSubgraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns nodes with correct nodeType/riskScore/properties (no tenantId) and edges when graph is populated', async () => {
    const nodeData = [
      { node: { id: 'a1', tenantId: TENANT, riskScore: 80, name: 'APT99' }, label: 'ThreatActor' },
      { node: { id: 'm1', tenantId: TENANT, riskScore: 60, name: 'Emotet' }, label: 'Malware' },
      { node: { id: 'i1', tenantId: TENANT, riskScore: 40, value: '1.2.3.4' }, label: 'IOC' },
    ];
    const edgeData = [
      { type: 'USES', fromId: 'a1', toId: 'm1', confidence: 0.9, firstSeen: '2026-01-01', lastSeen: '2026-02-01' },
      { type: 'DROPS', fromId: 'm1', toId: 'i1', confidence: 0.7, firstSeen: '2026-01-05', lastSeen: '2026-02-05' },
    ];
    mockRun.mockResolvedValue({ records: [makeRecord({ nodeData, edgeData })] });

    const result = await getOverviewSubgraph(TENANT, 50);

    expect(result.nodes).toHaveLength(3);
    const actor = result.nodes.find((n) => n.id === 'a1')!;
    expect(actor.nodeType).toBe('ThreatActor');
    expect(actor.riskScore).toBe(80);
    expect(actor.properties).not.toHaveProperty('tenantId');
    expect(actor.properties['name']).toBe('APT99');

    expect(result.edges).toHaveLength(2);
    const e1 = result.edges.find((e) => e.fromNodeId === 'a1')!;
    expect(e1.id).toBe('a1-USES-m1');
    expect(e1.toNodeId).toBe('m1');
    expect(e1.confidence).toBe(0.9);
  });

  it('returns empty nodes/edges for an empty tenant without throwing', async () => {
    mockRun.mockResolvedValue({ records: [] });

    const result = await getOverviewSubgraph(TENANT, 50);

    expect(result).toEqual({ nodes: [], edges: [] });
  });

  it('returns a single node with no edges', async () => {
    const nodeData = [{ node: { id: 'a1', tenantId: TENANT, riskScore: 10 }, label: 'IOC' }];
    mockRun.mockResolvedValue({ records: [makeRecord({ nodeData, edgeData: [] })] });

    const result = await getOverviewSubgraph(TENANT, 50);

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  it('is tenant-scoped and never interpolates raw values into the query text', async () => {
    mockRun.mockResolvedValue({ records: [] });

    await getOverviewSubgraph(TENANT, 5);

    expect(mockRun).toHaveBeenCalledOnce();
    const [cypher, params] = mockRun.mock.calls[0]!;
    expect(params).toEqual({ tenantId: TENANT, limit: 5 });
    expect((cypher as string).match(/\{tenantId: \$tenantId\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(cypher as string).toContain('LIMIT toInteger($limit)');
    expect(cypher as string).not.toContain(TENANT);
  });

  it('always closes the session, even when the query rejects', async () => {
    mockRun.mockRejectedValue(new Error('Neo4j unavailable'));

    await expect(getOverviewSubgraph(TENANT, 50)).rejects.toThrow('Neo4j unavailable');
    expect(mockClose).toHaveBeenCalledOnce();
  });
});

describe('OverviewQuerySchema', () => {
  it.each([0, -1, 501, 'abc', 2.5])('rejects invalid limit %p', (val) => {
    expect(OverviewQuerySchema.safeParse({ limit: val }).success).toBe(false);
  });

  it('accepts "5" and coerces to 5', () => {
    expect(OverviewQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });

  it('defaults to 50 when missing', () => {
    expect(OverviewQuerySchema.parse({}).limit).toBe(50);
  });

  it('accepts "500" and coerces to 500', () => {
    expect(OverviewQuerySchema.parse({ limit: '500' }).limit).toBe(500);
  });
});

describe('GraphRepository#getOverviewSubgraph', () => {
  it('delegates to repository-extended and returns the mocked result', async () => {
    const nodeData = [{ node: { id: 'a1', tenantId: TENANT, riskScore: 5 }, label: 'IOC' }];
    mockRun.mockResolvedValue({ records: [makeRecord({ nodeData, edgeData: [] })] });

    const repo = new GraphRepository();
    const result = await repo.getOverviewSubgraph(TENANT, 10);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.id).toBe('a1');
  });
});
