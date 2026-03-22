import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphService } from '../src/service.js';
import { GraphRepository } from '../src/repository.js';
import { RiskPropagationEngine } from '../src/propagation.js';
import type pino from 'pino';

// Mock repository
vi.mock('../src/repository.js');
vi.mock('../src/propagation.js');

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as pino.Logger;

describe('Threat Graph — Service', () => {
  let service: GraphService;
  let repo: GraphRepository;
  let propagation: RiskPropagationEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new GraphRepository();
    propagation = new RiskPropagationEngine(repo, 0.7, mockLogger);
    service = new GraphService(repo, propagation, mockLogger);
  });

  describe('createNode', () => {
    it('creates a node with generated UUID', async () => {
      vi.mocked(repo.upsertNode).mockResolvedValue({
        id: 'test-id', nodeType: 'IOC', riskScore: 50, confidence: 0.8, properties: { value: '1.2.3.4' },
      });

      const result = await service.createNode('tenant-1', {
        nodeType: 'IOC', properties: { value: '1.2.3.4', iocType: 'ip' },
      });

      expect(result.nodeType).toBe('IOC');
      expect(repo.upsertNode).toHaveBeenCalledWith('tenant-1', 'IOC', expect.any(String), expect.objectContaining({ value: '1.2.3.4' }));
    });

    it('uses provided ID if present', async () => {
      vi.mocked(repo.upsertNode).mockResolvedValue({
        id: 'custom-id', nodeType: 'ThreatActor', riskScore: 0, confidence: 0, properties: { name: 'APT28' },
      });

      await service.createNode('tenant-1', {
        nodeType: 'ThreatActor', properties: { id: 'custom-id', name: 'APT28' },
      });

      expect(repo.upsertNode).toHaveBeenCalledWith('tenant-1', 'ThreatActor', 'custom-id', expect.objectContaining({ name: 'APT28' }));
    });
  });

  describe('getNode', () => {
    it('returns node when found', async () => {
      vi.mocked(repo.getNode).mockResolvedValue({
        id: 'node-1', nodeType: 'Malware', riskScore: 80, confidence: 0.9, properties: { name: 'Emotet' },
      });

      const result = await service.getNode('tenant-1', 'node-1');
      expect(result.id).toBe('node-1');
    });

    it('throws 404 when not found', async () => {
      vi.mocked(repo.getNode).mockResolvedValue(null);
      await expect(service.getNode('tenant-1', 'missing')).rejects.toThrow('Graph node not found');
    });
  });

  describe('deleteNode', () => {
    it('deletes existing node', async () => {
      vi.mocked(repo.deleteNode).mockResolvedValue(true);
      await expect(service.deleteNode('tenant-1', 'node-1')).resolves.toBeUndefined();
    });

    it('throws 404 for non-existent node', async () => {
      vi.mocked(repo.deleteNode).mockResolvedValue(false);
      await expect(service.deleteNode('tenant-1', 'missing')).rejects.toThrow('Graph node not found');
    });
  });

  describe('createRelationship', () => {
    it('creates valid USES relationship', async () => {
      vi.mocked(repo.getNode)
        .mockResolvedValueOnce({ id: 'a', nodeType: 'ThreatActor', riskScore: 0, confidence: 0, properties: {} })
        .mockResolvedValueOnce({ id: 'b', nodeType: 'Malware', riskScore: 0, confidence: 0, properties: {} });
      vi.mocked(repo.createRelationship).mockResolvedValue({
        id: 'a-USES-b', type: 'USES', fromNodeId: 'a', toNodeId: 'b', confidence: 0.9, properties: {},
      });

      const result = await service.createRelationship('tenant-1', {
        fromNodeId: 'a', toNodeId: 'b', type: 'USES', confidence: 0.9,
      });
      expect(result.type).toBe('USES');
    });

    it('rejects invalid source type for USES', async () => {
      vi.mocked(repo.getNode)
        .mockResolvedValueOnce({ id: 'a', nodeType: 'IOC', riskScore: 0, confidence: 0, properties: {} })
        .mockResolvedValueOnce({ id: 'b', nodeType: 'Malware', riskScore: 0, confidence: 0, properties: {} });

      await expect(service.createRelationship('tenant-1', {
        fromNodeId: 'a', toNodeId: 'b', type: 'USES', confidence: 0.9,
      })).rejects.toThrow('cannot start from IOC');
    });

    it('rejects invalid target type for EXPLOITS', async () => {
      vi.mocked(repo.getNode)
        .mockResolvedValueOnce({ id: 'a', nodeType: 'ThreatActor', riskScore: 0, confidence: 0, properties: {} })
        .mockResolvedValueOnce({ id: 'b', nodeType: 'Malware', riskScore: 0, confidence: 0, properties: {} });

      await expect(service.createRelationship('tenant-1', {
        fromNodeId: 'a', toNodeId: 'b', type: 'EXPLOITS', confidence: 0.9,
      })).rejects.toThrow('cannot point to Malware');
    });

    it('throws 404 for missing source node', async () => {
      vi.mocked(repo.getNode).mockResolvedValueOnce(null);
      await expect(service.createRelationship('tenant-1', {
        fromNodeId: 'missing', toNodeId: 'b', type: 'USES', confidence: 0.5,
      })).rejects.toThrow('Source node not found');
    });
  });

  describe('getEntityNeighbors', () => {
    it('returns subgraph with center node', async () => {
      vi.mocked(repo.getNode).mockResolvedValue({
        id: 'center', nodeType: 'ThreatActor', riskScore: 50, confidence: 0.8, properties: {},
      });
      vi.mocked(repo.getNHopNeighbors).mockResolvedValue({
        nodes: [{ id: 'n1', nodeType: 'Malware', riskScore: 30, confidence: 0.5, properties: {} }],
        edges: [{ id: 'e1', type: 'USES', fromNodeId: 'center', toNodeId: 'n1', confidence: 0.8, properties: {} }],
      });

      const result = await service.getEntityNeighbors('tenant-1', 'center', 2, undefined, 100);
      expect(result.nodes.length).toBe(2); // center + neighbor
      expect(result.edges.length).toBe(1);
    });

    it('throws 404 for missing node', async () => {
      vi.mocked(repo.getNode).mockResolvedValue(null);
      await expect(service.getEntityNeighbors('tenant-1', 'missing', 2, undefined, 100)).rejects.toThrow('not found');
    });
  });

  describe('findPath (P0 #4)', () => {
    it('returns path with human-readable explanation', async () => {
      vi.mocked(repo.findShortestPath).mockResolvedValue({
        nodes: [
          { id: 'a', nodeType: 'IOC', riskScore: 50, confidence: 0.8, properties: {} },
          { id: 'b', nodeType: 'Infrastructure', riskScore: 30, confidence: 0.5, properties: {} },
          { id: 'c', nodeType: 'ThreatActor', riskScore: 90, confidence: 0.9, properties: {} },
        ],
        edges: [
          { id: 'e1', type: 'HOSTED_ON', fromNodeId: 'a', toNodeId: 'b', confidence: 0.8, properties: {} },
          { id: 'e2', type: 'INDICATES', fromNodeId: 'b', toNodeId: 'c', confidence: 0.7, properties: {} },
        ],
        pathNodes: [
          { id: 'a', type: 'IOC', label: '1.2.3.4' },
          { id: 'b', type: 'Infrastructure', label: 'AS12345' },
          { id: 'c', type: 'ThreatActor', label: 'APT28' },
        ],
      });

      const result = await service.findPath('tenant-1', 'a', 'c', 5);
      expect(result.length).toBe(2);
      expect(result.steps.length).toBe(2);
      expect(result.explanation).toContain('1.2.3.4');
      expect(result.explanation).toContain('APT28');
      expect(result.explanation).toContain('is hosted on');
    });

    it('throws 404 when no path exists', async () => {
      vi.mocked(repo.findShortestPath).mockResolvedValue(null);
      await expect(service.findPath('tenant-1', 'a', 'b', 5)).rejects.toThrow('No path found');
    });
  });

  describe('triggerPropagation (P0 #1)', () => {
    it('triggers propagation for existing node', async () => {
      vi.mocked(repo.getNode).mockResolvedValue({
        id: 'node-1', nodeType: 'IOC', riskScore: 80, confidence: 0.9, properties: {},
      });
      vi.mocked(propagation.propagate).mockResolvedValue({
        triggerNodeId: 'node-1', nodesUpdated: 3, nodesVisited: 10, maxDepthReached: 2,
        updates: [{ nodeId: 'n2', oldScore: 20, newScore: 56, distance: 1 }],
      });

      const result = await service.triggerPropagation('tenant-1', 'node-1', 3);
      expect(result.nodesUpdated).toBe(3);
      expect(propagation.propagate).toHaveBeenCalledWith('tenant-1', 'node-1', 80, 3);
    });

    it('throws 404 for missing node', async () => {
      vi.mocked(repo.getNode).mockResolvedValue(null);
      await expect(service.triggerPropagation('tenant-1', 'missing', 3)).rejects.toThrow('not found');
    });
  });

  describe('getStats (P0 #5)', () => {
    it('returns graph statistics', async () => {
      vi.mocked(repo.getStats).mockResolvedValue({
        totalNodes: 100, totalEdges: 250, nodesByType: { IOC: 60, ThreatActor: 20 },
        edgesByType: { USES: 50 }, mostConnected: [], isolatedNodes: 5, avgConnections: 5.0,
      });

      const stats = await service.getStats('tenant-1');
      expect(stats.totalNodes).toBe(100);
      expect(stats.totalEdges).toBe(250);
    });
  });
});
