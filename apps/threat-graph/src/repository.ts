import type { Session, Record as Neo4jRecord } from 'neo4j-driver';
import { createSession } from './driver.js';
import { AppError } from '@etip/shared-utils';
import type {
  NodeType, RelationshipType, GraphNodeResponse, GraphEdgeResponse,
  GraphSubgraphResponse, GraphStatsResponse,
} from './schemas/graph.js';

/** Extracts a node response from a Neo4j record. */
function toNodeResponse(record: Record<string, unknown>): GraphNodeResponse {
  const props = { ...(record as Record<string, unknown>) };
  const id = String(props['id'] ?? '');
  const nodeType = String(props['nodeType'] ?? 'IOC') as NodeType;
  const riskScore = Number(props['riskScore'] ?? 0);
  const confidence = Number(props['confidence'] ?? 0);
  delete props['id'];
  delete props['nodeType'];
  delete props['riskScore'];
  delete props['confidence'];
  delete props['tenantId'];
  return { id, nodeType, riskScore, confidence, properties: props };
}


/** Neo4j repository — all graph database operations. */
export class GraphRepository {
  /** Creates or updates a node. Returns the upserted node. */
  async upsertNode(
    tenantId: string,
    nodeType: NodeType,
    id: string,
    properties: Record<string, unknown>,
  ): Promise<GraphNodeResponse> {
    const session = createSession();
    try {
      const now = new Date().toISOString();
      const result = await session.run(
        `MERGE (n:${nodeType} {id: $id, tenantId: $tenantId})
         ON CREATE SET n += $props, n.nodeType = $nodeType, n.firstSeen = $now, n.lastSeen = $now
         ON MATCH SET n += $props, n.lastSeen = $now
         RETURN properties(n) AS node`,
        { id, tenantId, nodeType, props: properties, now },
      );
      if (result.records.length === 0) {
        throw new AppError(500, 'Failed to upsert graph node', 'GRAPH_UPSERT_FAILED');
      }
      return toNodeResponse(result.records[0]!.get('node') as Record<string, unknown>);
    } finally {
      await session.close();
    }
  }

  /** Gets a node by ID, filtered by tenantId. */
  async getNode(tenantId: string, nodeId: string): Promise<GraphNodeResponse | null> {
    const session = createSession();
    try {
      const result = await session.run(
        `MATCH (n {id: $nodeId, tenantId: $tenantId})
         RETURN properties(n) AS node, labels(n)[0] AS label`,
        { nodeId, tenantId },
      );
      if (result.records.length === 0) return null;
      const record = result.records[0]!;
      const node = record.get('node') as Record<string, unknown>;
      node['nodeType'] = record.get('label');
      return toNodeResponse(node);
    } finally {
      await session.close();
    }
  }

  /** Deletes a node and all its relationships. */
  async deleteNode(tenantId: string, nodeId: string): Promise<boolean> {
    const session = createSession();
    try {
      const result = await session.run(
        `MATCH (n {id: $nodeId, tenantId: $tenantId})
         DETACH DELETE n
         RETURN count(n) AS deleted`,
        { nodeId, tenantId },
      );
      const deleted = result.records[0]?.get('deleted');
      return Number(deleted) > 0;
    } finally {
      await session.close();
    }
  }

  /** Creates a relationship between two nodes. */
  async createRelationship(
    tenantId: string,
    fromNodeId: string,
    toNodeId: string,
    type: RelationshipType,
    confidence: number,
    properties: Record<string, unknown> = {},
  ): Promise<GraphEdgeResponse> {
    const session = createSession();
    try {
      const now = new Date().toISOString();
      const result = await session.run(
        `MATCH (a {id: $fromNodeId, tenantId: $tenantId})
         MATCH (b {id: $toNodeId, tenantId: $tenantId})
         MERGE (a)-[r:${type}]->(b)
         ON CREATE SET r.confidence = $confidence, r.firstSeen = $now, r.lastSeen = $now, r += $props
         ON MATCH SET r.confidence = $confidence, r.lastSeen = $now, r += $props
         RETURN type(r) AS relType, r.confidence AS confidence,
                a.id AS fromNodeId, b.id AS toNodeId,
                r.firstSeen AS firstSeen, r.lastSeen AS lastSeen`,
        { fromNodeId, toNodeId, tenantId, confidence, props: properties, now },
      );
      if (result.records.length === 0) {
        throw new AppError(404, 'One or both nodes not found in tenant scope', 'NODES_NOT_FOUND');
      }
      const rec = result.records[0]!;
      return {
        id: `${fromNodeId}-${type}-${toNodeId}`,
        type: rec.get('relType') as RelationshipType,
        fromNodeId: String(rec.get('fromNodeId')),
        toNodeId: String(rec.get('toNodeId')),
        confidence: Number(rec.get('confidence')),
        properties: { ...properties, firstSeen: rec.get('firstSeen'), lastSeen: rec.get('lastSeen') },
      };
    } finally {
      await session.close();
    }
  }

