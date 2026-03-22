import { createSession } from '../driver.js';
import type { RelationshipType } from '../schemas/graph.js';
import type { DirectionalEdge, NodeRelationshipsResponse } from '../schemas/search.js';

/**
 * Bidirectional Relationship Service — P1 #6.
 *
 * Queries relationships from either direction, labeling each as
 * 'inbound' or 'outbound' relative to the queried node.
 */
export class BidirectionalService {

  /** Gets all relationships for a node with direction labels. */
  async getNodeRelationships(
    tenantId: string,
    nodeId: string,
    typeFilter?: string,
    directionFilter?: 'inbound' | 'outbound' | 'both',
    limit = 100,
  ): Promise<NodeRelationshipsResponse> {
    const session = createSession();
    try {
      const result = await session.run(
        `MATCH (n {id: $nodeId, tenantId: $tenantId})-[r]-(m)
         WHERE m.tenantId = $tenantId
         RETURN type(r) AS relType, r.confidence AS confidence,
                r.source AS source, r.firstSeen AS firstSeen, r.lastSeen AS lastSeen,
                startNode(r).id AS fromId, endNode(r).id AS toId, properties(r) AS props
         LIMIT toInteger($limit)`,
        { nodeId, tenantId, limit: Number(limit) },
      );

      let relationships: DirectionalEdge[] = result.records.map((rec) => {
        const fromId = String(rec.get('fromId'));
        const toId = String(rec.get('toId'));
        const relType = String(rec.get('relType')) as RelationshipType;
        const direction: 'inbound' | 'outbound' = fromId === nodeId ? 'outbound' : 'inbound';
        const props = (rec.get('props') ?? {}) as Record<string, unknown>;

        return {
          id: `${fromId}-${relType}-${toId}`,
          type: relType,
          fromNodeId: fromId,
          toNodeId: toId,
          confidence: Number(rec.get('confidence') ?? 0.5),
          direction,
          source: (rec.get('source') as 'auto-detected' | 'analyst-confirmed') ?? 'auto-detected',
          properties: { ...props, firstSeen: rec.get('firstSeen'), lastSeen: rec.get('lastSeen') },
        };
      });

      // Apply type filter
      if (typeFilter) {
        relationships = relationships.filter((r) => r.type === typeFilter);
      }

      // Apply direction filter
      if (directionFilter && directionFilter !== 'both') {
        relationships = relationships.filter((r) => r.direction === directionFilter);
      }

      const inboundCount = relationships.filter((r) => r.direction === 'inbound').length;
      const outboundCount = relationships.filter((r) => r.direction === 'outbound').length;

      return { nodeId, relationships, inboundCount, outboundCount };
    } finally {
      await session.close();
    }
  }
}
