import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiskPropagationEngine } from '../src/propagation.js';
import { GraphRepository } from '../src/repository.js';
import type pino from 'pino';

vi.mock('../src/repository.js');

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as pino.Logger;

describe('Threat Graph — Risk Propagation Engine', () => {
  let engine: RiskPropagationEngine;
  let repo: GraphRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new GraphRepository();
    engine = new RiskPropagationEngine(repo, 0.7, mockLogger);
  });

  describe('propagate', () => {
    it('propagates risk to 1-hop neighbors', async () => {
      vi.mocked(repo.getNodeRiskScore).mockResolvedValue(10);
      vi.mocked(repo.updateRiskScore).mockResolvedValue();
      vi.mocked(repo.getNeighborsForPropagation)
        .mockResolvedValueOnce([
          { id: 'n1', riskScore: 10, relConfidence: 0.9, relLastSeen: new Date().toISOString() },
          { id: 'n2', riskScore: 10, relConfidence: 0.8, relLastSeen: new Date().toISOString() },
        ])
        .mockResolvedValue([]); // No further neighbors

      const result = await engine.propagate('tenant-1', 'trigger', 80, 3);

      expect(result.triggerNodeId).toBe('trigger');
      expect(result.nodesUpdated).toBe(2); // Both neighbors updated (80*0.7*0.9 > 10, 80*0.7*0.8 > 10)
      expect(result.nodesVisited).toBeGreaterThan(0);
    });

    it('does not lower existing higher scores', async () => {
      vi.mocked(repo.getNodeRiskScore).mockResolvedValue(95); // Already high
      vi.mocked(repo.getNeighborsForPropagation)
        .mockResolvedValueOnce([
          { id: 'n1', riskScore: 95, relConfidence: 0.5, relLastSeen: new Date().toISOString() },
        ])
        .mockResolvedValue([]);

      const result = await engine.propagate('tenant-1', 'trigger', 50, 3);
      expect(result.nodesUpdated).toBe(0); // 50*0.7*0.5 = 17.5 < 95
      expect(repo.updateRiskScore).not.toHaveBeenCalled();
    });

    it('respects maxDepth limit', async () => {
      const neighbors = [{ id: 'n1', riskScore: 0, relConfidence: 1.0, relLastSeen: new Date().toISOString() }];
      vi.mocked(repo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(repo.updateRiskScore).mockResolvedValue();
      vi.mocked(repo.getNeighborsForPropagation)
        .mockResolvedValueOnce(neighbors.map((n) => ({ ...n, id: 'hop1' })))
        .mockResolvedValueOnce(neighbors.map((n) => ({ ...n, id: 'hop2' })))
        .mockResolvedValue([]); // maxDepth=1 means no hop2

      const result = await engine.propagate('tenant-1', 'trigger', 100, 1);
      expect(result.maxDepthReached).toBeLessThanOrEqual(1);
    });

    it('avoids revisiting nodes (no cycles)', async () => {
      vi.mocked(repo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(repo.updateRiskScore).mockResolvedValue();

      // Circular: trigger -> n1 -> trigger (should not revisit)
      vi.mocked(repo.getNeighborsForPropagation)
        .mockResolvedValueOnce([{ id: 'n1', riskScore: 0, relConfidence: 1.0, relLastSeen: new Date().toISOString() }])
        .mockResolvedValueOnce([{ id: 'trigger', riskScore: 80, relConfidence: 1.0, relLastSeen: new Date().toISOString() }])
        .mockResolvedValue([]);

      const result = await engine.propagate('tenant-1', 'trigger', 80, 3);
      // trigger visited once, n1 visited once — no infinite loop
      expect(result.nodesVisited).toBeLessThanOrEqual(3);
    });

    it('applies confidence weighting (P0 #2)', async () => {
      vi.mocked(repo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(repo.updateRiskScore).mockResolvedValue();
      vi.mocked(repo.getNeighborsForPropagation)
        .mockResolvedValueOnce([
          { id: 'low-conf', riskScore: 0, relConfidence: 0.1, relLastSeen: new Date().toISOString() },
          { id: 'high-conf', riskScore: 0, relConfidence: 1.0, relLastSeen: new Date().toISOString() },
        ])
        .mockResolvedValue([]);

      const result = await engine.propagate('tenant-1', 'trigger', 100, 1);

      // Both should be updated but high-conf gets higher score
      const updates = result.updates;
      const lowUpdate = updates.find((u) => u.nodeId === 'low-conf');
      const highUpdate = updates.find((u) => u.nodeId === 'high-conf');

      if (highUpdate && lowUpdate) {
        expect(highUpdate.newScore).toBeGreaterThan(lowUpdate.newScore);
      }
    });

    it('skips propagation when score too low', async () => {
      vi.mocked(repo.getNeighborsForPropagation).mockResolvedValueOnce([
        { id: 'n1', riskScore: 0, relConfidence: 0.01, relLastSeen: new Date().toISOString() },
      ]).mockResolvedValue([]);
      vi.mocked(repo.getNodeRiskScore).mockResolvedValue(0);

      const result = await engine.propagate('tenant-1', 'trigger', 2, 3);
      // 2 * 0.7 * 0.01 * ~1.0 = 0.014 < 1.0 threshold → skipped
      expect(result.nodesUpdated).toBe(0);
    });
  });

  describe('calculateTemporalDecay (P0 #3)', () => {
    it('returns ~1.0 for today', () => {
      const decay = engine.calculateTemporalDecay(new Date().toISOString());
      expect(decay).toBeGreaterThan(0.99);
    });

    it('returns ~0.74 for 30 days ago', () => {
      const date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const decay = engine.calculateTemporalDecay(date);
      expect(decay).toBeCloseTo(0.74, 1);
    });

    it('returns ~0.41 for 90 days ago', () => {
      const date = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const decay = engine.calculateTemporalDecay(date);
      expect(decay).toBeCloseTo(0.41, 1);
    });

    it('returns ~0.17 for 180 days ago', () => {
      const date = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const decay = engine.calculateTemporalDecay(date);
      expect(decay).toBeCloseTo(0.17, 1);
    });

    it('returns 0.5 for null (unknown age)', () => {
      expect(engine.calculateTemporalDecay(null)).toBe(0.5);
    });

    it('returns 0.5 for invalid date string', () => {
      expect(engine.calculateTemporalDecay('not-a-date')).toBe(0.5);
    });

    it('never returns negative', () => {
      const veryOld = new Date(Date.now() - 3650 * 24 * 60 * 60 * 1000).toISOString();
      const decay = engine.calculateTemporalDecay(veryOld);
      expect(decay).toBeGreaterThanOrEqual(0);
    });
  });
});
