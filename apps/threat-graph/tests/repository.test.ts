import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => {
  return {
    createSession: () => ({ run: mockRun, close: mockClose }),
    getNeo4jDriver: vi.fn(),
  };
});

import { GraphRepository } from '../src/repository.js';

describe('Threat Graph — Repository', () => {
  let repo: GraphRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new GraphRepository();
  });

  describe('upsertNode', () => {
    it('creates/upserts an IOC node', async () => {
      mockRun.mockResolvedValue({
        records: [{
          get: (key: string) => {
            if (key === 'node') return { id: 'node-1', nodeType: 'IOC', value: '1.2.3.4', riskScore: 50, confidence: 0.8, tenantId: 't1' };
            return null;
          },
        }],
      });

      const result = await repo.upsertNode('t1', 'IOC', 'node-1', { value: '1.2.3.4', iocType: 'ip', riskScore: 50, confidence: 0.8 });
      expect(result.id).toBe('node-1');
      expect(result.nodeType).toBe('IOC');
      expect(result.riskScore).toBe(50);
      expect(mockRun).toHaveBeenCalledOnce();
      expect(mockClose).toHaveBeenCalledOnce();
    });

    it('throws on empty result', async () => {
      mockRun.mockResolvedValue({ records: [] });
      await expect(repo.upsertNode('t1', 'IOC', 'node-1', {})).rejects.toThrow('Failed to upsert');
    });
  });

  describe('getNode', () => {
    it('returns node when found', async () => {
      mockRun.mockResolvedValue({
        records: [{
          get: (key: string) => {
            if (key === 'node') return { id: 'node-1', riskScore: 30, confidence: 0.5, tenantId: 't1' };
            if (key === 'label') return 'Malware';
            return null;
          },
        }],
      });

      const result = await repo.getNode('t1', 'node-1');
      expect(result).not.toBeNull();
      expect(result!.nodeType).toBe('Malware');
    });

    it('returns null when not found', async () => {
      mockRun.mockResolvedValue({ records: [] });
      const result = await repo.getNode('t1', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('deleteNode', () => {
    it('returns true when node deleted', async () => {
      mockRun.mockResolvedValue({ records: [{ get: () => 1 }] });
      const result = await repo.deleteNode('t1', 'node-1');
      expect(result).toBe(true);
    });

    it('returns false when node not found', async () => {
      mockRun.mockResolvedValue({ records: [{ get: () => 0 }] });
      const result = await repo.deleteNode('t1', 'missing');
      expect(result).toBe(false);
    });
  });

  describe('createRelationship', () => {
    it('creates a relationship between two nodes', async () => {
      mockRun.mockResolvedValue({
        records: [{
          get: (key: string) => {
            const data: Record<string, unknown> = {
              relType: 'USES', confidence: 0.9, fromNodeId: 'a', toNodeId: 'b',
              firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-03-22T00:00:00.000Z',
            };
            return data[key];
          },
        }],
      });

      const result = await repo.createRelationship('t1', 'a', 'b', 'USES', 0.9, {});
      expect(result.type).toBe('USES');
      expect(result.confidence).toBe(0.9);
    });

    it('throws when nodes not found', async () => {
      mockRun.mockResolvedValue({ records: [] });
      await expect(repo.createRelationship('t1', 'a', 'b', 'USES', 0.5, {})).rejects.toThrow('not found');
    });
  });

  describe('getStats', () => {
    it('computes graph statistics', async () => {
      // First call: nodesByType
      mockRun.mockResolvedValueOnce({
        records: [
          { get: (k: string) => k === 'nodeType' ? 'IOC' : 60 },
          { get: (k: string) => k === 'nodeType' ? 'ThreatActor' : 20 },
        ],
      });
      // Second call: edgesByType
      mockRun.mockResolvedValueOnce({
        records: [
          { get: (k: string) => k === 'relType' ? 'USES' : 50 },
        ],
      });
      // Third call: connections
      mockRun.mockResolvedValueOnce({
        records: [{
          get: (k: string) => {
            const data: Record<string, unknown> = {
              top10: [{ id: 'n1', type: 'IOC', label: '1.2.3.4', connections: 15 }],
              isolatedCount: 5, totalNodes: 80, totalConnections: 400,
            };
            return data[k];
          },
        }],
      });

      const stats = await repo.getStats('t1');
      expect(stats.totalNodes).toBe(80);
      expect(stats.totalEdges).toBe(50);
      expect(stats.nodesByType['IOC']).toBe(60);
      expect(stats.edgesByType['USES']).toBe(50);
      expect(stats.isolatedNodes).toBe(5);
      expect(stats.avgConnections).toBe(5);
    });
  });

  describe('getNeighborsForPropagation', () => {
    it('returns neighbor data for propagation', async () => {
      mockRun.mockResolvedValue({
        records: [{
          get: (key: string) => {
            const data: Record<string, unknown> = { id: 'n1', riskScore: 30, relConfidence: 0.8, relLastSeen: '2026-03-22T00:00:00Z' };
            return data[key];
          },
        }],
      });

      const neighbors = await repo.getNeighborsForPropagation('t1', 'node-1');
      expect(neighbors.length).toBe(1);
      expect(neighbors[0]!.relConfidence).toBe(0.8);
    });
  });

  describe('updateRiskScore', () => {
    it('updates node risk score', async () => {
      mockRun.mockResolvedValue({ records: [] });
      await expect(repo.updateRiskScore('t1', 'node-1', 75)).resolves.toBeUndefined();
      expect(mockRun).toHaveBeenCalledWith(
        expect.stringContaining('SET n.riskScore'),
        expect.objectContaining({ nodeId: 'node-1', newScore: 75 }),
      );
    });
  });

  describe('session management', () => {
    it('always closes session after operation', async () => {
      mockRun.mockRejectedValue(new Error('Query failed'));
      await expect(repo.getNode('t1', 'x')).rejects.toThrow('Query failed');
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
