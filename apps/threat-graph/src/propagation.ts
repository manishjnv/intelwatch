import { GraphRepository } from './repository.js';
import { RELATIONSHIP_TYPE_WEIGHTS, type PropagationResult, type RelationshipType } from './schemas/graph.js';
import type { PropagationAuditEntry } from './schemas/search.js';
import type pino from 'pino';

/** Callback signature for audit trail integration (#15). */
export type AuditCallback = (entry: PropagationAuditEntry) => void;

/**
 * Risk Propagation Engine — P0 #1-3 + P1 #9 + P2 #15.
 *
 * P0 #1 Retroactive Risk Propagation: BFS traversal, 0.7^distance decay.
 * P0 #2 Confidence-Weighted Edges: relationship.confidence multiplies weight.
 * P0 #3 Temporal Decay on Edges: older relationships carry less weight.
 * P1 #9 Cross-Entity Type Scoring: per-relationship-type propagation weights.
 * P2 #15 Audit Trail: callback hook records every propagation event.
 *
 * Formula: triggerScore × decay^distance × confidence × temporal × relTypeWeight
 */
export class RiskPropagationEngine {
  private auditCallback: AuditCallback | null = null;

  constructor(
    private readonly repo: GraphRepository,
    private readonly decayFactor: number,
    private readonly logger: pino.Logger,
  ) {}

  /** Register audit trail callback (#15). */
  onAudit(callback: AuditCallback): void {
    this.auditCallback = callback;
  }

  /** Propagates risk from a node outward through graph relationships. */
  async propagate(
    tenantId: string,
    triggerNodeId: string,
    triggerScore: number,
    maxDepth: number,
  ): Promise<PropagationResult> {
    const updates: PropagationResult['updates'] = [];
    const visited = new Set<string>();
    let nodesVisited = 0;
    let maxDepthReached = 0;

    // BFS queue: [nodeId, distance, parentScore]
    const queue: Array<[string, number, number]> = [[triggerNodeId, 0, triggerScore]];
    visited.add(triggerNodeId);

    // Detailed audit updates for #15
    const auditUpdates: PropagationAuditEntry['updates'] = [];

    while (queue.length > 0) {
      const [currentId, distance, parentScore] = queue.shift()!;
      nodesVisited++;

      if (distance > maxDepth) continue;
      if (distance > maxDepthReached) maxDepthReached = distance;

      // Skip propagation from the trigger itself (distance 0 = source)
      if (distance > 0) {
        const currentScore = await this.repo.getNodeRiskScore(tenantId, currentId);
        const proposedScore = parentScore;

        if (proposedScore > currentScore) {
          const newScore = Math.min(100, Math.round(proposedScore * 100) / 100);
          await this.repo.updateRiskScore(tenantId, currentId, newScore);
          updates.push({ nodeId: currentId, oldScore: currentScore, newScore, distance });

          this.logger.debug(
            { nodeId: currentId, oldScore: currentScore, newScore, distance },
            'Risk propagation update',
          );
        }
      }

      // Don't explore beyond maxDepth
      if (distance >= maxDepth) continue;

      // Get neighbors for next hop (now includes relType for #9)
      const neighbors = await this.repo.getNeighborsForPropagation(tenantId, currentId);

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.id)) continue;
        visited.add(neighbor.id);

        const hopDistance = distance + 1;
        const decayWeight = Math.pow(this.decayFactor, hopDistance);
        const confidenceWeight = neighbor.relConfidence;
        const temporalWeight = this.calculateTemporalDecay(neighbor.relLastSeen);
        // P1 #9: per-relationship-type weight
        const relTypeWeight = RELATIONSHIP_TYPE_WEIGHTS[neighbor.relType as RelationshipType] ?? 0.7;

        const propagatedScore = triggerScore * decayWeight * confidenceWeight * temporalWeight * relTypeWeight;

        // Track detailed weights for audit trail (#15)
        if (propagatedScore >= 1.0) {
          auditUpdates.push({
            nodeId: neighbor.id,
            oldScore: neighbor.riskScore,
            newScore: Math.min(100, Math.round(propagatedScore * 100) / 100),
            distance: hopDistance,
            relType: neighbor.relType,
            decayWeight,
            confidenceWeight,
            temporalWeight,
            relTypeWeight,
          });
          queue.push([neighbor.id, hopDistance, propagatedScore]);
        }
      }
    }

    this.logger.info(
      { triggerNodeId, triggerScore, nodesVisited, nodesUpdated: updates.length, maxDepthReached },
      'Risk propagation complete',
    );

    const result: PropagationResult = {
      triggerNodeId,
      nodesUpdated: updates.length,
      nodesVisited,
      maxDepthReached,
      updates,
    };

    // Fire audit callback (#15)
    if (this.auditCallback) {
      this.auditCallback({
        id: `prop-${Date.now()}-${triggerNodeId.slice(0, 8)}`,
        timestamp: new Date().toISOString(),
        tenantId,
        triggerNodeId,
        triggerScore,
        maxDepth,
        nodesUpdated: updates.length,
        nodesVisited,
        updates: auditUpdates,
      });
    }

    return result;
  }

  /**
   * Temporal decay factor for relationship age (P0 #3).
   * e^(-0.01 × daysSinceLastSeen)
   * - Recent relationship (today): ~1.0
   * - 30 days old: ~0.74
   * - 90 days old: ~0.41
   * - 180 days old: ~0.17
   */
  calculateTemporalDecay(lastSeen: string | null): number {
    if (!lastSeen) return 0.5; // Unknown age → conservative weight

    const lastSeenDate = new Date(lastSeen);
    if (isNaN(lastSeenDate.getTime())) return 0.5;

    const daysSince = (Date.now() - lastSeenDate.getTime()) / (1000 * 60 * 60 * 24);
    return Math.exp(-0.01 * Math.max(0, daysSince));
  }
}
