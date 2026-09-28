import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pino from 'pino';

let capturedProcessor: ((job: { id: string; data: unknown }) => Promise<void>) | null = null;

vi.mock('bullmq', () => ({
  Queue: vi.fn(),
  Worker: vi.fn().mockImplementation((_name: string, processor: any) => {
    capturedProcessor = processor;
    return { on: vi.fn() };
  }),
}));

import { loadConfig } from '../src/config.js';
import { createGraphSyncWorker } from '../src/queue.js';
import type { GraphService } from '../src/service.js';
import type { IocSyncService } from '../src/services/ioc-sync-service.js';

const mockLogger: pino.Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), child: vi.fn() } as any;

const TENANT = '11111111-1111-1111-1111-111111111111';
const IOC_ID = '22222222-2222-2222-2222-222222222222';

describe('graph sync worker — job routing', () => {
  let service: GraphService;
  let iocSync: IocSyncService;

  beforeEach(() => {
    loadConfig({
      TI_NODE_ENV: 'test', TI_THREAT_GRAPH_PORT: '3012', TI_THREAT_GRAPH_HOST: '0.0.0.0',
      TI_DATABASE_URL: 'postgresql://user:pass@localhost:5432/etip',
      TI_REDIS_URL: 'redis://:pass@localhost:6379/0',
      TI_NEO4J_URL: 'bolt://neo4j:pass@localhost:7687',
      TI_JWT_SECRET: 'a'.repeat(32), TI_SERVICE_JWT_SECRET: 'b'.repeat(16),
    });

    service = { createNode: vi.fn(), createRelationship: vi.fn(), triggerPropagation: vi.fn() } as unknown as GraphService;
    iocSync = { syncIoc: vi.fn() } as unknown as IocSyncService;

    createGraphSyncWorker({ service, iocSync, logger: mockLogger });
  });

  it('sync_ioc calls IocSyncService.syncIoc and never triggers BFS propagation (rollup covers entity risk)', async () => {
    (iocSync.syncIoc as any).mockResolvedValue({ nodeId: IOC_ID, riskScore: 70 });
    await capturedProcessor!({ id: '1', data: { action: 'sync_ioc', tenantId: TENANT, iocId: IOC_ID } });

    expect(iocSync.syncIoc).toHaveBeenCalledWith(TENANT, IOC_ID);
    expect(service.triggerPropagation).not.toHaveBeenCalled();
  });

  it('sync_ioc does not propagate when riskScore is 0', async () => {
    (iocSync.syncIoc as any).mockResolvedValue({ nodeId: IOC_ID, riskScore: 0 });
    await capturedProcessor!({ id: '1', data: { action: 'sync_ioc', tenantId: TENANT, iocId: IOC_ID } });
    expect(service.triggerPropagation).not.toHaveBeenCalled();
  });

  it('legacy upsert_node with a raw IOC type (e.g. "domain") routes through sync_ioc', async () => {
    (iocSync.syncIoc as any).mockResolvedValue({ nodeId: IOC_ID, riskScore: 40 });
    await capturedProcessor!({
      id: '1',
      data: { action: 'upsert_node', tenantId: TENANT, nodeType: 'domain', nodeId: IOC_ID, properties: {} },
    });

    expect(iocSync.syncIoc).toHaveBeenCalledWith(TENANT, IOC_ID);
    expect(service.createNode).not.toHaveBeenCalled();
  });

  it('upsert_node with a valid NODE_TYPES nodeType keeps the existing direct-write path', async () => {
    (service.createNode as any).mockResolvedValue({ id: IOC_ID, riskScore: 0 });
    await capturedProcessor!({
      id: '1',
      data: { action: 'upsert_node', tenantId: TENANT, nodeType: 'ThreatActor', nodeId: IOC_ID, properties: { name: 'APT1' } },
    });

    expect(service.createNode).toHaveBeenCalledWith(TENANT, { nodeType: 'ThreatActor', properties: { name: 'APT1', id: IOC_ID } });
    expect(iocSync.syncIoc).not.toHaveBeenCalled();
  });

  it('drops a job with an invalid relationshipType instead of throwing', async () => {
    await capturedProcessor!({
      id: '1',
      data: { action: 'create_relationship', tenantId: TENANT, fromNodeId: IOC_ID, toNodeId: IOC_ID, relationshipType: 'NOT_A_TYPE' },
    });
    expect(service.createRelationship).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('create_relationship with a valid payload calls service.createRelationship unchanged', async () => {
    await capturedProcessor!({
      id: '1',
      data: { action: 'create_relationship', tenantId: TENANT, fromNodeId: IOC_ID, toNodeId: IOC_ID, relationshipType: 'USES', confidence: 0.9 },
    });
    expect(service.createRelationship).toHaveBeenCalledWith(TENANT, {
      fromNodeId: IOC_ID, toNodeId: IOC_ID, type: 'USES', confidence: 0.9, source: 'auto-detected', properties: undefined,
    });
  });

  it('propagate with a valid payload calls service.triggerPropagation unchanged', async () => {
    await capturedProcessor!({ id: '1', data: { action: 'propagate', tenantId: TENANT, nodeId: IOC_ID } });
    expect(service.triggerPropagation).toHaveBeenCalledWith(TENANT, IOC_ID, expect.any(Number));
  });
});
