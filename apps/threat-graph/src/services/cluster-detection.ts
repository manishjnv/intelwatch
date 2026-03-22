import { randomUUID } from 'crypto';
import { createSession } from '../driver.js';
import type { NodeType } from '../schemas/graph.js';
import type { DetectedCluster, ClusterDetectionResponse, ClusterNode } from '../schemas/search.js';

/**
 * Cluster Detection Service — P1 #7.
 *
 * Finds communities of nodes sharing infrastructure (IOCs on same hosting,
 * actors using same malware, campaigns sharing IOCs). Uses connected-component
 * analysis via shared intermediate nodes.
 *
 * Algorithm:
 * 1. Find all pairs of nodes that share ≥1 common neighbor
 * 2. Group connected pairs into clusters using union-find
 * 3. Filter by minimum size and optional node type
 * 4. Compute cluster-level risk metrics
 */
export class ClusterDetectionService {

  /** Detects clusters of nodes sharing common infrastructure/entities. */
  async detectClusters(
    tenantId: string,
    minSize: number,
    nodeTypeFilter?: string,
    limit = 20,
  ): Promise<ClusterDetectionResponse> {
    const session = createSession();
    try {
      // Find nodes sharing common neighbors (shared infrastructure pattern)
      const typeClause = nodeTypeFilter ? `AND labels(a)[0] = $nodeType AND labels(b)[0] = $nodeType` : '';

      const result = await session.run(
        `MATCH (a {tenantId: $tenantId})-[r1]-(shared {tenantId: $tenantId})-[r2]-(b {tenantId: $tenantId})
         WHERE a <> b AND a.id < b.id ${typeClause}
         WITH a, b, collect(DISTINCT {
           id: shared.id, type: labels(shared)[0],
           label: coalesce(shared.name, shared.value, shared.cveId, shared.id)
         }) AS sharedNodes
         WHERE size(sharedNodes) >= 1
         RETURN a.id AS aId, labels(a)[0] AS aType,
                coalesce(a.name, a.value, a.cveId, a.id) AS aLabel, a.riskScore AS aRisk,
                b.id AS bId, labels(b)[0] AS bType,
                coalesce(b.name, b.value, b.cveId, b.id) AS bLabel, b.riskScore AS bRisk,
                sharedNodes
         LIMIT 500`,
        { tenantId, nodeType: nodeTypeFilter ?? '' },
      );

      // Build adjacency from pairs
      const adjacency = new Map<string, Set<string>>();
      const nodeInfo = new Map<string, ClusterNode>();
      const sharedMap = new Map<string, Array<{ id: string; type: NodeType; label: string }>>();

      for (const rec of result.records) {
        const aId = String(rec.get('aId'));
        const bId = String(rec.get('bId'));
        const shared = rec.get('sharedNodes') as Array<{ id: string; type: string; label: string }>;

        if (!adjacency.has(aId)) adjacency.set(aId, new Set());
        if (!adjacency.has(bId)) adjacency.set(bId, new Set());
        adjacency.get(aId)!.add(bId);
        adjacency.get(bId)!.add(aId);

        nodeInfo.set(aId, {
          id: aId,
          nodeType: String(rec.get('aType')) as NodeType,
          label: String(rec.get('aLabel')),
          riskScore: Number(rec.get('aRisk') ?? 0),
        });
        nodeInfo.set(bId, {
          id: bId,
          nodeType: String(rec.get('bType')) as NodeType,
          label: String(rec.get('bLabel')),
          riskScore: Number(rec.get('bRisk') ?? 0),
        });

        const pairKey = `${aId}:${bId}`;
        sharedMap.set(pairKey, shared.map((s) => ({
          id: String(s.id),
          type: String(s.type) as NodeType,
          label: String(s.label),
        })));
      }

      // Connected components via BFS
      const visited = new Set<string>();
      const clusters: DetectedCluster[] = [];

      for (const nodeId of adjacency.keys()) {
        if (visited.has(nodeId)) continue;

        const component: string[] = [];
        const bfsQueue = [nodeId];
        visited.add(nodeId);

        while (bfsQueue.length > 0) {
          const current = bfsQueue.shift()!;
          component.push(current);

          for (const neighbor of adjacency.get(current) ?? []) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              bfsQueue.push(neighbor);
            }
          }
        }

        if (component.length < minSize) continue;

        // Gather shared entities for this cluster
        const clusterShared = new Map<string, { id: string; type: NodeType; label: string }>();
        for (let i = 0; i < component.length; i++) {
          for (let j = i + 1; j < component.length; j++) {
            const key1 = `${component[i]}:${component[j]}`;
            const key2 = `${component[j]}:${component[i]}`;
            const shared = sharedMap.get(key1) ?? sharedMap.get(key2) ?? [];
            for (const s of shared) {
              clusterShared.set(s.id, s);
            }
          }
        }

        const clusterNodes = component.map((id) => nodeInfo.get(id)!).filter(Boolean);
        const riskScores = clusterNodes.map((n) => n.riskScore);

        clusters.push({
          id: randomUUID(),
          nodes: clusterNodes,
          sharedEntities: Array.from(clusterShared.values()),
          avgRiskScore: riskScores.length > 0
            ? Math.round((riskScores.reduce((a, b) => a + b, 0) / riskScores.length) * 100) / 100
            : 0,
          maxRiskScore: riskScores.length > 0 ? Math.max(...riskScores) : 0,
          size: component.length,
        });
      }

      // Sort by max risk descending, limit
      clusters.sort((a, b) => b.maxRiskScore - a.maxRiskScore);
      const limited = clusters.slice(0, limit);

      return { clusters: limited, totalClusters: clusters.length };
    } finally {
      await session.close();
    }
  }
}
