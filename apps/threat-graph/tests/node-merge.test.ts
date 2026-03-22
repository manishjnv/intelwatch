import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSession } from '../src/driver.js';

vi.mock('../src/driver.js', () => ({
  createSession: vi.fn(),
}));

import { NodeMergeService } from '../src/services/node-merge.js';
import { GraphRepository } from '../src/repository.js';
import { GraphService } from '../src/service.js';
import type pino from 'pino';

// ─── Helpers ─────────────────────────────────────────────────────

function makeNode(overrides: Partial<{
  id: string;
  nodeType: string;
  riskScore: number;
  confidence: number;
  properties: Record<string, unknown>;
}> = {}) {
  return {
    id: overrides.id ?? 'node-default',
    nodeType: overrides.nodeType ?? 'IOC',
    riskScore: overrides.riskScore ?? 50,
    confidence: overrides.confidence ?? 0.8,
    properties: overrides.properties ?? {},
  };
}

function makeRecord(data: Record<string, unknown>) {
  return { get: (key: string) => data[key] ?? null };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('NodeMergeService', () => {
  let svc: NodeMergeService;
  let mockRepo: GraphRepository;
  let mockService: GraphService;
  let mockLogger: pino.Logger;
  let mockSession: { run: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      getNode: vi.fn(),
      deleteNode: vi.fn(),
      upsertNode: vi.fn(),
      updateRiskScore: vi.fn(),
    } as unknown as GraphRepository;

    mockService = {
      createNode: vi.fn(),
      triggerPropagation: vi.fn(),
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

    mockSession = {
      run: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(createSession).mockReturnValue(mockSession as any);

    svc = new NodeMergeService(mockRepo, mockService, mockLogger);
  });

  // ── mergeNodes ───────────────────────────────────────────────────

  describe('mergeNodes()', () => {
    const SOURCE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
    const TARGET_ID = 'aaaaaaaa-0000-0000-0000-000000000002';

    it('merges properties from source into target — target wins on conflicts', async () => {
      const source = makeNode({
        id: SOURCE_ID,
        nodeType: 'IOC',
        riskScore: 30,
        properties: { value: '1.2.3.4', country: 'US', extra: 'source-value' },
      });
      const target = makeNode({
        id: TARGET_ID,
        nodeType: 'IOC',
        riskScore: 40,
        properties: { value: '1.2.3.4', country: 'RU' }, // country conflicts
      });

      vi.mocked(mockRepo.getNode)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      vi.mocked(mockRepo.deleteNode).mockResolvedValue(true);

      // No relationships to transfer
      mockSession.run.mockResolvedValueOnce({ records: [] }); // transferResult
      // No mergedProps SET query (extra is not in target so it will be SET)
      mockSession.run.mockResolvedValueOnce(undefined);

      const result = await svc.mergeNodes('t1', {
        sourceNodeId: SOURCE_ID,
        targetNodeId: TARGET_ID,
        preferTarget: true,
        triggerPropagation: false,
      });

      // extra was in source but not target → should be in propertiesMerged
      expect(result.propertiesMerged).toContain('extra');
      // country exists in target (preferTarget=true) → should NOT be merged
      expect(result.propertiesMerged).not.toContain('country');
    });

    it('transfers all relationships from source to target', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'Malware', riskScore: 60, properties: {} });
      const target = makeNode({ id: TARGET_ID, nodeType: 'Malware', riskScore: 50, properties: {} });

      vi.mocked(mockRepo.getNode)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      vi.mocked(mockRepo.deleteNode).mockResolvedValue(true);

      const otherNodeId = 'cccccccc-0000-0000-0000-000000000003';
      // transferResult — two relationships to move
      mockSession.run
        .mockResolvedValueOnce({
          records: [
            makeRecord({ relType: 'CONTROLS', fromId: SOURCE_ID, toId: otherNodeId, rProps: {} }),
            makeRecord({ relType: 'RELATED_TO', fromId: otherNodeId, toId: SOURCE_ID, rProps: {} }),
          ],
        })
        // Two MERGE calls for creating the transferred relationships
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const result = await svc.mergeNodes('t1', {
        sourceNodeId: SOURCE_ID,
        targetNodeId: TARGET_ID,
        preferTarget: true,
        triggerPropagation: false,
      });

      expect(result.relationshipsTransferred).toBe(2);
    });

    it('deletes source node after merge', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'IOC', riskScore: 20, properties: {} });
      const target = makeNode({ id: TARGET_ID, nodeType: 'IOC', riskScore: 30, properties: {} });

      vi.mocked(mockRepo.getNode)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      vi.mocked(mockRepo.deleteNode).mockResolvedValue(true);
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await svc.mergeNodes('t1', {
        sourceNodeId: SOURCE_ID,
        targetNodeId: TARGET_ID,
        preferTarget: true,
        triggerPropagation: false,
      });

      expect(mockRepo.deleteNode).toHaveBeenCalledWith('t1', SOURCE_ID);
      expect(result.deletedNodeId).toBe(SOURCE_ID);
      expect(result.mergedNodeId).toBe(TARGET_ID);
    });

    it('takes max risk score of both nodes', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'ThreatActor', riskScore: 90, properties: {} });
      const target = makeNode({ id: TARGET_ID, nodeType: 'ThreatActor', riskScore: 40, properties: {} });

      vi.mocked(mockRepo.getNode)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      vi.mocked(mockRepo.deleteNode).mockResolvedValue(true);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined as any);
      mockSession.run.mockResolvedValue({ records: [] });

      await svc.mergeNodes('t1', {
        sourceNodeId: SOURCE_ID,
        targetNodeId: TARGET_ID,
        preferTarget: true,
        triggerPropagation: false,
      });

      // Source has higher risk (90 > 40) → updateRiskScore must be called with 90
      expect(mockRepo.updateRiskScore).toHaveBeenCalledWith('t1', TARGET_ID, 90);
    });

    it('triggers propagation when triggerPropagation=true and maxRisk > 0', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'IOC', riskScore: 70, properties: {} });
      const target = makeNode({ id: TARGET_ID, nodeType: 'IOC', riskScore: 50, properties: {} });

      vi.mocked(mockRepo.getNode)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      vi.mocked(mockRepo.deleteNode).mockResolvedValue(true);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined as any);
      vi.mocked(mockService.triggerPropagation).mockResolvedValue({
        triggerNodeId: TARGET_ID,
        nodesUpdated: 2,
        nodesVisited: 5,
        maxDepthReached: 2,
        updates: [],
      });
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await svc.mergeNodes('t1', {
        sourceNodeId: SOURCE_ID,
        targetNodeId: TARGET_ID,
        preferTarget: true,
        triggerPropagation: true,
      });

      expect(mockService.triggerPropagation).toHaveBeenCalledWith('t1', TARGET_ID, 3);
      expect(result.propagationTriggered).toBe(true);
    });

    it('does NOT trigger propagation when triggerPropagation=false', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'IOC', riskScore: 70, properties: {} });
      const target = makeNode({ id: TARGET_ID, nodeType: 'IOC', riskScore: 50, properties: {} });

      vi.mocked(mockRepo.getNode)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);
      vi.mocked(mockRepo.deleteNode).mockResolvedValue(true);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined as any);
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await svc.mergeNodes('t1', {
        sourceNodeId: SOURCE_ID,
        targetNodeId: TARGET_ID,
        preferTarget: true,
        triggerPropagation: false,
      });

      expect(mockService.triggerPropagation).not.toHaveBeenCalled();
      expect(result.propagationTriggered).toBe(false);
    });

    it('throws 400 when merging a node with itself', async () => {
      await expect(
        svc.mergeNodes('t1', {
          sourceNodeId: SOURCE_ID,
          targetNodeId: SOURCE_ID,
          preferTarget: true,
          triggerPropagation: false,
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'MERGE_SELF' });
    });

    it('throws 400 when node types do not match', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'IOC', riskScore: 50, properties: {} });
      const target = makeNode({ id: TARGET_ID, nodeType: 'Malware', riskScore: 50, properties: {} });

      vi.mocked(mockRepo.getNode)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(target);

      await expect(
        svc.mergeNodes('t1', {
          sourceNodeId: SOURCE_ID,
          targetNodeId: TARGET_ID,
          preferTarget: true,
          triggerPropagation: false,
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'MERGE_TYPE_MISMATCH' });
    });

    it('throws 404 when source node not found', async () => {
      vi.mocked(mockRepo.getNode).mockResolvedValueOnce(null);

      await expect(
        svc.mergeNodes('t1', {
          sourceNodeId: SOURCE_ID,
          targetNodeId: TARGET_ID,
          preferTarget: true,
          triggerPropagation: false,
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'NODE_NOT_FOUND' });
    });

    it('throws 404 when target node not found', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'IOC', riskScore: 50, properties: {} });

      vi.mocked(mockRepo.getNode)
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(null);

      await expect(
        svc.mergeNodes('t1', {
          sourceNodeId: SOURCE_ID,
          targetNodeId: TARGET_ID,
          preferTarget: true,
          triggerPropagation: false,
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'NODE_NOT_FOUND' });
    });
  });

  // ── splitNode ────────────────────────────────────────────────────

  describe('splitNode()', () => {
    const SOURCE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
    const OTHER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';

    it('creates clone node with provided properties', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'ThreatActor', riskScore: 70, properties: { name: 'APT28' } });
      vi.mocked(mockRepo.getNode).mockResolvedValueOnce(source);
      vi.mocked(mockRepo.upsertNode).mockResolvedValue(undefined as any);
      mockSession.run.mockResolvedValue(undefined);

      await svc.splitNode('t1', {
        sourceNodeId: SOURCE_ID,
        newNodeProperties: { name: 'APT28-clone', region: 'EU' },
        relationshipsToMove: [],
      });

      expect(mockRepo.upsertNode).toHaveBeenCalledWith(
        't1',
        'ThreatActor',
        expect.any(String),
        expect.objectContaining({ name: 'APT28-clone', region: 'EU' }),
      );
    });

    it('moves specified relationships to clone', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'Malware', riskScore: 60, properties: {} });
      vi.mocked(mockRepo.getNode).mockResolvedValueOnce(source);
      vi.mocked(mockRepo.upsertNode).mockResolvedValue(undefined as any);
      // Each rel move = DELETE + CREATE calls
      mockSession.run
        .mockResolvedValueOnce(undefined) // DELETE rel 1
        .mockResolvedValueOnce(undefined); // CREATE rel 1

      const result = await svc.splitNode('t1', {
        sourceNodeId: SOURCE_ID,
        newNodeProperties: { name: 'MalwareB' },
        relationshipsToMove: [
          { fromNodeId: SOURCE_ID, type: 'CONTROLS', toNodeId: OTHER_ID },
        ],
      });

      expect(result.relationshipsMoved).toBe(1);
      expect(mockSession.run).toHaveBeenCalledTimes(2);
    });

    it('returns correct originalNodeId and newNodeId', async () => {
      const source = makeNode({ id: SOURCE_ID, nodeType: 'IOC', riskScore: 40, properties: {} });
      vi.mocked(mockRepo.getNode).mockResolvedValueOnce(source);
      vi.mocked(mockRepo.upsertNode).mockResolvedValue(undefined as any);
      mockSession.run.mockResolvedValue(undefined);

      const result = await svc.splitNode('t1', {
        sourceNodeId: SOURCE_ID,
        newNodeProperties: { value: '5.6.7.8' },
        relationshipsToMove: [],
      });

      expect(result.originalNodeId).toBe(SOURCE_ID);
      // newNodeId should be a valid UUID (not equal to source)
      expect(result.newNodeId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(result.newNodeId).not.toBe(SOURCE_ID);
    });

    it('throws 404 when source node not found', async () => {
      vi.mocked(mockRepo.getNode).mockResolvedValueOnce(null);

      await expect(
        svc.splitNode('t1', {
          sourceNodeId: SOURCE_ID,
          newNodeProperties: {},
          relationshipsToMove: [],
        }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'NODE_NOT_FOUND' });
    });
  });
});
