import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchImportService } from '../src/services/batch-import.js';
import { GraphService } from '../src/service.js';
import type pino from 'pino';

// ─── Helpers ─────────────────────────────────────────────────────

function makeNodeInput(overrides: Partial<{
  nodeType: string;
  properties: Record<string, unknown>;
}> = {}) {
  return {
    nodeType: (overrides.nodeType ?? 'IOC') as 'IOC',
    properties: overrides.properties ?? { value: '1.2.3.4', iocType: 'ip' },
  };
}

function makeRelInput(overrides: Partial<{
  fromNodeId: string;
  toNodeId: string;
  type: string;
  confidence: number;
  source: string;
}> = {}) {
  return {
    fromNodeId: overrides.fromNodeId ?? 'aaaaaaaa-0000-0000-0000-000000000001',
    toNodeId: overrides.toNodeId ?? 'bbbbbbbb-0000-0000-0000-000000000002',
    type: (overrides.type ?? 'RELATED_TO') as 'RELATED_TO',
    confidence: overrides.confidence ?? 0.8,
    source: (overrides.source ?? 'auto-detected') as 'auto-detected',
  };
}

function makeCreatedNode(id: string) {
  return {
    id,
    nodeType: 'IOC' as const,
    riskScore: 0,
    confidence: 0,
    properties: {},
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('BatchImportService', () => {
  let svc: BatchImportService;
  let mockService: GraphService;
  let mockLogger: pino.Logger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockService = {
      createNode: vi.fn(),
      createRelationship: vi.fn(),
    } as unknown as GraphService;

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    } as any;

    svc = new BatchImportService(mockService, mockLogger);
  });

  it('creates all nodes in batch successfully', async () => {
    vi.mocked(mockService.createNode)
      .mockResolvedValueOnce(makeCreatedNode('id-1'))
      .mockResolvedValueOnce(makeCreatedNode('id-2'))
      .mockResolvedValueOnce(makeCreatedNode('id-3'));

    await svc.importBatch('t1', {
      nodes: [makeNodeInput(), makeNodeInput(), makeNodeInput()],
      relationships: [],
    });

    expect(mockService.createNode).toHaveBeenCalledTimes(3);
  });

  it('creates all relationships after nodes', async () => {
    vi.mocked(mockService.createNode)
      .mockResolvedValueOnce(makeCreatedNode('id-1'))
      .mockResolvedValueOnce(makeCreatedNode('id-2'));
    vi.mocked(mockService.createRelationship).mockResolvedValue({
      id: 'rel-1',
      type: 'RELATED_TO',
      fromNodeId: 'id-1',
      toNodeId: 'id-2',
      confidence: 0.8,
      properties: {},
    });

    await svc.importBatch('t1', {
      nodes: [makeNodeInput(), makeNodeInput()],
      relationships: [makeRelInput()],
    });

    // Verify nodes were called before relationships by checking call order
    const createNodeCalls = vi.mocked(mockService.createNode).mock.invocationCallOrder;
    const createRelCalls = vi.mocked(mockService.createRelationship).mock.invocationCallOrder;
    expect(Math.max(...createNodeCalls)).toBeLessThan(Math.min(...createRelCalls));
  });

  it('returns correct nodesCreated count', async () => {
    vi.mocked(mockService.createNode)
      .mockResolvedValueOnce(makeCreatedNode('id-1'))
      .mockResolvedValueOnce(makeCreatedNode('id-2'));

    const result = await svc.importBatch('t1', {
      nodes: [
        makeNodeInput({ properties: { value: '1.1.1.1' } }),    // no id → created
        makeNodeInput({ properties: { value: '2.2.2.2' } }),    // no id → created
      ],
      relationships: [],
    });

    expect(result.nodesCreated).toBe(2);
    expect(result.nodesUpdated).toBe(0);
  });

  it('returns correct relationshipsCreated count', async () => {
    vi.mocked(mockService.createNode).mockResolvedValue(makeCreatedNode('id-1'));
    vi.mocked(mockService.createRelationship).mockResolvedValue({
      id: 'rel-1',
      type: 'RELATED_TO',
      fromNodeId: 'a',
      toNodeId: 'b',
      confidence: 0.8,
      properties: {},
    });

    const result = await svc.importBatch('t1', {
      nodes: [makeNodeInput()],
      relationships: [makeRelInput(), makeRelInput()],
    });

    expect(result.relationshipsCreated).toBe(2);
    expect(result.relationshipsFailed).toBe(0);
  });

  it('returns nodeIds for all created nodes', async () => {
    vi.mocked(mockService.createNode)
      .mockResolvedValueOnce(makeCreatedNode('uuid-aaa'))
      .mockResolvedValueOnce(makeCreatedNode('uuid-bbb'))
      .mockResolvedValueOnce(makeCreatedNode('uuid-ccc'));

    const result = await svc.importBatch('t1', {
      nodes: [makeNodeInput(), makeNodeInput(), makeNodeInput()],
      relationships: [],
    });

    expect(result.nodeIds).toEqual(['uuid-aaa', 'uuid-bbb', 'uuid-ccc']);
  });

  it('handles partial node failure — continues processing remaining nodes', async () => {
    vi.mocked(mockService.createNode)
      .mockResolvedValueOnce(makeCreatedNode('id-1'))
      .mockRejectedValueOnce(new Error('duplicate node'))
      .mockResolvedValueOnce(makeCreatedNode('id-3'));

    const result = await svc.importBatch('t1', {
      nodes: [makeNodeInput(), makeNodeInput(), makeNodeInput()],
      relationships: [],
    });

    expect(result.nodesCreated).toBe(2);
    expect(result.nodesFailed).toBe(1);
    expect(result.nodeIds).toEqual(['id-1', 'id-3']);
  });

  it('handles relationship failure — continues processing remaining relationships', async () => {
    vi.mocked(mockService.createNode).mockResolvedValue(makeCreatedNode('id-1'));
    vi.mocked(mockService.createRelationship)
      .mockResolvedValueOnce({
        id: 'rel-1',
        type: 'RELATED_TO',
        fromNodeId: 'a',
        toNodeId: 'b',
        confidence: 0.8,
        properties: {},
      })
      .mockRejectedValueOnce(new Error('node not found'))
      .mockResolvedValueOnce({
        id: 'rel-3',
        type: 'RELATED_TO',
        fromNodeId: 'c',
        toNodeId: 'd',
        confidence: 0.8,
        properties: {},
      });

    const result = await svc.importBatch('t1', {
      nodes: [makeNodeInput()],
      relationships: [makeRelInput(), makeRelInput(), makeRelInput()],
    });

    expect(result.relationshipsCreated).toBe(2);
    expect(result.relationshipsFailed).toBe(1);
  });

  it('records errors with correct index and type', async () => {
    vi.mocked(mockService.createNode)
      .mockResolvedValueOnce(makeCreatedNode('id-1'))
      .mockRejectedValueOnce(new Error('validation failed'));
    vi.mocked(mockService.createRelationship).mockRejectedValueOnce(
      new Error('missing endpoint'),
    );

    const result = await svc.importBatch('t1', {
      nodes: [makeNodeInput(), makeNodeInput()],
      relationships: [makeRelInput()],
    });

    expect(result.errors).toHaveLength(2);

    const nodeErr = result.errors.find((e) => e.type === 'node');
    expect(nodeErr).toBeDefined();
    expect(nodeErr!.index).toBe(1);
    expect(nodeErr!.error).toBe('validation failed');

    const relErr = result.errors.find((e) => e.type === 'relationship');
    expect(relErr).toBeDefined();
    expect(relErr!.index).toBe(0);
    expect(relErr!.error).toBe('missing endpoint');
  });

  it('empty batch returns all zeros with empty arrays', async () => {
    const result = await svc.importBatch('t1', {
      nodes: [],
      relationships: [],
    });

    expect(result.nodesCreated).toBe(0);
    expect(result.nodesUpdated).toBe(0);
    expect(result.nodesFailed).toBe(0);
    expect(result.relationshipsCreated).toBe(0);
    expect(result.relationshipsFailed).toBe(0);
    expect(result.nodeIds).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('nodesUpdated count increments when id is provided in node properties', async () => {
    vi.mocked(mockService.createNode)
      .mockResolvedValueOnce(makeCreatedNode('existing-id-1'))
      .mockResolvedValueOnce(makeCreatedNode('new-id-2'));

    const result = await svc.importBatch('t1', {
      nodes: [
        makeNodeInput({ properties: { id: 'existing-id-1', value: '1.1.1.1' } }), // has id → updated
        makeNodeInput({ properties: { value: '2.2.2.2' } }),                        // no id → created
      ],
      relationships: [],
    });

    expect(result.nodesUpdated).toBe(1);
    expect(result.nodesCreated).toBe(1);
  });

  it('nodesFailed count increments when createNode throws', async () => {
    vi.mocked(mockService.createNode)
      .mockRejectedValueOnce(new Error('neo4j unreachable'))
      .mockRejectedValueOnce(new Error('schema mismatch'))
      .mockResolvedValueOnce(makeCreatedNode('id-3'));

    const result = await svc.importBatch('t1', {
      nodes: [makeNodeInput(), makeNodeInput(), makeNodeInput()],
      relationships: [],
    });

    expect(result.nodesFailed).toBe(2);
    expect(result.nodesCreated).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0]!.index).toBe(0);
    expect(result.errors[1]!.index).toBe(1);
  });

  it('relationshipsFailed count increments when createRelationship throws', async () => {
    vi.mocked(mockService.createNode).mockResolvedValue(makeCreatedNode('id-1'));
    vi.mocked(mockService.createRelationship)
      .mockRejectedValueOnce(new Error('source not found'))
      .mockRejectedValueOnce(new Error('target not found'))
      .mockResolvedValueOnce({
        id: 'rel-3',
        type: 'RELATED_TO',
        fromNodeId: 'a',
        toNodeId: 'b',
        confidence: 0.5,
        properties: {},
      });

    const result = await svc.importBatch('t1', {
      nodes: [makeNodeInput()],
      relationships: [makeRelInput(), makeRelInput(), makeRelInput()],
    });

    expect(result.relationshipsFailed).toBe(2);
    expect(result.relationshipsCreated).toBe(1);
    expect(result.errors.filter((e) => e.type === 'relationship')).toHaveLength(2);
  });
});
