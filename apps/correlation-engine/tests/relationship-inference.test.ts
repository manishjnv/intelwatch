import { describe, it, expect, beforeEach } from 'vitest';
import { RelationshipInferenceService, type DirectRelationship } from '../src/services/relationship-inference.js';

describe('Correlation Engine — #10 RelationshipInferenceService', () => {
  let svc: RelationshipInferenceService;

  beforeEach(() => {
    svc = new RelationshipInferenceService({ decayFactor: 0.8, maxDepth: 3, minConfidence: 0.1 });
  });

  it('1. buildAdjacencyList creates bidirectional edges', () => {
    const rels: DirectRelationship[] = [
      { fromId: 'A', toId: 'B', confidence: 0.9 },
    ];
    const adj = svc.buildAdjacencyList(rels);
    expect(adj.get('A')).toHaveLength(1);
    expect(adj.get('B')).toHaveLength(1);
    expect(adj.get('A')![0]!.targetId).toBe('B');
    expect(adj.get('B')![0]!.targetId).toBe('A');
  });

  it('2. inferFromEntity finds 2-hop relationships', () => {
    const rels: DirectRelationship[] = [
      { fromId: 'A', toId: 'B', confidence: 0.9 },
      { fromId: 'B', toId: 'C', confidence: 0.8 },
    ];
    const inferred = svc.inferFromEntity('A', rels);
    expect(inferred.length).toBeGreaterThanOrEqual(1);
    const ac = inferred.find((r) => r.toEntityId === 'C');
    expect(ac).toBeDefined();
    expect(ac!.depth).toBe(2);
    expect(ac!.path).toEqual(['A', 'B', 'C']);
  });

  it('3. confidence decays with depth', () => {
    const rels: DirectRelationship[] = [
      { fromId: 'A', toId: 'B', confidence: 0.9 },
      { fromId: 'B', toId: 'C', confidence: 0.8 },
    ];
    const inferred = svc.inferFromEntity('A', rels);
    const ac = inferred.find((r) => r.toEntityId === 'C');
    // conf = 0.9 * 0.8 * 0.8^(2-1) = 0.576
    expect(ac!.confidence).toBeLessThan(0.9 * 0.8);
  });

  it('4. stops when confidence drops below minConfidence', () => {
    const rels: DirectRelationship[] = [
      { fromId: 'A', toId: 'B', confidence: 0.2 },
      { fromId: 'B', toId: 'C', confidence: 0.2 },
      { fromId: 'C', toId: 'D', confidence: 0.2 },
    ];
    const inferred = svc.inferFromEntity('A', rels);
    // 0.2 * 0.2 * 0.8 = 0.032 < 0.1 min — should not reach D
    const ad = inferred.find((r) => r.toEntityId === 'D');
    expect(ad).toBeUndefined();
  });

  it('5. respects maxDepth limit', () => {
    const rels: DirectRelationship[] = [
      { fromId: 'A', toId: 'B', confidence: 0.9 },
      { fromId: 'B', toId: 'C', confidence: 0.9 },
      { fromId: 'C', toId: 'D', confidence: 0.9 },
      { fromId: 'D', toId: 'E', confidence: 0.9 },
    ];
    const inferred = svc.inferFromEntity('A', rels);
    const maxDepth = Math.max(...inferred.map((r) => r.depth), 0);
    expect(maxDepth).toBeLessThanOrEqual(3);
  });

  it('6. handles cycles without infinite loops', () => {
    const rels: DirectRelationship[] = [
      { fromId: 'A', toId: 'B', confidence: 0.9 },
      { fromId: 'B', toId: 'C', confidence: 0.9 },
      { fromId: 'C', toId: 'A', confidence: 0.9 }, // Cycle
    ];
    // Should complete without hanging — cycle nodes are direct bidirectional
    // neighbors of A, so no depth>1 inferences needed
    const inferred = svc.inferFromEntity('A', rels);
    expect(inferred.length).toBeGreaterThanOrEqual(0);
  });

  it('7. returns empty for isolated entity', () => {
    const rels: DirectRelationship[] = [
      { fromId: 'B', toId: 'C', confidence: 0.9 },
    ];
    const inferred = svc.inferFromEntity('A', rels);
    expect(inferred).toHaveLength(0);
  });

  it('8. results are sorted by confidence descending', () => {
    const rels: DirectRelationship[] = [
      { fromId: 'A', toId: 'B', confidence: 0.9 },
      { fromId: 'A', toId: 'C', confidence: 0.5 },
      { fromId: 'B', toId: 'D', confidence: 0.8 },
      { fromId: 'C', toId: 'E', confidence: 0.9 },
    ];
    const inferred = svc.inferFromEntity('A', rels);
    for (let i = 1; i < inferred.length; i++) {
      expect(inferred[i]!.confidence).toBeLessThanOrEqual(inferred[i - 1]!.confidence);
    }
  });
});
