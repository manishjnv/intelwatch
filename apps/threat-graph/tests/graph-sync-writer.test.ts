import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTxRun = vi.fn().mockResolvedValue({ records: [] });
const mockSessionRun = vi.fn().mockResolvedValue({ records: [] });
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockExecuteWrite = vi.fn(async (fn: (tx: { run: typeof mockTxRun }) => unknown) => fn({ run: mockTxRun }));

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockSessionRun, executeWrite: mockExecuteWrite, close: mockClose }),
}));

import { GraphSyncWriter } from '../src/services/graph-sync.js';
import type { IocGraphPlan } from '../src/services/ioc-graph-mapper.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const IOC_ID = '22222222-2222-2222-2222-222222222222';
const ACTOR_ID = '33333333-3333-3333-3333-333333333333';

function iocUpsertPlan(): IocGraphPlan {
  return {
    action: 'upsert',
    primary: { label: 'IOC', id: IOC_ID, props: { iocType: 'domain', value: 'x.com', baseRiskScore: 70 } },
    entities: [{ label: 'ThreatActor', id: ACTOR_ID, props: { name: 'APT1' } }],
    edges: [{ fromId: IOC_ID, fromLabel: 'IOC', type: 'INDICATES', toId: ACTOR_ID, toLabel: 'ThreatActor', props: { source: 'auto-detected', origin: 'ioc-sync', confidence: 0.8 } }],
    ownedEdges: { primaryId: IOC_ID, types: ['INDICATES'] },
  };
}

const VULN_ID = '44444444-4444-4444-4444-444444444444';

/** A Vulnerability primary — exercises the "incoming" (EXPLOITS) prune branch, not INDICATES. */
function vulnUpsertPlan(): IocGraphPlan {
  return {
    action: 'upsert',
    primary: { label: 'Vulnerability', id: VULN_ID, props: { cveId: 'CVE-2026-0001', baseRiskScore: 90 } },
    entities: [{ label: 'ThreatActor', id: ACTOR_ID, props: { name: 'APT1' } }],
    edges: [{ fromId: ACTOR_ID, fromLabel: 'ThreatActor', type: 'EXPLOITS', toId: VULN_ID, toLabel: 'Vulnerability', props: { source: 'auto-detected', origin: 'ioc-sync', confidence: 0.8 } }],
    ownedEdges: { primaryId: VULN_ID, types: ['EXPLOITS'] },
  };
}

