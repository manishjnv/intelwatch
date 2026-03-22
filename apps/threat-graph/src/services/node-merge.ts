import { randomUUID } from 'crypto';
import { createSession } from '../driver.js';
import { AppError } from '@etip/shared-utils';
import { GraphRepository } from '../repository.js';
import { GraphService } from '../service.js';
import type { MergeNodesInput, MergeResult, SplitNodeInput, SplitResult } from '../schemas/operations.js';
import type pino from 'pino';

/**
 * Node Merge/Split Service — #16.
 *
 * Merge: Transfer all relationships from source to target, merge properties, delete source.
 * Split: Clone a node with a subset of relationships moved to the clone.
 */
export class NodeMergeService {
  constructor(
    private readonly repo: GraphRepository,
    private readonly service: GraphService,
    private readonly logger: pino.Logger,
  ) {}

  /** Merges source node into target node. Target node survives. */
  async mergeNodes(tenantId: string, input: MergeNodesInput): Promise<MergeResult> {
    const { sourceNodeId, targetNodeId, preferTarget, triggerPropagation } = input;

    if (sourceNodeId === targetNodeId) {
      throw new AppError(400, 'Cannot merge a node with itself', 'MERGE_SELF');
    }

    const sourceNode = await this.repo.getNode(tenantId, sourceNodeId);
    const targetNode = await this.repo.getNode(tenantId, targetNodeId);
    if (!sourceNode) throw new AppError(404, `Source node not found: ${sourceNodeId}`, 'NODE_NOT_FOUND');
    if (!targetNode) throw new AppError(404, `Target node not found: ${targetNodeId}`, 'NODE_NOT_FOUND');

    if (sourceNode.nodeType !== targetNode.nodeType) {
      throw new AppError(400, `Cannot merge different node types: ${sourceNode.nodeType} and ${targetNode.nodeType}`, 'MERGE_TYPE_MISMATCH');
    }

    const session = createSession();
    try {
      // 1. Transfer all relationships from source to target
      const transferResult = await session.run(
        `MATCH (source {id: $sourceId, tenantId: $tenantId})-[r]-(other)
         WHERE other.id <> $targetId
         WITH source, r, other, type(r) AS relType,
              startNode(r).id AS fromId, endNode(r).id AS toId,
              properties(r) AS rProps
         RETURN relType, fromId, toId, rProps`,
        { sourceId: sourceNodeId, targetId: targetNodeId, tenantId },
      );

      let relsTransferred = 0;
      for (const rec of transferResult.records) {
        const relType = String(rec.get('relType'));
        const fromId = String(rec.get('fromId'));
        const toId = String(rec.get('toId'));
        const rProps = (rec.get('rProps') ?? {}) as Record<string, unknown>;

        const newFrom = fromId === sourceNodeId ? targetNodeId : fromId;
        const newTo = toId === sourceNodeId ? targetNodeId : toId;

        // Avoid self-loops
        if (newFrom === newTo) continue;

        await session.run(
          `MATCH (a {id: $fromId, tenantId: $tenantId}), (b {id: $toId, tenantId: $tenantId})
           MERGE (a)-[r:${relType}]->(b)
           ON CREATE SET r = $props
           ON MATCH SET r += $props`,
          { fromId: newFrom, toId: newTo, tenantId, props: rProps },
        );
        relsTransferred++;
      }

      // 2. Merge properties: target wins on conflicts, source fills gaps
      const mergedProps: string[] = [];
      for (const [key] of Object.entries(sourceNode.properties)) {
        if (key === 'id' || key === 'tenantId' || key === 'nodeType') continue;
        const targetHas = targetNode.properties[key] !== undefined && targetNode.properties[key] !== null;

        if (!targetHas || !preferTarget) {
          mergedProps.push(key);
        }
      }

      if (mergedProps.length > 0) {
        const propsToMerge: Record<string, unknown> = {};
        for (const key of mergedProps) {
          propsToMerge[key] = sourceNode.properties[key];
        }
        await session.run(
          `MATCH (n {id: $targetId, tenantId: $tenantId}) SET n += $props`,
          { targetId: targetNodeId, tenantId, props: propsToMerge },
        );
      }

      // 3. Update risk score: take max of both
      const maxRisk = Math.max(sourceNode.riskScore, targetNode.riskScore);
      if (maxRisk > targetNode.riskScore) {
        await this.repo.updateRiskScore(tenantId, targetNodeId, maxRisk);
      }

      // 4. Delete source node
      await this.repo.deleteNode(tenantId, sourceNodeId);

      this.logger.info(
        { tenantId, sourceNodeId, targetNodeId, relsTransferred, mergedProps },
        'Nodes merged successfully',
      );

      // 5. Optional: trigger re-propagation
      let propagationTriggered = false;
      if (triggerPropagation && maxRisk > 0) {
        await this.service.triggerPropagation(tenantId, targetNodeId, 3);
        propagationTriggered = true;
      }

      return {
        mergedNodeId: targetNodeId,
        deletedNodeId: sourceNodeId,
        relationshipsTransferred: relsTransferred,
        propertiesMerged: mergedProps,
        propagationTriggered,
      };
    } finally {
      await session.close();
    }
  }

  /** Splits a node by cloning it and moving specified relationships to the clone. */
  async splitNode(tenantId: string, input: SplitNodeInput): Promise<SplitResult> {
    const originalNode = await this.repo.getNode(tenantId, input.sourceNodeId);
    if (!originalNode) {
      throw new AppError(404, `Source node not found: ${input.sourceNodeId}`, 'NODE_NOT_FOUND');
    }

    // 1. Create clone with provided properties
    const newId = randomUUID();
    const cloneProps = { ...input.newNodeProperties, id: newId };
    await this.repo.upsertNode(tenantId, originalNode.nodeType, newId, cloneProps);

    const session = createSession();
    try {
      // 2. Move specified relationships to clone
      let moved = 0;
      for (const rel of input.relationshipsToMove) {
        const isSource = rel.fromNodeId === input.sourceNodeId;
        const isTarget = rel.toNodeId === input.sourceNodeId;
        if (!isSource && !isTarget) continue;

        // Delete old relationship
        await session.run(
          `MATCH (a {id: $fromId, tenantId: $tenantId})-[r:${rel.type}]->(b {id: $toId, tenantId: $tenantId})
           DELETE r`,
          { fromId: rel.fromNodeId, toId: rel.toNodeId, tenantId },
        );

        // Create new relationship pointing to/from clone
        const newFrom = isSource ? newId : rel.fromNodeId;
        const newTo = isTarget ? newId : rel.toNodeId;
        await session.run(
          `MATCH (a {id: $fromId, tenantId: $tenantId}), (b {id: $toId, tenantId: $tenantId})
           CREATE (a)-[r:${rel.type} {confidence: 0.5, firstSeen: $now, lastSeen: $now, source: 'analyst-confirmed'}]->(b)`,
          { fromId: newFrom, toId: newTo, tenantId, now: new Date().toISOString() },
        );
        moved++;
      }

      this.logger.info(
        { tenantId, sourceNodeId: input.sourceNodeId, newNodeId: newId, moved },
        'Node split successfully',
      );

      return {
        originalNodeId: input.sourceNodeId,
        newNodeId: newId,
        relationshipsMoved: moved,
      };
    } finally {
      await session.close();
    }
  }
}
