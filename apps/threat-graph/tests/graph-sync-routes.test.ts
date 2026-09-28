import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '99999999-9999-9999-9999-999999999999';

let allow = true;

vi.mock('@etip/shared-auth', () => ({
  verifyAccessToken: () => ({ sub: 'user-1', tenantId: TENANT, role: 'admin' }),
  hasPermission: () => allow,
}));

import { graphSyncRoutes } from '../src/routes/graph-sync.js';
import type { GraphReconciler } from '../src/services/graph-reconciler.js';

describe('graph-sync admin routes', () => {
  let app: FastifyInstance;
  let reconciler: GraphReconciler;

  beforeAll(async () => {
    reconciler = {
      getState: vi.fn().mockResolvedValue({ watermark: null, lastRunAt: null, lastRunType: null, lastFullSyncAt: null, lastCounts: null, lastError: null }),
      triggerFullSync: vi.fn(),
    } as unknown as GraphReconciler;

    app = Fastify({ logger: false });
    await app.register(graphSyncRoutes(reconciler), { prefix: '/api/v1/graph' });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  it('GET /sync/status is scoped to the caller tenant', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/graph/sync/status', headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(200);
    expect(reconciler.getState).toHaveBeenCalledWith(TENANT);
    expect(reconciler.getState).not.toHaveBeenCalledWith(OTHER_TENANT);
  });

  it('POST /sync/run triggers a full sweep for the caller tenant and returns 202', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/graph/sync/run', headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(202);
    expect(reconciler.triggerFullSync).toHaveBeenCalledWith(TENANT);
  });

  it('POST /sync/run returns 409 when reconciler reports one already in progress', async () => {
    const { AppError } = await import('@etip/shared-utils');
    (reconciler.triggerFullSync as any).mockImplementationOnce(() => {
      throw new AppError(409, 'A graph sync is already in progress for this tenant', 'SYNC_IN_PROGRESS');
    });
    const res = await app.inject({ method: 'POST', url: '/api/v1/graph/sync/run', headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(409);
  });

  it('rejects without graph:admin permission', async () => {
    allow = false;
    const res = await app.inject({ method: 'GET', url: '/api/v1/graph/sync/status', headers: { authorization: 'Bearer t' } });
    expect(res.statusCode).toBe(403);
    allow = true;
  });
});