describe('GraphSyncWriter', () => {
  let writer: GraphSyncWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTxRun.mockResolvedValue({ records: [] });
    mockSessionRun.mockResolvedValue({ records: [] });
    writer = new GraphSyncWriter();
  });

  it('applyPlans runs inside one write transaction', async () => {
    await writer.applyPlans(TENANT, [iocUpsertPlan()]);
    expect(mockExecuteWrite).toHaveBeenCalledOnce();
  });

  it('only interpolates labels/types from fixed constants (IOC, ThreatActor, INDICATES)', async () => {
    await writer.applyPlans(TENANT, [iocUpsertPlan()]);
    const cyphers = mockTxRun.mock.calls.map((c) => String(c[0]));
    expect(cyphers.some((c) => c.includes('MERGE (n:IOC '))).toBe(true);
    expect(cyphers.some((c) => c.includes('MERGE (n:ThreatActor '))).toBe(true);
    expect(cyphers.some((c) => c.includes(':INDICATES'))).toBe(true);
  });

  it('rejects a plan whose label is not in the closed allowlist', async () => {
    const bad = iocUpsertPlan();
    // @ts-expect-error — intentionally invalid label to prove the allowlist guard fires
    bad.primary.label = 'IOC) DETACH DELETE n //';
    await expect(writer.applyPlans(TENANT, [bad])).rejects.toMatchObject({ code: 'INVALID_GRAPH_LABEL' });
  });

  it('stale-edge prune query is restricted to origin=\'ioc-sync\' edges', async () => {
    await writer.applyPlans(TENANT, [iocUpsertPlan()]);
    const pruneCall = mockTxRun.mock.calls.find((c) => String(c[0]).includes('DELETE r') && String(c[0]).includes('WHERE NOT'));
    expect(pruneCall).toBeDefined();
    expect(String(pruneCall![0])).toContain("origin: 'ioc-sync'");
  });

  // R3 — stale-edge prune must scope BOTH endpoints to the tenant, on both the outgoing
  // (INDICATES) and incoming (e.g. EXPLOITS) branches.

  it('the outgoing (INDICATES) prune query scopes both endpoints to tenantId', async () => {
    await writer.applyPlans(TENANT, [iocUpsertPlan()]);
    const pruneCall = mockTxRun.mock.calls.find((c) => String(c[0]).includes(':INDICATES {origin: \'ioc-sync\'}'));
    expect(pruneCall).toBeDefined();
    const cypher = String(pruneCall![0]);
    expect(cypher).toContain('(a {id: $primaryId, tenantId: $tenantId})');
    expect(cypher).toContain('(b {tenantId: $tenantId})');
  });

  it('the incoming (e.g. EXPLOITS) prune query scopes both endpoints to tenantId', async () => {
    await writer.applyPlans(TENANT, [vulnUpsertPlan()]);
    const pruneCall = mockTxRun.mock.calls.find((c) => String(c[0]).includes(':EXPLOITS {origin: \'ioc-sync\'}'));
    expect(pruneCall).toBeDefined();
    const cypher = String(pruneCall![0]);
    expect(cypher).toContain('(a {tenantId: $tenantId})');
    expect(cypher).toContain('(b {id: $primaryId, tenantId: $tenantId})');
  });

  it('riskScore SET uses a raise-only CASE and never lowers on match', async () => {
    await writer.applyPlans(TENANT, [iocUpsertPlan()]);
    const primaryCall = mockTxRun.mock.calls.find((c) => String(c[0]).includes('MERGE (n:IOC'));
    expect(String(primaryCall![0])).toMatch(/n\.riskScore < row\.props\.baseRiskScore/);
  });

  it('edge merge never SETs r.source on match (never downgrades analyst-confirmed)', async () => {
    await writer.applyPlans(TENANT, [iocUpsertPlan()]);
    const edgeCall = mockTxRun.mock.calls.find((c) => String(c[0]).includes('MERGE (a)-[r:INDICATES]->(b)'));
    expect(edgeCall).toBeDefined();
    // Only the ON CREATE branch sets r.source — the ON MATCH-equivalent SET clause after it must not.
    const cypher = String(edgeCall![0]);
    const afterCreate = cypher.split('ON CREATE SET')[1]!;
    const setClause = afterCreate.split('SET')[1] ?? '';
    expect(setClause).not.toContain('r.source');
  });

  it('delete query is restricted to IOC/Vulnerability labels', async () => {
    await writer.applyPlans(TENANT, [{ action: 'delete', id: IOC_ID }]);
    const deleteCall = mockTxRun.mock.calls.find((c) => String(c[0]).includes('DETACH DELETE n'));
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall![0])).toContain('n:IOC OR n:Vulnerability');
  });

  it('sweepDeleted removes stale ioc-sync IOC/Vulnerability nodes, then orphaned ioc-sync entities', async () => {
    mockSessionRun
      .mockResolvedValueOnce({ records: [{ get: () => 3 }] })
      .mockResolvedValueOnce({ records: [{ get: () => 2 }] });
    const count = await writer.sweepDeleted(TENANT, 'run-1');
    expect(count).toBe(5);
    const [cypher, params] = mockSessionRun.mock.calls[0]!;
    expect(String(cypher)).toContain("origin: 'ioc-sync'");
    expect(String(cypher)).toContain('syncRunId <> $runId');
    expect((params as any).runId).toBe('run-1');
    const [orphanCypher] = mockSessionRun.mock.calls[1]!;
    expect(String(orphanCypher)).toContain("origin: 'ioc-sync'");
    expect(String(orphanCypher)).toContain('NOT (n)--()');
    expect(String(orphanCypher)).not.toContain('DETACH');
  });

  it('rollupEntityRisk uses the INDICATES relationship weight constant, per label', async () => {
    await writer.rollupEntityRisk(TENANT);
    expect(mockSessionRun).toHaveBeenCalledTimes(3); // ThreatActor, Malware, AttackPattern
    for (const call of mockSessionRun.mock.calls) {
      expect((call[1] as any).weight).toBeCloseTo(0.8);
      expect(String(call[0])).not.toContain('$entityIds');
    }
  });

  it('rollupEntityRisk limits to the given entity ids, and is a no-op for an empty list', async () => {
    await writer.rollupEntityRisk(TENANT, []);
    expect(mockSessionRun).not.toHaveBeenCalled();
    await writer.rollupEntityRisk(TENANT, ['e-1']);
    for (const call of mockSessionRun.mock.calls) {
      expect(String(call[0])).toContain('n.id IN $entityIds');
      expect((call[1] as any).entityIds).toEqual(['e-1']);
    }
  });
});
