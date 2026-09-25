/**
 * @module ExternalPurger
 * @description I-19 — Delete a tenant's data from the non-Postgres datastores
 * during offboarding purge: Neo4j graph, Elasticsearch indices, and Redis cache
 * (plan + quota keys). Postgres purge is handled directly by the purge worker.
 *
 * The offboarding purge worker already reaches directly into every module's
 * Postgres tables, so this deliberately does the same for the graph/search/cache
 * datastores rather than round-tripping through owning-service HTTP APIs.
 * Each store is best-effort and isolated: a failure in one is recorded and does
 * not block the others or the authoritative Postgres deletion.
 */
import neo4j, { type Driver } from 'neo4j-driver';
import { Client as EsClient } from '@elastic/elasticsearch';
import { createRedisClient } from '@etip/shared-cache';
import type { Redis } from 'ioredis';

export interface ExternalPurgeResult {
  redisKeysDeleted: number;
  graphNodesDeleted: number;
  esIndicesDeleted: number;
  errors: string[];
}

export interface ExternalPurgeClients {
  redis: Redis | null;
  neo4jDriver: Driver | null;
  esClient: EsClient | null;
}

export class ExternalPurger {
  constructor(private readonly clients: ExternalPurgeClients) {}

  /** Build a purger from environment. A store with no URL configured becomes a no-op. */
  static fromEnv(env: Record<string, string | undefined>): ExternalPurger {
    const redisUrl = env['TI_REDIS_URL'];
    const neo4jUrl = env['TI_NEO4J_URL'];
    const esUrl = env['TI_ES_URL'];

    return new ExternalPurger({
      redis: redisUrl ? createRedisClient(redisUrl) : null,
      neo4jDriver: neo4jUrl ? buildNeo4jDriver(neo4jUrl) : null,
      esClient: esUrl
        ? new EsClient({
            node: esUrl,
            auth: env['TI_ES_USERNAME']
              ? { username: env['TI_ES_USERNAME'], password: env['TI_ES_PASSWORD'] ?? '' }
              : undefined,
          })
        : null,
    });
  }

  /** Purge all external datastores for a tenant. Errors are isolated per store. */
  async purge(tenantId: string): Promise<ExternalPurgeResult> {
    // Trust-boundary guard: an empty id would make the KEYS globs `plan_cache:*`/`quota:*`
    // and wipe EVERY tenant's cache, plus a Neo4j match on all null-tenant nodes.
    if (!tenantId || tenantId.trim() === '') {
      throw new Error('ExternalPurger.purge: tenantId is required');
    }

    const errors: string[] = [];

    const redisKeysDeleted = await this.purgeRedis(tenantId).catch((err: unknown) => {
      errors.push(`redis: ${(err as Error).message}`);
      return 0;
    });
    const graphNodesDeleted = await this.purgeGraph(tenantId).catch((err: unknown) => {
      errors.push(`graph: ${(err as Error).message}`);
      return 0;
    });
    const esIndicesDeleted = await this.purgeEs(tenantId).catch((err: unknown) => {
      errors.push(`es: ${(err as Error).message}`);
      return 0;
    });

    return { redisKeysDeleted, graphNodesDeleted, esIndicesDeleted, errors };
  }

  /** Release all client connections. */
  async close(): Promise<void> {
    await this.clients.redis?.quit().catch(() => undefined);
    await this.clients.neo4jDriver?.close().catch(() => undefined);
    await this.clients.esClient?.close().catch(() => undefined);
  }

  private async purgeRedis(tenantId: string): Promise<number> {
    const redis = this.clients.redis;
    if (!redis) return 0;
    // ponytail: KEYS is fine for a daily purge on a bounded per-tenant keyspace;
    // switch to SCAN if the cache keyspace ever grows large enough to block Redis.
    // Tenant IDs are fixed-length UUIDs, so `<prefix>:<id>*` cannot collide with another tenant.
    let deleted = 0;
    for (const pattern of [`plan_cache:${tenantId}*`, `quota:${tenantId}*`]) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) deleted += await redis.del(...keys);
    }
    return deleted;
  }

  private async purgeGraph(tenantId: string): Promise<number> {
    const driver = this.clients.neo4jDriver;
    if (!driver) return 0;
    const session = driver.session();
    try {
      // ponytail: single-transaction delete; move to `CALL {} IN TRANSACTIONS`
      // if a tenant graph ever exceeds the heap during purge.
      const res = await session.run('MATCH (n {tenantId: $tenantId}) DETACH DELETE n', { tenantId });
      return res.summary.counters.updates().nodesDeleted;
    } finally {
      await session.close();
    }
  }

  private async purgeEs(tenantId: string): Promise<number> {
    const es = this.clients.esClient;
    if (!es) return 0;
    // Wildcard get returns {} (not 404) when nothing matches, so no guard needed here.
    const pattern = `etip_${tenantId}_iocs_*`;
    const existing = await es.indices.get({ index: pattern });
    const names = Object.keys(existing ?? {});
    if (names.length === 0) return 0;
    // delete only runs with ≥1 concrete match, so it can't 404 on the wildcard.
    await es.indices.delete({ index: pattern });
    return names.length;
  }
}

function buildNeo4jDriver(url: string): Driver {
  const parsed = new URL(url);
  const scheme = parsed.protocol.replace(':', '');
  const host = parsed.hostname;
  const port = parsed.port || '7687';
  const user = decodeURIComponent(parsed.username || 'neo4j');
  const password = decodeURIComponent(parsed.password || '');
  return neo4j.driver(`${scheme}://${host}:${port}`, neo4j.auth.basic(user, password));
}