  /** Returns N-hop neighbors of a node as a subgraph. */
  async getNHopNeighbors(
    tenantId: string,
    nodeId: string,
    hops: number,
    nodeTypeFilter: string[] | null,
    limit: number,
  ): Promise<GraphSubgraphResponse> {
    const session = createSession();
    try {
      const typeFilter = nodeTypeFilter && nodeTypeFilter.length > 0
        ? `AND all(n2 IN nodes(p) WHERE n2.tenantId = $tenantId AND labels(n2)[0] IN $nodeTypes)`
        : `AND all(n2 IN nodes(p) WHERE n2.tenantId = $tenantId)`;

      const result = await session.run(
        `MATCH (start {id: $nodeId, tenantId: $tenantId})
         MATCH p = (start)-[*1..${hops}]-(neighbor)
         WHERE neighbor.tenantId = $tenantId ${typeFilter}
         WITH DISTINCT neighbor, relationships(p) AS rels
         LIMIT toInteger($limit)
         UNWIND rels AS r
         WITH collect(DISTINCT {
           node: properties(neighbor), label: labels(neighbor)[0]
         }) AS nodeData,
         collect(DISTINCT {
           type: type(r), fromId: startNode(r).id, toId: endNode(r).id,
           confidence: r.confidence, firstSeen: r.firstSeen, lastSeen: r.lastSeen
         }) AS edgeData
         RETURN nodeData, edgeData`,
        { nodeId, tenantId, nodeTypes: nodeTypeFilter ?? [], limit: Number(limit) },
      );

      return this.parseSubgraphResult(session, result.records, tenantId, nodeId);
    } finally {
      await session.close();
    }
  }

  /** Finds shortest path between two nodes (P0 #4: with explanation). */
  async findShortestPath(
    tenantId: string,
    fromId: string,
    toId: string,
    maxDepth: number,
  ): Promise<{ nodes: GraphNodeResponse[]; edges: GraphEdgeResponse[]; pathNodes: Array<{ id: string; type: string; label: string }> } | null> {
    const session = createSession();
    try {
      const result = await session.run(
        `MATCH (a {id: $fromId, tenantId: $tenantId}),
               (b {id: $toId, tenantId: $tenantId})
         MATCH path = shortestPath((a)-[*..${maxDepth}]-(b))
         WHERE all(n IN nodes(path) WHERE n.tenantId = $tenantId)
         WITH path, nodes(path) AS ns, relationships(path) AS rs
         RETURN
           [n IN ns | {props: properties(n), label: labels(n)[0]}] AS pathNodes,
           [r IN rs | {type: type(r), fromId: startNode(r).id, toId: endNode(r).id,
                       confidence: r.confidence, firstSeen: r.firstSeen, lastSeen: r.lastSeen}] AS pathEdges`,
        { fromId, toId, tenantId },
      );

      if (result.records.length === 0) return null;

      const record = result.records[0]!;
      const rawNodes = record.get('pathNodes') as Array<{ props: Record<string, unknown>; label: string }>;
      const rawEdges = record.get('pathEdges') as Array<Record<string, unknown>>;

      const nodes = rawNodes.map((rn) => {
        const p = { ...rn.props, nodeType: rn.label };
        return toNodeResponse(p);
      });

      const edges = rawEdges.map((re) => ({
        id: `${re['fromId']}-${re['type']}-${re['toId']}`,
        type: String(re['type']) as RelationshipType,
        fromNodeId: String(re['fromId']),
        toNodeId: String(re['toId']),
        confidence: Number(re['confidence'] ?? 0.5),
        properties: { firstSeen: re['firstSeen'], lastSeen: re['lastSeen'] },
      }));

      const pathNodeSummaries = rawNodes.map((rn) => ({
        id: String(rn.props['id']),
        type: rn.label,
        label: String(rn.props['name'] ?? rn.props['value'] ?? rn.props['cveId'] ?? rn.props['id']),
      }));

      return { nodes, edges, pathNodes: pathNodeSummaries };
    } finally {
      await session.close();
    }
  }

