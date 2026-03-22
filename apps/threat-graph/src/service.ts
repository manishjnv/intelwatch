import { randomUUID } from 'crypto';
import { AppError } from '@etip/shared-utils';
import { GraphRepository } from './repository.js';
import { RiskPropagationEngine } from './propagation.js';
import {
  type CreateNodeInput, type CreateRelationshipInput, type NodeType,
  type GraphNodeResponse, type GraphEdgeResponse, type GraphSubgraphResponse,
  type PathResponse, type PathExplanationStep, type PropagationResult,
  type GraphStatsResponse, type RelationshipType,
  RELATIONSHIP_RULES,
} from './schemas/graph.js';
import type pino from 'pino';

/** High-level graph service — orchestrates repository + propagation. */
export class GraphService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly propagation: RiskPropagationEngine,
    private readonly logger: pino.Logger,
  ) {}

  /** Creates or upserts a graph node. */
  async createNode(tenantId: string, input: CreateNodeInput): Promise<GraphNodeResponse> {
    const id = (input.properties['id'] as string) ?? randomUUID();
    const props = { ...input.properties, id };

    this.logger.info({ tenantId, nodeType: input.nodeType, nodeId: id }, 'Upserting graph node');
    return this.repo.upsertNode(tenantId, input.nodeType, id, props);
  }

  /** Gets a node by ID. Throws 404 if not found. */
  async getNode(tenantId: string, nodeId: string): Promise<GraphNodeResponse> {
    const node = await this.repo.getNode(tenantId, nodeId);
    if (!node) throw new AppError(404, `Graph node not found: ${nodeId}`, 'NODE_NOT_FOUND');
    return node;
  }

  /** Deletes a node and all its relationships. */
  async deleteNode(tenantId: string, nodeId: string): Promise<void> {
    const deleted = await this.repo.deleteNode(tenantId, nodeId);
    if (!deleted) throw new AppError(404, `Graph node not found: ${nodeId}`, 'NODE_NOT_FOUND');
    this.logger.info({ tenantId, nodeId }, 'Deleted graph node');
  }

  /** Creates a relationship with validation of source→target type rules. */
  async createRelationship(tenantId: string, input: CreateRelationshipInput): Promise<GraphEdgeResponse> {
    // Validate relationship type rules
    const rule = RELATIONSHIP_RULES[input.type];
    if (rule) {
      const fromNode = await this.repo.getNode(tenantId, input.fromNodeId);
      const toNode = await this.repo.getNode(tenantId, input.toNodeId);
      if (!fromNode) throw new AppError(404, `Source node not found: ${input.fromNodeId}`, 'NODE_NOT_FOUND');
      if (!toNode) throw new AppError(404, `Target node not found: ${input.toNodeId}`, 'NODE_NOT_FOUND');

      if (!rule.from.includes(fromNode.nodeType)) {
        throw new AppError(400,
          `Relationship ${input.type} cannot start from ${fromNode.nodeType} (allowed: ${rule.from.join(', ')})`,
          'INVALID_RELATIONSHIP',
        );
      }
      if (!rule.to.includes(toNode.nodeType)) {
        throw new AppError(400,
          `Relationship ${input.type} cannot point to ${toNode.nodeType} (allowed: ${rule.to.join(', ')})`,
          'INVALID_RELATIONSHIP',
        );
      }
    }

    this.logger.info(
      { tenantId, from: input.fromNodeId, to: input.toNodeId, type: input.type, confidence: input.confidence },
      'Creating graph relationship',
    );

    return this.repo.createRelationship(
      tenantId,
      input.fromNodeId,
      input.toNodeId,
      input.type,
      input.confidence,
      input.properties ?? {},
    );
  }

  /** Gets N-hop neighbors of a node as a subgraph. */
  async getEntityNeighbors(
    tenantId: string,
    nodeId: string,
    hops: number,
    nodeTypesFilter: string | undefined,
    limit: number,
  ): Promise<GraphSubgraphResponse> {
    const nodeTypes = nodeTypesFilter ? nodeTypesFilter.split(',').map((t) => t.trim()) : null;
    // Include the center node in the result
    const centerNode = await this.repo.getNode(tenantId, nodeId);
    if (!centerNode) throw new AppError(404, `Graph node not found: ${nodeId}`, 'NODE_NOT_FOUND');

    const subgraph = await this.repo.getNHopNeighbors(tenantId, nodeId, hops, nodeTypes, limit);

    // Ensure center node is in the result
    const hasCenter = subgraph.nodes.some((n) => n.id === nodeId);
    if (!hasCenter) subgraph.nodes.unshift(centerNode);

    return subgraph;
  }

  /** Finds shortest path with human-readable explanation (P0 #4). */
  async findPath(tenantId: string, fromId: string, toId: string, maxDepth: number): Promise<PathResponse> {
    const result = await this.repo.findShortestPath(tenantId, fromId, toId, maxDepth);
    if (!result) {
      throw new AppError(404, 'No path found between the two entities', 'PATH_NOT_FOUND');
    }

    const steps: PathExplanationStep[] = [];
    for (let i = 0; i < result.pathNodes.length - 1; i++) {
      const fromNode = result.pathNodes[i]!;
      const toNode = result.pathNodes[i + 1]!;
      const edge = result.edges[i];
      steps.push({
        fromNode: { id: fromNode.id, type: fromNode.type as NodeType, label: fromNode.label },
        relationship: (edge?.type ?? 'USES') as RelationshipType,
        toNode: { id: toNode.id, type: toNode.type as NodeType, label: toNode.label },
      });
    }

    const explanation = this.buildPathExplanation(steps);

    return {
      path: { nodes: result.nodes, edges: result.edges },
      length: result.edges.length,
      explanation,
      steps,
    };
  }

  /** Gets the full cluster around an entity. */
  async getCluster(tenantId: string, centerId: string, depth: number, limit: number): Promise<GraphSubgraphResponse> {
    const centerNode = await this.repo.getNode(tenantId, centerId);
    if (!centerNode) throw new AppError(404, `Graph node not found: ${centerId}`, 'NODE_NOT_FOUND');
    return this.repo.getCluster(tenantId, centerId, depth, limit);
  }

  /** Triggers risk propagation from a node (P0 #1). */
  async triggerPropagation(tenantId: string, nodeId: string, maxDepth: number): Promise<PropagationResult> {
    const node = await this.repo.getNode(tenantId, nodeId);
    if (!node) throw new AppError(404, `Graph node not found: ${nodeId}`, 'NODE_NOT_FOUND');

    this.logger.info({ tenantId, nodeId, riskScore: node.riskScore, maxDepth }, 'Triggering risk propagation');
    return this.propagation.propagate(tenantId, nodeId, node.riskScore, maxDepth);
  }

  /** Gets graph statistics (P0 #5). */
  async getStats(tenantId: string): Promise<GraphStatsResponse> {
    return this.repo.getStats(tenantId);
  }

  /** Builds a human-readable path explanation (P0 #4). */
  private buildPathExplanation(steps: PathExplanationStep[]): string {
    if (steps.length === 0) return 'No connection found.';

    const descriptions = steps.map((step) => {
      const verb = RELATIONSHIP_VERBS[step.relationship] ?? 'is connected to';
      return `${step.fromNode.label} (${step.fromNode.type}) ${verb} ${step.toNode.label} (${step.toNode.type})`;
    });

    return descriptions.join(', which ');
  }
}

/** Human-readable verbs for each relationship type. */
const RELATIONSHIP_VERBS: Record<RelationshipType, string> = {
  USES: 'uses',
  CONDUCTS: 'conducts',
  TARGETS: 'targets',
  CONTROLS: 'controls',
  RESOLVES_TO: 'resolves to',
  HOSTED_ON: 'is hosted on',
  EXPLOITS: 'exploits',
  INDICATES: 'indicates',
  OBSERVED_IN: 'was observed in',
};
