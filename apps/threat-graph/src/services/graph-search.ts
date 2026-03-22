import { createSession } from '../driver.js';
import type { NodeType, GraphNodeResponse } from '../schemas/graph.js';
import type { GraphSearchResponse } from '../schemas/search.js';

/**
 * Graph Search Service — P2 #13.
 *
 * Full-text search across graph nodes by property values, node type, and risk score.
 * Uses case-insensitive CONTAINS for text matching.
 * Supports pagination with page + limit.
 */
export class GraphSearchService {

  /** Searches graph nodes by text query, type, and risk score range. */
  async search(
    tenantId: string,
    query: string,
    nodeType?: string,
    minRisk?: number,
    maxRisk?: number,
    page = 1,
    limit = 20,
  ): Promise<GraphSearchResponse> {
    const session = createSession();
    try {
      const skip = (page - 1) * limit;

      // Build dynamic WHERE clauses
      const conditions: string[] = ['n.tenantId = $tenantId'];

      if (nodeType) {
        conditions.push(`labels(n)[0] = $nodeType`);
      }
      if (minRisk !== undefined) {
        conditions.push(`n.riskScore >= $minRisk`);
      }
      if (maxRisk !== undefined) {
        conditions.push(`n.riskScore <= $maxRisk`);
      }

      // Text search across common properties
      conditions.push(
        `(toLower(coalesce(n.name, '')) CONTAINS toLower($query)
          OR toLower(coalesce(n.value, '')) CONTAINS toLower($query)
          OR toLower(coalesce(n.cveId, '')) CONTAINS toLower($query)
          OR toLower(coalesce(n.id, '')) CONTAINS toLower($query)
          OR toLower(coalesce(n.family, '')) CONTAINS toLower($query)
          OR toLower(coalesce(n.provider, '')) CONTAINS toLower($query))`,
      );

      const whereClause = conditions.join(' AND ');

      // Count total matches
      const countResult = await session.run(
        `MATCH (n) WHERE ${whereClause} RETURN count(n) AS total`,
        { tenantId, query, nodeType: nodeType ?? '', minRisk: minRisk ?? 0, maxRisk: maxRisk ?? 100 },
      );
      const total = Number(countResult.records[0]?.get('total') ?? 0);

      // Fetch paginated results
      const result = await session.run(
        `MATCH (n) WHERE ${whereClause}
         RETURN properties(n) AS props, labels(n)[0] AS label
         ORDER BY n.riskScore DESC, n.lastSeen DESC
         SKIP toInteger($skip) LIMIT toInteger($limit)`,
        {
          tenantId, query,
          nodeType: nodeType ?? '',
          minRisk: minRisk ?? 0,
          maxRisk: maxRisk ?? 100,
          skip: Number(skip),
          limit: Number(limit),
        },
      );

      const results: GraphNodeResponse[] = result.records.map((rec) => {
        const props = (rec.get('props') ?? {}) as Record<string, unknown>;
        return {
          id: String(props['id'] ?? ''),
          nodeType: String(rec.get('label')) as NodeType,
          riskScore: Number(props['riskScore'] ?? 0),
          confidence: Number(props['confidence'] ?? 0),
          properties: props,
        };
      });

      return { results, total, page, limit };
    } finally {
      await session.close();
    }
  }
}
