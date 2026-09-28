import { createSession } from '../driver.js';
import { MIGRATIONS, type GraphMigration } from './migrations.js';
import type pino from 'pino';

/**
 * Versioned graph migration runner (P3a).
 *
 * Applies each migration in `MIGRATIONS` order at most once, tracked via a
 * `(:_GraphMigration {id})` marker node. Idempotent — safe to run on every
 * boot. A unique constraint on the marker id plus a MERGE-based write guards
 * against two replicas double-applying the same migration concurrently.
 *
 * Internal marker nodes never carry a `tenantId` property, so tenant-scoped
 * queries (which always match `{tenantId: $tenantId}`) never see them.
 */
export interface GraphMigrationResult {
  applied: string[];
  skipped: string[];
}

let lastResult: GraphMigrationResult | null = null;

/** Returns the result of the most recent migration run, or null if none has run yet. */
export function getMigrationStatus(): GraphMigrationResult | null {
  return lastResult;
}

export async function runGraphMigrations(logger: pino.Logger): Promise<GraphMigrationResult> {
  const session = createSession();
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    // Concurrency guard: unique constraint on the marker id.
    await session.run(
      'CREATE CONSTRAINT graph_migration_id IF NOT EXISTS FOR (m:_GraphMigration) REQUIRE m.id IS UNIQUE',
    );

    for (const migration of MIGRATIONS) {
      const existing = await session.run(
        'MATCH (m:_GraphMigration {id: $id}) RETURN m',
        { id: migration.id },
      );

      if (existing.records.length > 0) {
        skipped.push(migration.id);
        continue;
      }

      logger.info({ migrationId: migration.id }, 'Applying graph migration');
      await migration.run(session, logger);

      // MERGE, not CREATE — two replicas racing on the same migration converge
      // on one marker node, guarded by the uniqueness constraint above.
      await session.run(
        'MERGE (m:_GraphMigration {id: $id}) ON CREATE SET m.appliedAt = $appliedAt',
        { id: migration.id, appliedAt: new Date().toISOString() },
      );

      applied.push(migration.id);
      logger.info({ migrationId: migration.id }, 'Graph migration applied');
    }

    lastResult = { applied, skipped };
    return lastResult;
  } finally {
    await session.close();
  }
}

export type { GraphMigration };
