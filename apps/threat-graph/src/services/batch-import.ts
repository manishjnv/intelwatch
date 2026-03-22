import { GraphService } from '../service.js';
import type { BatchImportInput, BatchImportResult } from '../schemas/operations.js';
import type pino from 'pino';

/**
 * Batch Import Service — #17.
 *
 * Processes arrays of nodes and relationships in a single API call.
 * Sequential processing (Neo4j community edition doesn't support multi-statement transactions).
 * Returns a summary with created/failed counts and error details.
 */
export class BatchImportService {
  constructor(
    private readonly service: GraphService,
    private readonly logger: pino.Logger,
  ) {}

  /** Imports a batch of nodes and relationships. */
  async importBatch(tenantId: string, input: BatchImportInput): Promise<BatchImportResult> {
    const result: BatchImportResult = {
      nodesCreated: 0,
      nodesUpdated: 0,
      nodesFailed: 0,
      relationshipsCreated: 0,
      relationshipsFailed: 0,
      nodeIds: [],
      errors: [],
    };

    // Phase 1: Create/upsert all nodes
    for (let i = 0; i < input.nodes.length; i++) {
      const nodeInput = input.nodes[i]!;
      try {
        const node = await this.service.createNode(tenantId, {
          nodeType: nodeInput.nodeType,
          properties: nodeInput.properties,
        });

        // Check if it was an upsert (node already had an id in properties)
        if (nodeInput.properties['id']) {
          result.nodesUpdated++;
        } else {
          result.nodesCreated++;
        }
        result.nodeIds.push(node.id);
      } catch (err) {
        result.nodesFailed++;
        result.errors.push({
          index: i,
          type: 'node',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Phase 2: Create relationships (after all nodes exist)
    for (let i = 0; i < input.relationships.length; i++) {
      const relInput = input.relationships[i]!;
      try {
        await this.service.createRelationship(tenantId, {
          fromNodeId: relInput.fromNodeId,
          toNodeId: relInput.toNodeId,
          type: relInput.type,
          confidence: relInput.confidence,
          source: relInput.source,
        });
        result.relationshipsCreated++;
      } catch (err) {
        result.relationshipsFailed++;
        result.errors.push({
          index: i,
          type: 'relationship',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.info(
      {
        tenantId,
        nodesCreated: result.nodesCreated,
        nodesUpdated: result.nodesUpdated,
        nodesFailed: result.nodesFailed,
        relationshipsCreated: result.relationshipsCreated,
        relationshipsFailed: result.relationshipsFailed,
      },
      'Batch import complete',
    );

    return result;
  }
}