  /** Returns the full cluster around an entity (actor/campaign). */
  async getCluster(
    tenantId: string,
    centerId: string,
    depth: number,
    limit: number,
  ): Promise<GraphSubgraphResponse> {
    const session = createSession();
    try {
      const result = await session.run(
        `MATCH (center {id: $centerId, tenantId: $tenantId})
         CALL apoc.path.subgraphAll(center, {maxLevel: toInteger($depth),
              whitelistNodes: null, blacklistNodes: null,
              relationshipFilter: null, labelFilter: null})
         YIELD nodes, relationships
         WITH [n IN nodes WHERE n.tenantId = $tenantId | {props: properties(n), label: labels(n)[0]}] AS ns,
              [r IN relationships | {type: type(r), fromId: startNode(r).id, toId: endNode(r).id,
                                     confidence: r.confidence, firstSeen: r.firstSeen, lastSeen: r.lastSeen}] AS rs
         RETURN ns[0..toInteger($limit)] AS nodeData, rs AS edgeData`,
        { centerId, tenantId, depth: Number(depth), limit: Number(limit) },
      );

      if (result.records.length === 0) return { nodes: [], edges: [] };

      const record = result.records[0]!;
      const rawNodes = (record.get('nodeData') ?? []) as Array<{ props: Record<string, unknown>; label: string }>;
      const rawEdges = (record.get('edgeData') ?? []) as Array<Record<string, unknown>>;

      return {
        nodes: rawNodes.map((rn) => toNodeResponse({ ...rn.props, nodeType: rn.label })),
        edges: rawEdges.map((re) => ({
          id: `${re['fromId']}-${re['type']}-${re['toId']}`,
          type: String(re['type']) as RelationshipType,
          fromNodeId: String(re['fromId']),
          toNodeId: String(re['toId']),
          confidence: Number(re['confidence'] ?? 0.5),
          properties: { firstSeen: re['firstSeen'], lastSeen: re['lastSeen'] },
        })),
      };
    } finally {
      await session.close();
    }
  }

  /** Gets graph statistics (P0 #5). */
  async getStats(tenantId: string): Promise<GraphStatsResponse> {
    const session = createSession();
    try {
      const nodeResult = await session.run(
        `MATCH (n {tenantId: $tenantId})
         WITH labels(n)[0] AS nodeType, count(n) AS cnt
         RETURN nodeType, cnt
         ORDER BY cnt DESC`,
        { tenantId },
      );

      const edgeResult = await session.run(
        `MATCH (a {tenantId: $tenantId})-[r]->(b {tenantId: $tenantId})
         WITH type(r) AS relType, count(r) AS cnt
         RETURN relType, cnt
         ORDER BY cnt DESC`,
        { tenantId },
      );

      const connResult = await session.run(
        `MATCH (n {tenantId: $tenantId})
         OPTIONAL MATCH (n)-[r]-()
         WITH n, labels(n)[0] AS label, count(r) AS connections
         ORDER BY connections DESC
         WITH collect({id: n.id, type: label, label: coalesce(n.name, n.value, n.cveId, n.id), connections: connections}) AS all
         WITH all,
              [x IN all WHERE x.connections = 0] AS isolated,
              [x IN all[0..10]] AS top10
         RETURN top10, size(isolated) AS isolatedCount, size(all) AS totalNodes,
                reduce(s = 0, x IN all | s + x.connections) AS totalConnections`,
        { tenantId },
      );

      const nodesByType: Record<string, number> = {};
      let totalNodes = 0;
      for (const rec of nodeResult.records) {
        const t = String(rec.get('nodeType'));
        const c = Number(rec.get('cnt'));
        nodesByType[t] = c;
        totalNodes += c;
      }

      const edgesByType: Record<string, number> = {};
      let totalEdges = 0;
      for (const rec of edgeResult.records) {
        const t = String(rec.get('relType'));
        const c = Number(rec.get('cnt'));
        edgesByType[t] = c;
        totalEdges += c;
      }

      const connRecord = connResult.records[0];
      const top10 = (connRecord?.get('top10') ?? []) as Array<{ id: string; type: string; label: string; connections: number }>;
      const isolatedNodes = Number(connRecord?.get('isolatedCount') ?? 0);
      const totalConns = Number(connRecord?.get('totalConnections') ?? 0);
      const nodeCount = Number(connRecord?.get('totalNodes') ?? totalNodes);

      return {
        totalNodes,
        totalEdges,
        nodesByType,
        edgesByType,
        mostConnected: top10.map((t) => ({
          id: String(t.id),
          type: String(t.type) as NodeType,
          label: String(t.label),
          connections: Number(t.connections),
        })),
        isolatedNodes,
        avgConnections: nodeCount > 0 ? Math.round((totalConns / nodeCount) * 100) / 100 : 0,
      };
    } finally {
      await session.close();
    }
  }

