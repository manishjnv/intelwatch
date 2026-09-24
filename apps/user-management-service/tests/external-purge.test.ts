/**
 * @module external-purge.test
 * @description Tests for I-19 external-datastore purge — Neo4j graph, ES indices, Redis cache.
 */
import { describe, it, expect, vi } from 'vitest';
import { ExternalPurger } from '../src/services/external-purge.js';

function mockRedis(keysByPattern: Record<string, string[]> = {}) {
  return {
    keys: vi.fn(async (pattern: string) => keysByPattern[pattern] ?? []),
    del: vi.fn(async (...keys: string[]) => keys.length),
    quit: vi.fn(async () => 'OK'),
  };
}

function mockNeo4jDriver(nodesDeleted: number) {
  const session = {
    run: vi.fn(async () => ({
      summary: { counters: { updates: () => ({ nodesDeleted }) } },
    })),
    close: vi.fn(async () => undefined),
  };
  return { driver: { session: vi.fn(() => session), close: vi.fn(async () => undefined) }, session };
}

function mockEs(indexNames: string[]) {
  return {
    indices: {
      get: vi.fn(async () => Object.fromEntries(indexNames.map((n) => [n, {}]))),
      delete: vi.fn(async () => ({ acknowledged: true })),
    },
    close: vi.fn(async () => undefined),
  };
}

describe('ExternalPurger', () => {
  it('deletes redis keys, graph nodes, and es indices for a tenant', async () => {
    const redis = mockRedis({
      'plan_cache:t1*': ['plan_cache:t1', 'plan_cache:t1:free'],
      'quota:t1*': ['quota:t1:daily'],
    });
    const { driver, session } = mockNeo4jDriver(7);
    const es = mockEs(['etip_t1_iocs_ip', 'etip_t1_iocs_domain']);

    const purger = new ExternalPurger({
      redis: redis as never,
      neo4jDriver: driver as never,
      esClient: es as never,
    });

    const result = await purger.purge('t1');

    expect(result.redisKeysDeleted).toBe(3);
    expect(result.graphNodesDeleted).toBe(7);
    expect(result.esIndicesDeleted).toBe(2);
    expect(result.errors).toEqual([]);

    // Graph delete is tenant-scoped
    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('DETACH DELETE'),
      { tenantId: 't1' },
    );
    // ES delete targets the tenant wildcard
    expect(es.indices.delete).toHaveBeenCalledWith(
      expect.objectContaining({ index: 'etip_t1_iocs_*' }),
    );
  });

  it('isolates a failing store — others still purge, error recorded', async () => {
    const redis = mockRedis({ 'plan_cache:t2*': ['plan_cache:t2'] });
    const { driver } = mockNeo4jDriver(0);
    driver.session = vi.fn(() => {
      throw new Error('neo4j down');
    }) as never;
    const es = mockEs(['etip_t2_iocs_ip']);

    const purger = new ExternalPurger({
      redis: redis as never,
      neo4jDriver: driver as never,
      esClient: es as never,
    });

    const result = await purger.purge('t2');

    expect(result.redisKeysDeleted).toBe(1);
    expect(result.esIndicesDeleted).toBe(1);
    expect(result.graphNodesDeleted).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('graph');
  });

  it('treats a null client as a no-op (store not configured)', async () => {
    const purger = new ExternalPurger({ redis: null, neo4jDriver: null, esClient: null });
    const result = await purger.purge('t3');
    expect(result).toEqual({
      redisKeysDeleted: 0,
      graphNodesDeleted: 0,
      esIndicesDeleted: 0,
      errors: [],
    });
  });

  it('rejects an empty tenantId before touching any store (no mass cache wipe)', async () => {
    const redis = mockRedis();
    const purger = new ExternalPurger({ redis: redis as never, neo4jDriver: null, esClient: null });
    await expect(purger.purge('')).rejects.toThrow('tenantId is required');
    await expect(purger.purge('   ')).rejects.toThrow('tenantId is required');
    expect(redis.keys).not.toHaveBeenCalled();
  });

  it('returns 0 es indices when none match', async () => {
    const es = mockEs([]);
    const purger = new ExternalPurger({ redis: null, neo4jDriver: null, esClient: es as never });
    const result = await purger.purge('t4');
    expect(result.esIndicesDeleted).toBe(0);
    expect(es.indices.delete).not.toHaveBeenCalled();
  });
});
