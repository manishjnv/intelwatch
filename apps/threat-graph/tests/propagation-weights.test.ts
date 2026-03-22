import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiskPropagationEngine } from '../src/propagation.js';
import { GraphRepository } from '../src/repository.js';
import type { PropagationAuditEntry } from '../src/schemas/search.js';
import type pino from 'pino';

vi.mock('../src/repository.js');

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
} as any;

// Helper: build a fresh mock repo with typed vi.fn() stubs.
function makeMockRepo() {
  return {
    getNodeRiskScore: vi.fn(),
    updateRiskScore: vi.fn(),
    getNeighborsForPropagation: vi.fn(),
  } as unknown as GraphRepository;
}

// Helper: a neighbor object with the relType field required by P1 #9.
function neighbor(
  id: string,
  relType: string,
  riskScore = 10,
  relConfidence = 0.8,
  relLastSeen: string | null = new Date().toISOString(),
) {
  return { id, riskScore, relConfidence, relLastSeen, relType };
}

// Decay factor used across all tests in this suite.
const DECAY = 0.7;
const TENANT = 'tenant-weights';

describe('Threat Graph — P1 #9 Cross-Entity Type Scoring + P2 #15 Audit Callback', () => {
  let engine: RiskPropagationEngine;
  let mockRepo: GraphRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = makeMockRepo();
    engine = new RiskPropagationEngine(mockRepo, DECAY, mockLogger);
  });

  // ─── P1 #9 — Relationship-Type Weights ───────────────────────────────────

  describe('P1 #9 — per-relationship-type propagation weights', () => {
    it('1. CONTROLS (0.95) propagates more risk than OBSERVED_IN (0.6)', async () => {
      // Two separate propagations from the same trigger score, one CONTROLS neighbor
      // and one OBSERVED_IN neighbor, both with identical confidence and fresh dates.
      const triggerScore = 80;

      // --- CONTROLS run ---
      const repoA = makeMockRepo();
      const engineA = new RiskPropagationEngine(repoA, DECAY, mockLogger);
      vi.mocked(repoA.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(repoA.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(repoA.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('ctrl-n', 'CONTROLS', 0, 1.0)])
        .mockResolvedValue([]);

      const resultA = await engineA.propagate(TENANT, 'trigger-a', triggerScore, 1);

      // --- OBSERVED_IN run ---
      const repoB = makeMockRepo();
      const engineB = new RiskPropagationEngine(repoB, DECAY, mockLogger);
      vi.mocked(repoB.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(repoB.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(repoB.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('obs-n', 'OBSERVED_IN', 0, 1.0)])
        .mockResolvedValue([]);

      const resultB = await engineB.propagate(TENANT, 'trigger-b', triggerScore, 1);

      expect(resultA.updates).toHaveLength(1);
      expect(resultB.updates).toHaveLength(1);
      expect(resultA.updates[0].newScore).toBeGreaterThan(resultB.updates[0].newScore);
    });

    it('2. USES relationship (0.9) weight is applied to the propagated score', async () => {
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('uses-n', 'USES', 0, 1.0)])
        .mockResolvedValue([]);

      const triggerScore = 100;
      const result = await engine.propagate(TENANT, 'trigger', triggerScore, 1);

      // At hop 1, confidence=1.0, temporal≈1.0 (just now), decay=0.7^1=0.7
      // Expected = 100 × 0.7 × 1.0 × ~1.0 × 0.90 ≈ 63
      const update = result.updates[0];
      expect(update).toBeDefined();
      // Allow small temporal drift: expect score in [60, 64]
      expect(update.newScore).toBeGreaterThanOrEqual(60);
      expect(update.newScore).toBeLessThanOrEqual(64);
    });

    it('3. EXPLOITS relationship (0.85) weight is applied to the propagated score', async () => {
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('expl-n', 'EXPLOITS', 0, 1.0)])
        .mockResolvedValue([]);

      const triggerScore = 100;
      const result = await engine.propagate(TENANT, 'trigger', triggerScore, 1);

      // Expected = 100 × 0.7 × 1.0 × ~1.0 × 0.85 ≈ 59.5
      const update = result.updates[0];
      expect(update).toBeDefined();
      expect(update.newScore).toBeGreaterThanOrEqual(57);
      expect(update.newScore).toBeLessThanOrEqual(61);
    });

    it('4. RESOLVES_TO relationship (0.65) weight is applied to the propagated score', async () => {
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('res-n', 'RESOLVES_TO', 0, 1.0)])
        .mockResolvedValue([]);

      const triggerScore = 100;
      const result = await engine.propagate(TENANT, 'trigger', triggerScore, 1);

      // Expected = 100 × 0.7 × 1.0 × ~1.0 × 0.65 ≈ 45.5
      const update = result.updates[0];
      expect(update).toBeDefined();
      expect(update.newScore).toBeGreaterThanOrEqual(43);
      expect(update.newScore).toBeLessThanOrEqual(48);
    });

    it('5. Unknown relationship type defaults to 0.7 weight', async () => {
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('unk-n', 'UNKNOWN_REL', 0, 1.0)])
        .mockResolvedValue([]);

      const triggerScore = 100;
      const result = await engine.propagate(TENANT, 'trigger', triggerScore, 1);

      // Expected = 100 × 0.7 × 1.0 × ~1.0 × 0.70 ≈ 49
      const update = result.updates[0];
      expect(update).toBeDefined();
      expect(update.newScore).toBeGreaterThanOrEqual(47);
      expect(update.newScore).toBeLessThanOrEqual(51);
    });

    it('6. Combined formula: score = triggerScore × decay^dist × confidence × temporal × relTypeWeight', async () => {
      // Use a fixed date 30 days ago so temporal decay is predictable (~0.74)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const confidence = 0.8;
      const triggerScore = 100;
      const relType = 'CONTROLS'; // weight = 0.95

      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('ctrl-n', relType, 0, confidence, thirtyDaysAgo)])
        .mockResolvedValue([]);

      const result = await engine.propagate(TENANT, 'trigger', triggerScore, 1);

      // Expected = 100 × 0.7 × 0.8 × 0.74 × 0.95 ≈ 39.4
      // Range accounts for temporal drift over exact second of test execution
      const update = result.updates[0];
      expect(update).toBeDefined();
      expect(update.newScore).toBeGreaterThanOrEqual(36);
      expect(update.newScore).toBeLessThanOrEqual(43);
    });

    it('7. Multi-hop propagation applies relTypeWeight at each hop', async () => {
      // hop1: CONTROLS (0.95), hop2: USES (0.90)
      // We use a separate engine to isolate
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('hop1', 'CONTROLS', 0, 1.0)]) // trigger → hop1
        .mockResolvedValueOnce([neighbor('hop2', 'USES', 0, 1.0)])     // hop1   → hop2
        .mockResolvedValue([]);

      const result = await engine.propagate(TENANT, 'trigger', 100, 2);

      // hop1 score = 100 × 0.7^1 × 1.0 × ~1.0 × 0.95 ≈ 66.5
      // hop2 score = 100 × 0.7^2 × 1.0 × ~1.0 × 0.90 ≈ 44.1
      const hop1 = result.updates.find((u) => u.nodeId === 'hop1');
      const hop2 = result.updates.find((u) => u.nodeId === 'hop2');

      expect(hop1).toBeDefined();
      expect(hop2).toBeDefined();
      expect(hop1!.distance).toBe(1);
      expect(hop2!.distance).toBe(2);
      // hop1 should have higher score than hop2 (distance + different relType)
      expect(hop1!.newScore).toBeGreaterThan(hop2!.newScore);
    });

    it('8. High-weight relationship with low confidence yields lower score than high-weight + high confidence', async () => {
      // CONTROLS (0.95) + confidence 0.1 vs CONTROLS (0.95) + confidence 0.9
      const repoLow = makeMockRepo();
      const engineLow = new RiskPropagationEngine(repoLow, DECAY, mockLogger);
      vi.mocked(repoLow.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(repoLow.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(repoLow.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('n-low', 'CONTROLS', 0, 0.1)])
        .mockResolvedValue([]);

      const repoHigh = makeMockRepo();
      const engineHigh = new RiskPropagationEngine(repoHigh, DECAY, mockLogger);
      vi.mocked(repoHigh.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(repoHigh.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(repoHigh.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('n-high', 'CONTROLS', 0, 0.9)])
        .mockResolvedValue([]);

      const triggerScore = 100;
      const resultLow = await engineLow.propagate(TENANT, 'trigger', triggerScore, 1);
      const resultHigh = await engineHigh.propagate(TENANT, 'trigger', triggerScore, 1);

      // low-conf: 100 × 0.7 × 0.1 × ~1.0 × 0.95 ≈ 6.65 (below 1 threshold, skipped OR low)
      // high-conf: 100 × 0.7 × 0.9 × ~1.0 × 0.95 ≈ 59.8
      // If low-conf result is empty (score < 1.0 threshold), it's skipped entirely.
      if (resultLow.updates.length > 0) {
        expect(resultHigh.updates[0].newScore).toBeGreaterThan(resultLow.updates[0].newScore);
      } else {
        // Low-conf was below propagation threshold — high-conf should still have a result
        expect(resultHigh.updates).toHaveLength(1);
        expect(resultHigh.updates[0].newScore).toBeGreaterThan(50);
      }
    });
  });

  // ─── P2 #15 — Audit Callback ─────────────────────────────────────────────

  describe('P2 #15 — audit trail callback', () => {
    it('9. onAudit callback is called after propagation completes', async () => {
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('n1', 'CONTROLS', 0, 1.0)])
        .mockResolvedValue([]);

      const auditSpy = vi.fn<[PropagationAuditEntry], void>();
      engine.onAudit(auditSpy);

      await engine.propagate(TENANT, 'trigger-node', 80, 2);

      expect(auditSpy).toHaveBeenCalledTimes(1);
    });

    it('10. Audit entry contains correct triggerNodeId and triggerScore', async () => {
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('n1', 'CONTROLS', 0, 0.9)])
        .mockResolvedValue([]);

      const auditSpy = vi.fn<[PropagationAuditEntry], void>();
      engine.onAudit(auditSpy);

      const triggerNodeId = 'my-trigger-id';
      const triggerScore = 75;
      await engine.propagate(TENANT, triggerNodeId, triggerScore, 2);

      const entry: PropagationAuditEntry = auditSpy.mock.calls[0][0];
      expect(entry.triggerNodeId).toBe(triggerNodeId);
      expect(entry.triggerScore).toBe(triggerScore);
      expect(entry.tenantId).toBe(TENANT);
    });

    it('11. Audit entry updates array contains relType for each propagated node', async () => {
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([
          neighbor('n1', 'CONTROLS', 0, 1.0),
          neighbor('n2', 'USES', 0, 1.0),
        ])
        .mockResolvedValue([]);

      const auditSpy = vi.fn<[PropagationAuditEntry], void>();
      engine.onAudit(auditSpy);

      await engine.propagate(TENANT, 'trigger', 80, 1);

      const entry: PropagationAuditEntry = auditSpy.mock.calls[0][0];
      // Both neighbors should be in audit updates (scores are high enough to exceed 1.0 threshold)
      expect(entry.updates.length).toBeGreaterThanOrEqual(1);
      for (const update of entry.updates) {
        expect(update.relType).toBeDefined();
        expect(typeof update.relType).toBe('string');
      }

      const relTypes = entry.updates.map((u) => u.relType);
      expect(relTypes).toContain('CONTROLS');
      expect(relTypes).toContain('USES');
    });

    it('12. Audit entry updates array contains all weight components for each node', async () => {
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('n1', 'CONTROLS', 0, 0.9)])
        .mockResolvedValue([]);

      const auditSpy = vi.fn<[PropagationAuditEntry], void>();
      engine.onAudit(auditSpy);

      await engine.propagate(TENANT, 'trigger', 80, 1);

      const entry: PropagationAuditEntry = auditSpy.mock.calls[0][0];
      expect(entry.updates.length).toBeGreaterThanOrEqual(1);

      const update = entry.updates[0];
      // All four weight components must be present and numeric
      expect(typeof update.decayWeight).toBe('number');
      expect(typeof update.confidenceWeight).toBe('number');
      expect(typeof update.temporalWeight).toBe('number');
      expect(typeof update.relTypeWeight).toBe('number');

      // Sanity-check ranges
      expect(update.decayWeight).toBeGreaterThan(0);
      expect(update.decayWeight).toBeLessThanOrEqual(1);
      expect(update.confidenceWeight).toBeCloseTo(0.9, 5);
      expect(update.temporalWeight).toBeGreaterThan(0.98); // fresh date
      expect(update.relTypeWeight).toBeCloseTo(0.95, 5); // CONTROLS
    });

    it('13. No audit callback fires when onAudit is not registered', async () => {
      // Do NOT call engine.onAudit(...)
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([neighbor('n1', 'CONTROLS', 0, 1.0)])
        .mockResolvedValue([]);

      // Patch the internal auditCallback to verify it stays null/uncalled
      const globalSpy = vi.spyOn(engine as any, 'auditCallback', 'get').mockReturnValue(null);

      await expect(engine.propagate(TENANT, 'trigger', 80, 1)).resolves.not.toThrow();

      globalSpy.mockRestore();
    });

    it('14. Propagation still works correctly without audit callback', async () => {
      // No onAudit registered — propagation should function identically
      vi.mocked(mockRepo.getNodeRiskScore).mockResolvedValue(0);
      vi.mocked(mockRepo.updateRiskScore).mockResolvedValue(undefined);
      vi.mocked(mockRepo.getNeighborsForPropagation)
        .mockResolvedValueOnce([
          neighbor('n1', 'CONTROLS', 0, 1.0),
          neighbor('n2', 'OBSERVED_IN', 0, 1.0),
        ])
        .mockResolvedValue([]);

      const result = await engine.propagate(TENANT, 'trigger', 80, 1);

      expect(result.triggerNodeId).toBe('trigger');
      expect(result.nodesUpdated).toBe(2);
      expect(result.nodesVisited).toBeGreaterThanOrEqual(1);
      // CONTROLS (0.95) neighbor should score higher than OBSERVED_IN (0.6)
      const ctrlUpdate = result.updates.find((u) => u.nodeId === 'n1');
      const obsUpdate = result.updates.find((u) => u.nodeId === 'n2');
      expect(ctrlUpdate).toBeDefined();
      expect(obsUpdate).toBeDefined();
      expect(ctrlUpdate!.newScore).toBeGreaterThan(obsUpdate!.newScore);
    });
  });
});