  /** Gets neighbors with risk scores for propagation (internal use). */
  async getNeighborsForPropagation(
    tenantId: string,
    nodeId: string,
  ): Promise<Array<{ id: string; riskScore: number; relConfidence: number; relLastSeen: string | null }>> {
    const session = createSession();
    try {
      const result = await session.run(
        `MATCH (source {id: $nodeId, tenantId: $tenantId})-[r]-(neighbor)
         WHERE neighbor.tenantId = $tenantId
         RETURN neighbor.id AS id, neighbor.riskScore AS riskScore,
                r.confidence AS relConfidence, r.lastSeen AS relLastSeen`,
        { nodeId, tenantId },
      );
      return result.records.map((rec) => ({
        id: String(rec.get('id')),
        riskScore: Number(rec.get('riskScore') ?? 0),
        relConfidence: Number(rec.get('relConfidence') ?? 0.5),
        relLastSeen: rec.get('relLastSeen') as string | null,
      }));
    } finally {
      await session.close();
    }
  }

  /** Updates a node's risk score. */
  async updateRiskScore(tenantId: string, nodeId: string, newScore: number): Promise<void> {
    const session = createSession();
    try {
      await session.run(
        `MATCH (n {id: $nodeId, tenantId: $tenantId})
         SET n.riskScore = $newScore, n.lastSeen = $now`,
        { nodeId, tenantId, newScore, now: new Date().toISOString() },
      );
    } finally {
      await session.close();
    }
  }

  /** Gets a node's current risk score. */
  async getNodeRiskScore(tenantId: string, nodeId: string): Promise<number> {
    const session = createSession();
    try {
      const result = await session.run(
        `MATCH (n {id: $nodeId, tenantId: $tenantId})
         RETURN n.riskScore AS riskScore`,
        { nodeId, tenantId },
      );
      if (result.records.length === 0) return 0;
      return Number(result.records[0]!.get('riskScore') ?? 0);
    } finally {
      await session.close();
    }
  }

  /** Helper: parse subgraph results into typed response. */
  private async parseSubgraphResult(
    _session: Session,
    records: Neo4jRecord[],
    tenantId: string,
    centerId: string,
  ): Promise<GraphSubgraphResponse> {
    if (records.length === 0) {
      // Return at least the center node
      const centerNode = await this.getNode(tenantId, centerId);
      return { nodes: centerNode ? [centerNode] : [], edges: [] };
    }

    const record = records[0]!;
    const rawNodes = (record.get('nodeData') ?? []) as Array<{ node: Record<string, unknown>; label: string }>;
    const rawEdges = (record.get('edgeData') ?? []) as Array<Record<string, unknown>>;

    const nodes = rawNodes.map((rn) => toNodeResponse({ ...rn.node, nodeType: rn.label }));
    const edges = rawEdges.map((re) => ({
      id: `${re['fromId']}-${re['type']}-${re['toId']}`,
      type: String(re['type']) as RelationshipType,
      fromNodeId: String(re['fromId']),
      toNodeId: String(re['toId']),
      confidence: Number(re['confidence'] ?? 0.5),
      properties: { firstSeen: re['firstSeen'], lastSeen: re['lastSeen'] },
    }));

    return { nodes, edges };
  }
}
