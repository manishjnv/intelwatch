import type { Session } from 'neo4j-driver';
import type pino from 'pino';
import { NODE_TYPES, IOC_TYPES } from '../schemas/graph.js';

export interface GraphMigration {
  id: string;
  run: (session: Session, logger: pino.Logger) => Promise<void>;
}

/** Legacy lowercase label → its production node label (P3a background). */
const LEGACY_LABEL_RE = /^[a-z][a-z0-9_]*$/;

/** Only labels that are known IOC types are relabelled; any other lowercase label is left alone and logged. */
const LEGACY_IOC_LABELS = new Set<string>(IOC_TYPES);

function targetLabelFor(legacyLabel: string): 'Vulnerability' | 'IOC' {
  return legacyLabel === 'cve' ? 'Vulnerability' : 'IOC';
}

/**
 * 001 — relabels legacy lowercase IOC-type labels (`cve`, `domain`, `ip`, ...)
 * written by the pre-sync producer onto the correct production label
 * (`Vulnerability` for `cve`, `IOC` for everything else), tagging origin so
 * 3b's reconciler can find them. Idempotent: once relabelled, a legacy label
 * no longer appears in `db.labels()` for that node, so re-running is a no-op.
 */
const relabelLegacyIocLabels: GraphMigration = {
  id: '001-relabel-legacy-ioc-labels',
  async run(session, logger) {
    const labelsResult = await session.run('CALL db.labels()');
    const labels = labelsResult.records.map((r) => String(r.get('label')));

    for (const label of labels) {
      if (!LEGACY_LABEL_RE.test(label)) continue;
      if ((NODE_TYPES as readonly string[]).includes(label)) continue;
      if (!LEGACY_IOC_LABELS.has(label)) {
        logger.warn({ label }, 'Unknown lowercase graph label — not an IOC type, left untouched');
        continue;
      }

      const target = targetLabelFor(label);
      const result = await session.run(
        `MATCH (n:\`${label}\`)
         CALL {
           WITH n
           SET n:${target}, n.iocType = $label, n.nodeType = $target, n.origin = 'ioc-sync'
           REMOVE n:\`${label}\`
         } IN TRANSACTIONS OF 1000 ROWS`,
        { label, target },
      );
      logger.info({ label, target, batches: result.summary?.counters ?? null }, 'Relabelled legacy IOC label');
    }
  },
};

/**
 * 002 — uniqueness constraints (or index fallback) on (id, tenantId) for every
 * node label, tenant lookup indexes, and uniqueness constraints for the
 * internal `_GraphLock` / `_GraphSyncState` labels 3b's reconciler uses.
 * Must run after 001 — relabelling first avoids duplicate (id, tenantId)
 * pairs blocking the constraint.
 */
const constraintsAndIndexes: GraphMigration = {
  id: '002-constraints-and-indexes',
  async run(session, logger) {
    for (const label of NODE_TYPES) {
      try {
        await session.run(
          `CREATE CONSTRAINT ${label}_id_tenant_unique IF NOT EXISTS FOR (n:${label}) REQUIRE (n.id, n.tenantId) IS UNIQUE`,
        );
      } catch (err) {
        logger.warn({ label, err: (err as Error).message }, 'Composite uniqueness constraint unsupported, falling back to index');
        await session.run(
          `CREATE INDEX ${label}_id_tenant IF NOT EXISTS FOR (n:${label}) ON (n.id, n.tenantId)`,
        );
      }
      await session.run(
        `CREATE INDEX ${label}_tenant IF NOT EXISTS FOR (n:${label}) ON (n.tenantId)`,
      );
    }

    // Internal labels used by 3b's sync reconciler.
    await session.run(
      'CREATE CONSTRAINT graph_lock_name_unique IF NOT EXISTS FOR (l:_GraphLock) REQUIRE l.name IS UNIQUE',
    );
    await session.run(
      'CREATE CONSTRAINT graph_sync_state_tenant_unique IF NOT EXISTS FOR (s:_GraphSyncState) REQUIRE s.stateTenantId IS UNIQUE',
    );
  },
};

/** Ordered list of all graph migrations. Append new ones at the end — never reorder. */
export const MIGRATIONS: GraphMigration[] = [
  relabelLegacyIocLabels,
  constraintsAndIndexes,
];
