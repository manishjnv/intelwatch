import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pino from 'pino';

const mockRun = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock('../src/driver.js', () => ({
  createSession: () => ({ run: mockRun, close: mockClose }),
}));

const mockGetMigrationStatus = vi.fn();
vi.mock('../src/migrations/runner.js', () => ({
  getMigrationStatus: () => mockGetMigrationStatus(),
}));

import { GraphReconciler } from '../src/services/graph-reconciler.js';
import type { IocClient } from '../src/clients/ioc-client.js';
import type { GraphSyncWriter } from '../src/services/graph-sync.js';

const mockLogger: pino.Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), child: vi.fn() } as any;

const TENANT = '11111111-1111-1111-1111-111111111111';

function stateRecord(props: Record<string, unknown> | null) {
  if (!props) return { records: [] };
  return { records: [{ get: () => ({ properties: props }) }] };
}

describe('GraphReconciler', () => {
  let client: IocClient;
  let writer: GraphSyncWriter;
  let reconciler: GraphReconciler;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMigrationStatus.mockReturnValue({ applied: [], skipped: ['001', '002'] });

    client = {
      listTenants: vi.fn().mockResolvedValue([{ tenantId: TENANT, iocCount: 1, lastUpdatedAt: null }]),
      listIocs: vi.fn().mockResolvedValue({ items: [], total: 0, rawCount: 0 }),
      getIoc: vi.fn(),
    } as unknown as IocClient;

    writer = {
      applyPlans: vi.fn().mockResolvedValue({ nodesUpserted: 0, entitiesUpserted: 0, edgesMerged: 0, edgesPruned: 0, nodesDeleted: 0 }),
      sweepDeleted: vi.fn().mockResolvedValue(0),
      rollupEntityRisk: vi.fn().mockResolvedValue(undefined),
    } as unknown as GraphSyncWriter;

    reconciler = new GraphReconciler(client, writer, { intervalMs: 900_000, fullSyncIntervalMs: 86_400_000, pageSize: 500 }, mockLogger);

    // Lease acquire: MERGE ... RETURN l.owner — return the reconciler's own owner (mocked via echo).
    mockRun.mockImplementation((cypher: string, params: any) => {
      if (String(cypher).includes('_GraphLock')) return Promise.resolve({ records: [{ get: () => params.owner }] });
      if (String(cypher).includes('_GraphSyncState') && String(cypher).startsWith('MATCH')) return Promise.resolve(stateRecord(null));
      return Promise.resolve({ records: [] });
    });
  });

  it('refuses to run when migrations have not succeeded, logging once', async () => {
    mockGetMigrationStatus.mockReturnValue(null);
    await reconciler.runOnce();
    await reconciler.runOnce();
    expect(client.listTenants).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  const IOC = {
    id: '22222222-2222-4222-8222-222222222222', tenantId: TENANT, iocType: 'domain', value: 'evil.example',
    severity: 'high', tlp: 'amber', confidence: 80, lifecycle: 'active', tags: [], threatActors: [],
    malwareFamilies: [], mitreAttack: [], feedSourceId: null, enrichmentData: null,
    firstSeen: '2026-09-01T00:00:00.000Z', lastSeen: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z',
  };

  it('runs a full sweep when no prior state exists, then sweeps deleted nodes', async () => {
    (client.listIocs as any).mockResolvedValue({ items: [IOC], total: 1, rawCount: 1 });
    await reconciler.runOnce();
    expect(writer.sweepDeleted).toHaveBeenCalledWith(TENANT, expect.any(String));
    expect(writer.rollupEntityRisk).toHaveBeenCalledWith(TENANT);
  });

  it('never sweeps when a full run reads nothing (outage / tenant mismatch must not wipe the graph)', async () => {
    (client.listIocs as any).mockResolvedValue({ items: [], total: 0, rawCount: 0 });
    await reconciler.runOnce();
    expect(writer.sweepDeleted).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ applied: 0 }), expect.stringContaining('sweep skipped'));
  });

  it('never sweeps when a full run applies less than 90% of the reported total', async () => {
    (client.listIocs as any).mockResolvedValue({ items: [IOC], total: 5, rawCount: 1 });
    await reconciler.runOnce();
    expect(writer.sweepDeleted).not.toHaveBeenCalled();
  });

  it('never sweeps when records were fetched but all mapped to null (e.g. bad CVE ids) — applied stays 0', async () => {
    const badCve = { ...IOC, id: '44444444-4444-4444-4444-444444444444', iocType: 'cve', value: 'not-a-cve' };
    (client.listIocs as any).mockResolvedValue({ items: [badCve], total: 1, rawCount: 1 });
    await reconciler.runOnce();
    expect(writer.sweepDeleted).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ fetched: 1, applied: 0 }), expect.stringContaining('sweep skipped'));
  });

  it('paging continues past a page whose records were all invalid/mismatched (rawCount, not items.length, drives paging)', async () => {
    const small = new GraphReconciler(client, writer, { intervalMs: 900_000, fullSyncIntervalMs: 86_400_000, pageSize: 1 }, mockLogger);
    (client.listIocs as any)
      .mockResolvedValueOnce({ items: [], total: 2, rawCount: 1 }) // page 1: one raw record, but filtered out — items.length=0 must NOT end paging
      .mockResolvedValueOnce({ items: [IOC], total: 2, rawCount: 1 }) // page 2: still full (rawCount === pageSize) — keep going
      .mockResolvedValueOnce({ items: [], total: 2, rawCount: 0 }); // page 3: rawCount < pageSize — stop
    await small.runOnce();
    expect(client.listIocs).toHaveBeenCalledTimes(3);
  });

  it('runs incremental (no sweep) when a recent full sync already happened', async () => {
    const recentFull = new Date().toISOString();
    mockRun.mockImplementation((cypher: string, params: any) => {
      if (String(cypher).includes('_GraphLock')) return Promise.resolve({ records: [{ get: () => params.owner }] });
      if (String(cypher).includes('_GraphSyncState') && String(cypher).startsWith('MATCH')) {
        return Promise.resolve(stateRecord({ watermark: recentFull, lastRunAt: recentFull, lastRunType: 'full', lastFullSyncAt: recentFull, lastCounts: null, lastError: null }));
      }
      return Promise.resolve({ records: [] });
    });

    await reconciler.runOnce();
    expect(writer.sweepDeleted).not.toHaveBeenCalled();
    expect(client.listIocs).toHaveBeenCalledWith(TENANT, expect.objectContaining({ updatedSince: recentFull }));
  });

  it('watermark saved after a run is runStartedAt minus 5 minutes', async () => {
    const before = Date.now();
    await reconciler.runOnce();
    const after = Date.now();

    const saveCall = mockRun.mock.calls.find((c) => String(c[0]).includes('MERGE (s:_GraphSyncState'));
    expect(saveCall).toBeDefined();
    const watermark = new Date((saveCall![1] as any).props.watermark).getTime();
    expect(watermark).toBeGreaterThanOrEqual(before - 5 * 60_000 - 1000);
    expect(watermark).toBeLessThanOrEqual(after - 5 * 60_000 + 1000);
  });

  it('isolates per-tenant failures — one tenant failing does not stop others', async () => {
    (client.listTenants as any).mockResolvedValue([
      { tenantId: TENANT, iocCount: 1, lastUpdatedAt: null },
      { tenantId: '99999999-9999-9999-9999-999999999999', iocCount: 1, lastUpdatedAt: null },
    ]);
    let call = 0;
    (client.listIocs as any).mockImplementation(() => {
      call++;
      if (call === 1) return Promise.reject(new Error('boom'));
      return Promise.resolve({ items: [], total: 0, rawCount: 0 });
    });

    await reconciler.runOnce();
    expect(mockLogger.error).toHaveBeenCalled();
    // second tenant still reached rollupEntityRisk
    expect(writer.rollupEntityRisk).toHaveBeenCalledWith('99999999-9999-9999-9999-999999999999');
  });

  it('lease prevents a concurrent runOnce from doing work', async () => {
    mockRun.mockImplementation((cypher: string) => {
      if (String(cypher).includes('_GraphLock')) return Promise.resolve({ records: [{ get: () => 'someone-else' }] }); // lease held by another owner
      return Promise.resolve({ records: [] });
    });
    await reconciler.runOnce();
    expect(client.listTenants).not.toHaveBeenCalled();
  });

  it('triggerFullSync throws 409 when a sync is already in progress for the tenant (fast pre-check)', async () => {
    (client.listIocs as any).mockImplementation(() => new Promise(() => {})); // never resolves — stays "running"
    await reconciler.triggerFullSync(TENANT);
    await expect(reconciler.triggerFullSync(TENANT)).rejects.toMatchObject({ statusCode: 409 });
  });

  // R4 — per-tenant lease shared by scheduled and manual runs.

  it('triggerFullSync throws 409 when the tenant lease is held elsewhere (e.g. another replica)', async () => {
    mockRun.mockImplementation((cypher: string, params: any) => {
      if (String(cypher).includes('_GraphLock')) return Promise.resolve({ records: [{ get: () => 'other-replica-owner' }] });
      if (String(cypher).includes('_GraphSyncState') && String(cypher).startsWith('MATCH')) return Promise.resolve(stateRecord(null));
      return Promise.resolve({ records: [] });
    });
    await expect(reconciler.triggerFullSync(TENANT)).rejects.toMatchObject({ statusCode: 409, code: 'SYNC_IN_PROGRESS' });
    expect(client.listIocs).not.toHaveBeenCalled();
  });

  it('scheduled pass skips a tenant whose lease is held elsewhere, without failing the pass', async () => {
    (client.listTenants as any).mockResolvedValue([{ tenantId: TENANT, iocCount: 1, lastUpdatedAt: null }]);
    let leaseCalls = 0;
    mockRun.mockImplementation((cypher: string, params: any) => {
      if (String(cypher).includes('_GraphLock')) {
        leaseCalls++;
        // First call acquires the global lock for this instance; second (the tenant lease) is held elsewhere.
        if (leaseCalls === 1) return Promise.resolve({ records: [{ get: () => params.owner }] });
        return Promise.resolve({ records: [{ get: () => 'other-replica-owner' }] });
      }
      if (String(cypher).includes('_GraphSyncState') && String(cypher).startsWith('MATCH')) return Promise.resolve(stateRecord(null));
      return Promise.resolve({ records: [] });
    });
    await reconciler.runOnce();
    expect(client.listIocs).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT }), expect.stringContaining('lease held elsewhere'));
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('renews the tenant (and global) lease once per page', async () => {
    const small = new GraphReconciler(client, writer, { intervalMs: 900_000, fullSyncIntervalMs: 86_400_000, pageSize: 1 }, mockLogger);
    (client.listIocs as any)
      .mockResolvedValueOnce({ items: [IOC], total: 2, rawCount: 1 })
      .mockResolvedValueOnce({ items: [], total: 2, rawCount: 0 });
    await small.runOnce();
    const renewCalls = mockRun.mock.calls.filter((c) => String(c[0]).includes('SET l.expiresAt = $until'));
    // 2 pages × (tenant lease renew + global lease renew) = 4
    expect(renewCalls.length).toBe(4);
  });

  it('releases the tenant lease on success and on failure', async () => {
    const releaseSpy = () => mockRun.mock.calls.filter((c) => String(c[0]).includes('SET l.expiresAt = 0'));
    await reconciler.runOnce();
    expect(releaseSpy().length).toBeGreaterThan(0); // global + tenant release on success

    vi.clearAllMocks();
    mockGetMigrationStatus.mockReturnValue({ applied: [], skipped: [] });
    mockRun.mockImplementation((cypher: string, params: any) => {
      if (String(cypher).includes('_GraphLock')) return Promise.resolve({ records: [{ get: () => params.owner }] });
      if (String(cypher).includes('_GraphSyncState') && String(cypher).startsWith('MATCH')) return Promise.resolve(stateRecord(null));
      return Promise.resolve({ records: [] });
    });
    (client.listIocs as any).mockRejectedValue(new Error('boom'));
    await reconciler.runOnce();
    expect(releaseSpy().length).toBeGreaterThan(0); // still released after the per-tenant failure
  });
});
