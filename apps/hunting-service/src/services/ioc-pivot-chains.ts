import { AppError } from '@etip/shared-utils';
import { signServiceToken } from '@etip/shared-auth';
import type {
  PivotRequest,
  PivotNode,
  PivotRelationship,
  PivotChainResult,
  EntityType,
} from '../schemas/hunting.js';
import { getLogger } from '../logger.js';

export interface IOCPivotChainsConfig {
  graphServiceUrl: string;
  maxHops: number;
  maxResults: number;
}

/** Minimal graph neighbor response shape. */
interface GraphNeighborResponse {
  data: Array<{
    id: string;
    type: string;
    value?: string;
    properties?: Record<string, unknown>;
    riskScore?: number;
    relationship?: {
      type: string;
      weight?: number;
    };
  }>;
  total: number;
}

/**
 * #3 IOC Pivot Chains — multi-hop entity traversal via graph-service HTTP API.
 *
 * Builds investigation chains by querying the graph service for neighbors at each depth,
 * collecting the full path from root entity to N-hop relationships.
 * Uses service JWT for authenticated inter-service calls (DECISION-022 pattern).
 */
export class IOCPivotChains {
  private readonly config: IOCPivotChainsConfig;

  constructor(config: IOCPivotChainsConfig) {
    this.config = config;
  }

  /** Execute a multi-hop pivot from a root entity. */
  async executePivot(
    tenantId: string,
    request: PivotRequest,
  ): Promise<PivotChainResult> {
    const logger = getLogger();
    const maxHops = Math.min(request.maxHops, this.config.maxHops);
    const maxResults = Math.min(request.maxResults, this.config.maxResults);

    const rootNode: PivotNode = {
      id: `root-${request.entityValue}`,
      type: request.entityType,
      value: request.entityValue,
      riskScore: 0,
      depth: 0,
      relationships: [],
    };

    const allNodes: Map<string, PivotNode> = new Map();
    allNodes.set(rootNode.id, rootNode);

    // BFS: process each depth level
    let currentLevel = [rootNode];
    let maxDepthReached = 0;

    for (let depth = 1; depth <= maxHops; depth++) {
      if (allNodes.size >= maxResults) break;

      const nextLevel: PivotNode[] = [];

      for (const parentNode of currentLevel) {
        if (allNodes.size >= maxResults) break;

        try {
          const neighbors = await this.fetchNeighbors(
            tenantId,
            parentNode.type,
            parentNode.value,
            request.filterTypes,
          );

          for (const neighbor of neighbors) {
            if (allNodes.size >= maxResults) break;

            const nodeKey = `${neighbor.type}-${neighbor.value}`;
            if (allNodes.has(nodeKey)) {
              // Already visited — just add relationship to parent
              const existingRel: PivotRelationship = {
                type: neighbor.relationshipType,
                targetId: nodeKey,
                targetType: neighbor.type as EntityType,
                targetValue: neighbor.value,
                weight: neighbor.weight,
              };
              parentNode.relationships.push(existingRel);
              continue;
            }

            const childNode: PivotNode = {
              id: nodeKey,
              type: neighbor.type as EntityType,
              value: neighbor.value,
              riskScore: neighbor.riskScore,
              depth,
              parentId: parentNode.id,
              relationships: [],
            };

            allNodes.set(nodeKey, childNode);
            nextLevel.push(childNode);

            const rel: PivotRelationship = {
              type: neighbor.relationshipType,
              targetId: nodeKey,
              targetType: neighbor.type as EntityType,
              targetValue: neighbor.value,
              weight: neighbor.weight,
            };
            parentNode.relationships.push(rel);
          }
        } catch (err) {
          logger.warn(
            { err, entityType: parentNode.type, entityValue: parentNode.value, depth },
            'Failed to fetch neighbors for pivot',
          );
        }
      }

      if (nextLevel.length > 0) {
        maxDepthReached = depth;
        currentLevel = nextLevel;
      } else {
        break;
      }
    }

    let totalRelationships = 0;
    for (const node of allNodes.values()) {
      totalRelationships += node.relationships.length;
    }

    return {
      rootEntity: { type: request.entityType, value: request.entityValue },
      nodes: Array.from(allNodes.values()),
      totalRelationships,
      maxDepthReached,
      truncated: allNodes.size >= maxResults,
    };
  }

  /** Fetch neighbors of an entity from the graph service. */
  private async fetchNeighbors(
    tenantId: string,
    entityType: EntityType,
    entityValue: string,
    filterTypes?: EntityType[],
  ): Promise<Array<{
    type: string;
    value: string;
    riskScore: number;
    relationshipType: string;
    weight: number;
  }>> {
    const token = signServiceToken('hunting-service', 'graph-service');
    const params = new URLSearchParams({
      type: entityType,
      value: entityValue,
      limit: '50',
    });
    if (filterTypes && filterTypes.length > 0) {
      params.set('filterTypes', filterTypes.join(','));
    }

    const url = `${this.config.graphServiceUrl}/api/v1/graph/neighbors?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': token,
        'x-tenant-id': tenantId,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 404) return [];
      throw new AppError(
        502,
        `Graph service returned ${response.status}`,
        'GRAPH_SERVICE_ERROR',
      );
    }

    const body = (await response.json()) as GraphNeighborResponse;

    return body.data.map((n) => ({
      type: n.type,
      value: n.value ?? n.id,
      riskScore: n.riskScore ?? 0,
      relationshipType: n.relationship?.type ?? 'RELATED_TO',
      weight: n.relationship?.weight ?? 0.5,
    }));
  }

  /** Build a linear chain summary from pivot results (root → highest-risk path). */
  extractHighRiskPath(result: PivotChainResult): PivotNode[] {
    if (result.nodes.length <= 1) return result.nodes;

    const nodeMap = new Map<string, PivotNode>();
    for (const node of result.nodes) {
      nodeMap.set(node.id, node);
    }

    // Find the leaf with highest risk score
    let highestRiskLeaf: PivotNode | null = null;
    for (const node of result.nodes) {
      if (node.relationships.length === 0 || node.depth === result.maxDepthReached) {
        if (!highestRiskLeaf || node.riskScore > highestRiskLeaf.riskScore) {
          highestRiskLeaf = node;
        }
      }
    }

    if (!highestRiskLeaf) return [result.nodes[0]!];

    // Walk back to root
    const path: PivotNode[] = [];
    let current: PivotNode | undefined = highestRiskLeaf;
    while (current) {
      path.unshift(current);
      current = current.parentId ? nodeMap.get(current.parentId) : undefined;
    }

    return path;
  }
}
