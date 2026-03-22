import { createSession } from '../driver.js';
import type { GraphNodeResponse, GraphEdgeResponse, NodeType, RelationshipType } from '../schemas/graph.js';
import type { GraphDiffResponse } from '../schemas/search.js';

/**
 * Graph Diff / Timeline Service — P1 #10.
 *
 * Shows how a node's neighborhood changed over the last N days.
 * - "Added": nodes/edges with firstSeen >= cutoff date
 * - "Stale": nodes/edges with lastSeen < cutoff date (potentially outdated)
 */
export class GraphDiffService {

  /** Gets neighborhood changes for a node over the last N days. */
  async getTimeline(
    tenantId: string,
    nodeId: string,
    days: number,
  ): Promise<GraphDiffResponse> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const cutoffISO = cutoff.toISOString();
    const nowISO = now.toISOString();

    const session = createSession();
    try {
      // Find neighbors and their relationships within the time window
      const result = await session.run(
        `MATCH (center {id: $nodeId, tenantId: $tenantId})-[r]-(neighbor)
         WHERE neighbor.tenantId = $tenantId
         RETURN neighbor.id AS nId, labels(neighbor)[0] AS nType,
                coalesce(neighbor.name, neighbor.value, neighbor.cveId, neighbor.id) AS nLabel,
                neighbor.riskScore AS nRisk, neighbor.confidence AS nConf,
                neighbor.firstSeen AS nFirstSeen, neighbor.lastSeen AS nLastSeen,
                properties(neighbor) AS nProps,
                type(r) AS rType, r.confidence AS rConf,
                startNode(r).id AS rFrom, endNode(r).id AS rTo,
                r.firstSeen AS rFirstSeen, r.lastSeen AS rLastSeen`,
        { nodeId, tenantId },
      );

      const addedNodes: GraphNodeResponse[] = [];
      const staleNodes: GraphNodeResponse[] = [];
      const addedEdges: GraphEdgeResponse[] = [];
      const staleEdges: GraphEdgeResponse[] = [];
      const seenNodeIds = new Set<string>();
      const seenEdgeIds = new Set<string>();

      for (const rec of result.records) {
        const nId = String(rec.get('nId'));
        const nType = String(rec.get('nType')) as NodeType;
        const nFirstSeen = rec.get('nFirstSeen') as string | null;
        const nLastSeen = rec.get('nLastSeen') as string | null;
        const nProps = (rec.get('nProps') ?? {}) as Record<string, unknown>;

        const node: GraphNodeResponse = {
          id: nId,
          nodeType: nType,
          riskScore: Number(rec.get('nRisk') ?? 0),
          confidence: Number(rec.get('nConf') ?? 0),
          properties: nProps,
        };

        // Classify node
        if (!seenNodeIds.has(nId)) {
          seenNodeIds.add(nId);
          if (nFirstSeen && nFirstSeen >= cutoffISO) {
            addedNodes.push(node);
          } else if (nLastSeen && nLastSeen < cutoffISO) {
            staleNodes.push(node);
          }
        }

        // Classify edge
        const rFrom = String(rec.get('rFrom'));
        const rTo = String(rec.get('rTo'));
        const rType = String(rec.get('rType')) as RelationshipType;
        const edgeId = `${rFrom}-${rType}-${rTo}`;
        const rFirstSeen = rec.get('rFirstSeen') as string | null;
        const rLastSeen = rec.get('rLastSeen') as string | null;

        if (!seenEdgeIds.has(edgeId)) {
          seenEdgeIds.add(edgeId);
          const edge: GraphEdgeResponse = {
            id: edgeId,
            type: rType,
            fromNodeId: rFrom,
            toNodeId: rTo,
            confidence: Number(rec.get('rConf') ?? 0.5),
            properties: { firstSeen: rFirstSeen, lastSeen: rLastSeen },
          };

          if (rFirstSeen && rFirstSeen >= cutoffISO) {
            addedEdges.push(edge);
          } else if (rLastSeen && rLastSeen < cutoffISO) {
            staleEdges.push(edge);
          }
        }
      }

      return {
        nodeId,
        period: { from: cutoffISO, to: nowISO },
        added: { nodes: addedNodes, edges: addedEdges },
        stale: { nodes: staleNodes, edges: staleEdges },
        summary: {
          nodesAdded: addedNodes.length,
          nodesStale: staleNodes.length,
          edgesAdded: addedEdges.length,
          edgesStale: staleEdges.length,
        },
      };
    } finally {
      await session.close();
    }
  }
}
