import { createSession } from '../driver.js';
import { assertNodeLabel, assertRelType } from '../cypher-safety.js';
import { RELATIONSHIP_TYPE_WEIGHTS } from '../schemas/graph.js';
import type { NodeType } from '../schemas/graph.js';
import type { IocGraphPlan, GraphPlanNode, GraphPlanEdge } from './ioc-graph-mapper.js';

export interface ApplyPlansResult {
  nodesUpserted: number;
  entitiesUpserted: number;
  edgesMerged: number;
  edgesPruned: number;
  nodesDeleted: number;
}

const ENTITY_LABELS: readonly NodeType[] = ['ThreatActor', 'Malware', 'AttackPattern'];

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>();
  for (const r of rows) seen.set(r.id, r); // last write wins, matches MERGE semantics
  return [...seen.values()];
}

/**
 * Writes IOC-derived graph plans (S171 P3b). Labels/relationship types are
 * ONLY ever taken from fixed code constants — never interpolated from plan
 * data directly — and still pass through assertNodeLabel/assertRelType as a
 * belt-and-braces guard against future callers.
 */
export class GraphSyncWriter {
  /** Applies one page of plans in a single write transaction. */
  async applyPlans(tenantId: string, plans: IocGraphPlan[], runId?: string): Promise<ApplyPlansResult> {
    const session = createSession();
    try {
      return await session.executeWrite(async (tx) => {
        const now = new Date().toISOString();
        const counts: ApplyPlansResult = { nodesUpserted: 0, entitiesUpserted: 0, edgesMerged: 0, edgesPruned: 0, nodesDeleted: 0 };

        const deletes = plans.filter((p): p is Extract<IocGraphPlan, { action: 'delete' }> => p.action === 'delete');
        if (deletes.length > 0) {
          const res = await tx.run(
            `UNWIND $ids AS id
             MATCH (n {id: id, tenantId: $tenantId})
             WHERE n:IOC OR n:Vulnerability
             DETACH DELETE n
             RETURN count(n) AS deleted`,
            { ids: deletes.map((d) => d.id), tenantId },
          );
          counts.nodesDeleted += Number(res.records[0]?.get('deleted') ?? 0);
        }

        const upserts = plans.filter((p): p is Extract<IocGraphPlan, { action: 'upsert' }> => p.action === 'upsert');
        if (upserts.length === 0) return counts;

        // Primary nodes (IOC / Vulnerability) — sync owns baseRiskScore; riskScore only raised.
        const primariesByLabel = groupBy(dedupeById(upserts.map((p) => p.primary)), (n) => n.label);
        for (const [label, rows] of primariesByLabel) {
          const safeLabel = assertNodeLabel(label);
          await tx.run(
            `UNWIND $rows AS row
             MERGE (n:${safeLabel} {id: row.id, tenantId: $tenantId})
             ON CREATE SET n.firstSyncedAt = $now
             SET n += row.props, n.nodeType = $label, n.syncedAt = $now${runId ? ', n.syncRunId = $runId' : ''}
             SET n.riskScore = CASE
               WHEN n.riskScore IS NULL OR n.riskScore < row.props.baseRiskScore THEN row.props.baseRiskScore
               ELSE n.riskScore END`,
            { rows: rows.map((r) => ({ id: r.id, props: r.props })), tenantId, now, label, ...(runId ? { runId } : {}) },
          );
          counts.nodesUpserted += rows.length;
        }

        // Entity nodes — riskScore only initialized on create, never lowered here.
        const entityRows = dedupeById(upserts.flatMap((p) => p.entities));
        const entitiesByLabel = groupBy(entityRows, (n) => n.label);
        for (const [label, rows] of entitiesByLabel) {
          const safeLabel = assertNodeLabel(label);
          await tx.run(
            `UNWIND $rows AS row
             MERGE (n:${safeLabel} {id: row.id, tenantId: $tenantId})
             ON CREATE SET n.firstSyncedAt = $now, n.riskScore = coalesce(n.riskScore, 0)
             SET n += row.props, n.nodeType = $label, n.syncedAt = $now`,
            { rows: rows.map((r) => ({ id: r.id, props: r.props })), tenantId, now, label },
          );
          counts.entitiesUpserted += rows.length;
        }

        // Stale-edge prune per upserted primary — only origin='ioc-sync' edges, before re-merging.
        for (const p of upserts) {
          const { primaryId, types } = p.ownedEdges;
          for (const type of types) {
            const safeType = assertRelType(type);
            if (type === 'INDICATES') {
              const targetIds = p.edges.filter((e) => e.type === type && e.fromId === primaryId).map((e) => e.toId);
              const res = await tx.run(
                `MATCH (a {id: $primaryId, tenantId: $tenantId})-[r:${safeType} {origin: 'ioc-sync'}]->(b {tenantId: $tenantId})
                 WHERE NOT b.id IN $targetIds
                 DELETE r
                 RETURN count(r) AS pruned`,
                { primaryId, tenantId, targetIds },
              );
              counts.edgesPruned += Number(res.records[0]?.get('pruned') ?? 0);
            } else {
              const targetIds = p.edges.filter((e) => e.type === type && e.toId === primaryId).map((e) => e.fromId);
              const res = await tx.run(
                `MATCH (a {tenantId: $tenantId})-[r:${safeType} {origin: 'ioc-sync'}]->(b {id: $primaryId, tenantId: $tenantId})
                 WHERE NOT a.id IN $targetIds
                 DELETE r
                 RETURN count(r) AS pruned`,
                { primaryId, tenantId, targetIds },
              );
              counts.edgesPruned += Number(res.records[0]?.get('pruned') ?? 0);
            }
          }
        }

        // Edges — grouped by (fromLabel, type, toLabel); never downgrade analyst-confirmed source
        // (achieved simply by not SETting r.source on the ON MATCH branch).
        const allEdges = upserts.flatMap((p) => p.edges);
        const edgesByBucket = groupBy(allEdges, (e) => `${e.fromLabel}|${e.type}|${e.toLabel}`);
        for (const [, rows] of edgesByBucket) {
          const sample = rows[0]!;
          const safeFrom = assertNodeLabel(sample.fromLabel);
          const safeType = assertRelType(sample.type);
          const safeTo = assertNodeLabel(sample.toLabel);
          await tx.run(
            `UNWIND $rows AS row
             MATCH (a:${safeFrom} {id: row.fromId, tenantId: $tenantId}), (b:${safeTo} {id: row.toId, tenantId: $tenantId})
             MERGE (a)-[r:${safeType}]->(b)
             ON CREATE SET r.firstSeen = $now, r.source = 'auto-detected', r.origin = 'ioc-sync'
             SET r.lastSeen = $now, r.confidence = CASE
               WHEN r.confidence IS NULL OR r.confidence < row.confidence THEN row.confidence
               ELSE r.confidence END`,
            { rows: rows.map((r) => ({ fromId: r.fromId, toId: r.toId, confidence: r.props['confidence'] })), tenantId, now },
          );
          counts.edgesMerged += rows.length;
        }

        return counts;
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Raises ThreatActor/Malware/AttackPattern riskScore to max(incoming INDICATES rollup). Never lowers.
   * Pass entityIds to limit the rollup to the entities one IOC touched (event path); omit for the whole tenant.
   */
  async rollupEntityRisk(tenantId: string, entityIds?: string[]): Promise<void> {
    if (entityIds && entityIds.length === 0) return;
    const session = createSession();
    try {
      const weight = RELATIONSHIP_TYPE_WEIGHTS.INDICATES;
      const idFilter = entityIds ? 'WHERE n.id IN $entityIds' : '';
      for (const label of ENTITY_LABELS) {
        const safeLabel = assertNodeLabel(label);
        await session.run(
          `MATCH (ioc {tenantId: $tenantId})-[r:INDICATES]->(n:${safeLabel} {tenantId: $tenantId})
           ${idFilter}
           WITH n, max(coalesce(ioc.riskScore, 0) * coalesce(r.confidence, 0) * $weight) AS rolled
           SET n.riskScore = CASE WHEN n.riskScore IS NULL OR n.riskScore < rolled THEN rolled ELSE n.riskScore END`,
          { tenantId, weight, ...(entityIds ? { entityIds } : {}) },
        );
      }
    } finally {
      await session.close();
    }
  }

  /**
   * After a successful full sweep: removes ioc-sync IOC/Vulnerability nodes not touched by this run,
   * then ioc-sync ThreatActor/Malware/AttackPattern nodes left with no relationships.
   */
  async sweepDeleted(tenantId: string, runId: string): Promise<number> {
    const session = createSession();
    try {
      const result = await session.run(
        `MATCH (n {tenantId: $tenantId, origin: 'ioc-sync'})
         WHERE (n:IOC OR n:Vulnerability) AND (n.syncRunId IS NULL OR n.syncRunId <> $runId)
         DETACH DELETE n
         RETURN count(n) AS deleted`,
        { tenantId, runId },
      );
      const orphans = await session.run(
        `MATCH (n {tenantId: $tenantId, origin: 'ioc-sync'})
         WHERE (n:ThreatActor OR n:Malware OR n:AttackPattern) AND NOT (n)--()
         DELETE n
         RETURN count(n) AS deleted`,
        { tenantId },
      );
      return Number(result.records[0]?.get('deleted') ?? 0) + Number(orphans.records[0]?.get('deleted') ?? 0);
    } finally {
      await session.close();
    }
  }
}

export type { GraphPlanNode, GraphPlanEdge };
