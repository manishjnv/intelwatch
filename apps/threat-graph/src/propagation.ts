import { GraphRepository } from './repository.js';
import type { PropagationResult } from './schemas/graph.js';
import type pino from 'pino';

/**
 * Risk Propagation Engine — P0 Improvements #1, #2, #3.
 *
 * #1 Retroactive Risk Propagation: BFS traversal from changed node, 0.7^distance decay.
 * #2 Confidence-Weighted Edges: relationship.confidence multiplies propagation weight.
 * #3 Temporal Decay on Edges: older relationships carry less propagation weight.
 *
 * Algorithm:
 *   1. Start at trigger node with its riskScore
 *   2. BFS to maxDepth hops
 *   3. For each neighbor:
 *      weight = decayFactor^distance × relationship.confidence × temporalFactor
 *      proposedScore = triggerScore × weight
 *      if proposedScore > neighbor.currentScore → update
 *   4. Only propagates UPWARD (never lowers a score)
 */
export class RiskPropagationEngine {
  constructor(
    private readonly repo: GraphRepository,
    private readonly decayFactor: number,
    private readonly logger: pino.Logger,
  ) {}

  /** Propagates risk from a node outward through graph relationships. */
  async propagate(
    tenantId: string,
    triggerNodeId: string,
    triggerScore: number,
    maxDepth: number,
  ): Promise<PropagationResult> {
    const updates: Array<{ nodeId: string; oldScore: number; newScore: number; distance: number }> = [];
    const visited = new Set<string>();
    let nodesVisited = 0;
    let maxDepthReached = 0;

    // BFS queue: [nodeId, distance, parentScore]
    const queue: Array<[string, number, number]> = [[triggerNodeId, 0, triggerScore]];
    visited.add(triggerNodeId);

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

      // Get neighbors for next hop
      const neighbors = await this.repo.getNeighborsForPropagation(tenantId, currentId);

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.id)) continue;
        visited.add(neighbor.id);

        // Calculate propagation weight:
        // decay^(distance+1) × relationship.confidence × temporalFactor
        const hopDistance = distance + 1;
        const decayWeight = Math.pow(this.decayFactor, hopDistance);
        const confidenceWeight = neighbor.relConfidence;
        const temporalWeight = this.calculateTemporalDecay(neighbor.relLastSeen);

        const propagatedScore = triggerScore * decayWeight * confidenceWeight * temporalWeight;

        // Only propagate if meaningful (above 1.0)
        if (propagatedScore >= 1.0) {
          queue.push([neighbor.id, hopDistance, propagatedScore]);
        }
      }
    }

    this.logger.info(
      { triggerNodeId, triggerScore, nodesVisited, nodesUpdated: updates.length, maxDepthReached },
      'Risk propagation complete',
    );

    return {
      triggerNodeId,
      nodesUpdated: updates.length,
      nodesVisited,
      maxDepthReached,
      updates,
    };
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
