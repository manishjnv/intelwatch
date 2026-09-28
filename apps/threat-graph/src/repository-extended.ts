import { createSession } from './driver.js';
import type {
  NodeType, RelationshipType, GraphEdgeResponse, GraphStatsResponse, GraphSubgraphResponse, GraphNodeResponse,
} from './schemas/graph.js';

/**
 * Extended graph repository methods split from main repository.ts
 * to stay under the 400-line file limit.
 *
 * Contains: getStats (P0 #5), relationship CRUD (P2 #14), overview (S165).
 */

/** Extracts a node response from a Neo4j record. */
export function toNodeResponse(record: Record<string, unknown>): GraphNodeResponse {
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

/** Gets graph statistics (P0 #5). */
export async function getGraphStats(tenantId: string): Promise<GraphStatsResponse> {
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
       WITH collect({id: n.id, type: label, label: coalesce(n.name, n.value, n.cveId, n.id), connections: connections}) AS allNodes
       WITH allNodes,
            [x IN allNodes WHERE x.connections = 0] AS isolated,
            [x IN allNodes[0..10]] AS top10
       RETURN top10, size(isolated) AS isolatedCount, size(allNodes) AS totalNodes,
              reduce(s = 0, x IN allNodes | s + x.connections) AS totalConnections`,
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

/** Gets a specific relationship between two nodes (#14). */
export async function getRelationship(
  tenantId: string,
  fromId: string,
  type: RelationshipType,
  toId: string,
): Promise<GraphEdgeResponse | null> {
  const session = createSession();
  try {
    const result = await session.run(
      `MATCH (a {id: $fromId, tenantId: $tenantId})-[r:${type}]->(b {id: $toId, tenantId: $tenantId})
       RETURN type(r) AS relType, r.confidence AS confidence, r.source AS source,
              a.id AS fromNodeId, b.id AS toNodeId,
              r.firstSeen AS firstSeen, r.lastSeen AS lastSeen, properties(r) AS props`,
      { fromId, toId, tenantId },
    );
    if (result.records.length === 0) return null;
    const rec = result.records[0]!;
    const props = (rec.get('props') ?? {}) as Record<string, unknown>;
    return {
      id: `${fromId}-${type}-${toId}`,
      type: rec.get('relType') as RelationshipType,
      fromNodeId: String(rec.get('fromNodeId')),
      toNodeId: String(rec.get('toNodeId')),
      confidence: Number(rec.get('confidence') ?? 0.5),
      properties: { ...props, source: rec.get('source') ?? 'auto-detected' },
    };
  } finally {
    await session.close();
  }
}

/** Updates a relationship's properties (#14). */
export async function updateRelationship(
  tenantId: string,
  fromId: string,
  type: RelationshipType,
  toId: string,
  updates: Record<string, unknown>,
): Promise<GraphEdgeResponse | null> {
  const session = createSession();
  try {
    const now = new Date().toISOString();
    const result = await session.run(
      `MATCH (a {id: $fromId, tenantId: $tenantId})-[r:${type}]->(b {id: $toId, tenantId: $tenantId})
       SET r += $updates, r.lastSeen = $now
       RETURN type(r) AS relType, r.confidence AS confidence, r.source AS source,
              a.id AS fromNodeId, b.id AS toNodeId,
              r.firstSeen AS firstSeen, r.lastSeen AS lastSeen`,
      { fromId, toId, tenantId, updates, now },
    );
    if (result.records.length === 0) return null;
    const rec = result.records[0]!;
    return {
      id: `${fromId}-${type}-${toId}`,
      type: rec.get('relType') as RelationshipType,
      fromNodeId: String(rec.get('fromNodeId')),
      toNodeId: String(rec.get('toNodeId')),
      confidence: Number(rec.get('confidence') ?? 0.5),
      properties: {
        source: rec.get('source') ?? 'auto-detected',
        firstSeen: rec.get('firstSeen'),
        lastSeen: rec.get('lastSeen'),
      },
    };
  } finally {
    await session.close();
  }
}

/** Gets the top-N most-connected nodes of a tenant plus edges between them (S165). */
export async function getOverviewSubgraph(tenantId: string, limit: number): Promise<GraphSubgraphResponse> {
  const session = createSession();
  try {
    const result = await session.run(
      `MATCH (n {tenantId: $tenantId})
       OPTIONAL MATCH (n)-[r]-(m {tenantId: $tenantId})
       WITH n, count(r) AS connections
       ORDER BY connections DESC, n.id ASC
       LIMIT toInteger($limit)
       WITH collect(n) AS topNodes,
            collect({node: properties(n), label: labels(n)[0]}) AS nodeData
       UNWIND topNodes AS a
       OPTIONAL MATCH (a)-[r]->(b)
       WHERE b IN topNodes
       WITH nodeData, collect(DISTINCT CASE WHEN r IS NULL THEN NULL ELSE {
         type: type(r), fromId: a.id, toId: b.id,
         confidence: r.confidence, firstSeen: r.firstSeen, lastSeen: r.lastSeen
       } END) AS edgeData
       RETURN nodeData, edgeData`,
      { tenantId, limit: Number(limit) },
    );

    if (result.records.length === 0) return { nodes: [], edges: [] };

    const record = result.records[0]!;
    const rawNodes = (record.get('nodeData') ?? []) as Array<{ node: Record<string, unknown>; label: string }>;
    const rawEdges = (record.get('edgeData') ?? []) as Array<Record<string, unknown> | null>;

    const nodes = rawNodes.map((rn) => toNodeResponse({ ...rn.node, nodeType: rn.label }));
    const edges = rawEdges
      .filter((re): re is Record<string, unknown> => re !== null)
      .map((re) => ({
        id: `${re['fromId']}-${re['type']}-${re['toId']}`,
        type: String(re['type']) as RelationshipType,
        fromNodeId: String(re['fromId']),
        toNodeId: String(re['toId']),
        confidence: Number(re['confidence'] ?? 0.5),
        properties: { firstSeen: re['firstSeen'], lastSeen: re['lastSeen'] },
      }));

    return { nodes, edges };
  } finally {
    await session.close();
  }
}

/** Deletes a specific relationship between two nodes (#14). */
export async function deleteRelationshipFn(
  tenantId: string,
  fromId: string,
  type: RelationshipType,
  toId: string,
): Promise<boolean> {
  const session = createSession();
  try {
    const result = await session.run(
      `MATCH (a {id: $fromId, tenantId: $tenantId})-[r:${type}]->(b {id: $toId, tenantId: $tenantId})
       DELETE r
       RETURN count(r) AS deleted`,
      { fromId, toId, tenantId },
    );
    return Number(result.records[0]?.get('deleted') ?? 0) > 0;
  } finally {
    await session.close();
  }
}
