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
      'plan_cache:11111111-1111-4111-8111-111111111111*': ['plan_cache:11111111-1111-4111-8111-111111111111', 'plan_cache:11111111-1111-4111-8111-111111111111:free'],
      'quota:11111111-1111-4111-8111-111111111111*': ['quota:11111111-1111-4111-8111-111111111111:daily'],
    });
    const { driver, session } = mockNeo4jDriver(7);
    const es = mockEs(['etip_11111111-1111-4111-8111-111111111111_iocs_ip', 'etip_11111111-1111-4111-8111-111111111111_iocs_domain']);

    const purger = new ExternalPurger({
      redis: redis as never,
      neo4jDriver: driver as never,
      esClient: es as never,
    });

    const result = await purger.purge('11111111-1111-4111-8111-111111111111');

    expect(result.redisKeysDeleted).toBe(3);
    expect(result.graphNodesDeleted).toBe(7);
    expect(result.esIndicesDeleted).toBe(2);
    expect(result.errors).toEqual([]);

    // Graph delete is tenant-scoped
    expect(session.run).toHaveBeenCalledWith(
      expect.stringContaining('DETACH DELETE'),
      { tenantId: '11111111-1111-4111-8111-111111111111' },
    );
    // ES delete targets the tenant wildcard
    expect(es.indices.delete).toHaveBeenCalledWith(
      expect.objectContaining({ index: 'etip_11111111-1111-4111-8111-111111111111_iocs_*' }),
    );
  });

  it('deletes etip:<tenant>:* keys for the tenant, leaves other tenants untouched', async () => {
    const redis = mockRedis({
      'etip:11111111-1111-4111-8111-111111111111:*': ['etip:11111111-1111-4111-8111-111111111111:onboarding', 'etip:11111111-1111-4111-8111-111111111111:wizard'],
    });

    const purger = new ExternalPurger({ redis: redis as never, neo4jDriver: null, esClient: null });
    const result = await purger.purge('11111111-1111-4111-8111-111111111111');

    expect(result.redisKeysDeleted).toBe(2);
    expect(redis.keys).toHaveBeenCalledWith('etip:11111111-1111-4111-8111-111111111111:*');
    // tenant 2's keys were never requested — the pattern is scoped to tenant 1 only.
    expect(redis.keys).not.toHaveBeenCalledWith('etip:22222222-2222-4222-8222-222222222222:*');
  });

  it('isolates a failing store — others still purge, error recorded', async () => {
    const redis = mockRedis({ 'plan_cache:22222222-2222-4222-8222-222222222222*': ['plan_cache:22222222-2222-4222-8222-222222222222'] });
    const { driver } = mockNeo4jDriver(0);
    driver.session = vi.fn(() => {
      throw new Error('neo4j down');
    }) as never;
    const es = mockEs(['etip_22222222-2222-4222-8222-222222222222_iocs_ip']);

    const purger = new ExternalPurger({
      redis: redis as never,
      neo4jDriver: driver as never,
      esClient: es as never,
    });

    const result = await purger.purge('22222222-2222-4222-8222-222222222222');

    expect(result.redisKeysDeleted).toBe(1);
    expect(result.esIndicesDeleted).toBe(1);
    expect(result.graphNodesDeleted).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('graph');
  });

  it('treats a null client as a no-op (store not configured)', async () => {
    const purger = new ExternalPurger({ redis: null, neo4jDriver: null, esClient: null });
    const result = await purger.purge('33333333-3333-4333-8333-333333333333');
    expect(result).toEqual({
      redisKeysDeleted: 0,
      graphNodesDeleted: 0,
      esIndicesDeleted: 0,
      errors: [],
    });
  });

  it('rejects an empty, wildcard or non-UUID tenantId before touching any store (no mass cache wipe)', async () => {
    const redis = mockRedis();
    const purger = new ExternalPurger({ redis: redis as never, neo4jDriver: null, esClient: null });
    for (const bad of ['', '   ', '*', 'default', '11111111-1111-4111-8111-11111111111*']) {
      await expect(purger.purge(bad)).rejects.toThrow('tenantId must be a UUID');
    }
    expect(redis.keys).not.toHaveBeenCalled();
  });

  it('returns 0 es indices when none match', async () => {
    const es = mockEs([]);
    const purger = new ExternalPurger({ redis: null, neo4jDriver: null, esClient: es as never });
    const result = await purger.purge('44444444-4444-4444-8444-444444444444');
    expect(result.esIndicesDeleted).toBe(0);
    expect(es.indices.delete).not.toHaveBeenCalled();
  });
});
