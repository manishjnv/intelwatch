import { createSession } from '../driver.js';
import type { NodeType, RelationshipType, GraphNodeResponse } from '../schemas/graph.js';
import type { ExpandedNeighbor, ExpandNodeResponse } from '../schemas/search.js';

/**
 * Expand Node Service — P2 #11.
 *
 * Lazy-loads only the immediate (1-hop) neighbors of a node
 * with offset-based pagination for frontend graph exploration.
 */
export class ExpandNodeService {

  /** Expands a node's 1-hop neighborhood with pagination. */
  async expand(
    tenantId: string,
    nodeId: string,
    limit: number,
    offset: number,
    nodeTypeFilter?: string,
  ): Promise<ExpandNodeResponse> {
    const session = createSession();
    try {
      const typeClause = nodeTypeFilter
        ? `AND labels(neighbor)[0] = $nodeType`
        : '';

      // Count total neighbors first
      const countResult = await session.run(
        `MATCH (n {id: $nodeId, tenantId: $tenantId})-[r]-(neighbor)
         WHERE neighbor.tenantId = $tenantId ${typeClause}
         RETURN count(DISTINCT neighbor) AS total`,
        { nodeId, tenantId, nodeType: nodeTypeFilter ?? '' },
      );
      const total = Number(countResult.records[0]?.get('total') ?? 0);

      // Fetch paginated neighbors
      const result = await session.run(
        `MATCH (n {id: $nodeId, tenantId: $tenantId})-[r]-(neighbor)
         WHERE neighbor.tenantId = $tenantId ${typeClause}
         WITH DISTINCT neighbor, r
         ORDER BY neighbor.riskScore DESC
         SKIP toInteger($offset)
         LIMIT toInteger($limit)
         RETURN properties(neighbor) AS props, labels(neighbor)[0] AS label,
                type(r) AS relType, r.confidence AS relConf,
                startNode(r).id AS fromId`,
        { nodeId, tenantId, nodeType: nodeTypeFilter ?? '', offset: Number(offset), limit: Number(limit) },
      );

      const neighbors: ExpandedNeighbor[] = result.records.map((rec) => {
        const props = (rec.get('props') ?? {}) as Record<string, unknown>;
        const label = String(rec.get('label'));
        const fromId = String(rec.get('fromId'));
        const direction: 'inbound' | 'outbound' = fromId === nodeId ? 'outbound' : 'inbound';

        const node: GraphNodeResponse = {
          id: String(props['id'] ?? ''),
          nodeType: label as NodeType,
          riskScore: Number(props['riskScore'] ?? 0),
          confidence: Number(props['confidence'] ?? 0),
          properties: props,
        };

        return {
          node,
          relationship: {
            type: String(rec.get('relType')) as RelationshipType,
            confidence: Number(rec.get('relConf') ?? 0.5),
            direction,
          },
        };
      });

      return {
        nodeId,
        neighbors,
        total,
        hasMore: offset + limit < total,
      };
    } finally {
      await session.close();
    }
  }
}
