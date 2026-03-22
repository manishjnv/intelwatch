import { GraphRepository } from '../repository.js';
import { RELATIONSHIP_TYPE_WEIGHTS, type RelationshipType } from '../schemas/graph.js';
import type { ImpactedNode, ImpactRadiusResponse } from '../schemas/search.js';
import { RiskPropagationEngine } from '../propagation.js';

/**
 * Impact Radius Calculator — P1 #8.
 *
 * Simulates risk propagation as a dry-run (NO writes) to calculate the blast
 * radius before taking action on a node. Uses the same algorithm as the real
 * propagation engine but only reads scores without updating them.
 */
export class ImpactRadiusService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly propagation: RiskPropagationEngine,
  ) {}

  /** Calculates impact radius without modifying any scores. */
  async calculate(
    tenantId: string,
    nodeId: string,
    depth: number,
  ): Promise<ImpactRadiusResponse> {
    const triggerScore = await this.repo.getNodeRiskScore(tenantId, nodeId);
    const visited = new Set<string>();
    const affectedNodes: ImpactedNode[] = [];

    // BFS dry-run: [nodeId, distance, parentScore]
    const queue: Array<[string, number, number]> = [[nodeId, 0, triggerScore]];
    visited.add(nodeId);

    while (queue.length > 0) {
      const [currentId, distance, parentScore] = queue.shift()!;

      if (distance > depth) continue;

      // At distance > 0, calculate projected impact
      if (distance > 0) {
        const currentScore = await this.repo.getNodeRiskScore(tenantId, currentId);
        if (parentScore > currentScore) {
          const projectedScore = Math.min(100, Math.round(parentScore * 100) / 100);
          const node = await this.repo.getNode(tenantId, currentId);

          affectedNodes.push({
            id: currentId,
            nodeType: node?.nodeType ?? 'IOC',
            label: String(node?.properties?.['name'] ?? node?.properties?.['value'] ?? node?.properties?.['cveId'] ?? currentId),
            currentScore,
            projectedScore,
            scoreDelta: Math.round((projectedScore - currentScore) * 100) / 100,
            distance,
          });
        }
      }

      if (distance >= depth) continue;

      const neighbors = await this.repo.getNeighborsForPropagation(tenantId, currentId);

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.id)) continue;
        visited.add(neighbor.id);

        const hopDistance = distance + 1;
        const decayWeight = Math.pow(0.7, hopDistance); // Use standard decay
        const confidenceWeight = neighbor.relConfidence;
        const temporalWeight = this.propagation.calculateTemporalDecay(neighbor.relLastSeen);
        const relTypeWeight = RELATIONSHIP_TYPE_WEIGHTS[neighbor.relType as RelationshipType] ?? 0.7;

        const propagatedScore = triggerScore * decayWeight * confidenceWeight * temporalWeight * relTypeWeight;

        if (propagatedScore >= 1.0) {
          queue.push([neighbor.id, hopDistance, propagatedScore]);
        }
      }
    }

    // Sort by score delta descending
    affectedNodes.sort((a, b) => b.scoreDelta - a.scoreDelta);

    const maxScoreIncrease = affectedNodes.length > 0
      ? Math.max(...affectedNodes.map((n) => n.scoreDelta))
      : 0;

    return {
      triggerNodeId: nodeId,
      triggerScore,
      depth,
      affectedNodes,
      totalAffected: affectedNodes.length,
      maxScoreIncrease: Math.round(maxScoreIncrease * 100) / 100,
      blastRadius: visited.size - 1, // Exclude trigger node
    };
  }
}
