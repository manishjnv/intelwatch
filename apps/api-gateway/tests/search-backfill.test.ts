/**
 * @module api-gateway/tests/search-backfill
 * @description Tests for POST /api/v1/gateway/search/backfill (S154/S155):
 *   - auth/authz: no token 401, non-super-admin 403
 *   - body validation: bad body 400, unknown tenantId 404
 *   - paging across >500 rows, offboarded tenants excluded
 *   - dryRun does not enqueue, idempotent jobIds across two runs
 *   - a row that fails toIocDocument is skipped, others still enqueued
 *   - per-tenant + total counts, withRls called correctly per tenant
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { iocIndexJobId } from '@etip/shared-utils';

// ─── Hoisted mocks ─────────────────────────────────────────────────────

const { authState, mockPrisma, mockQueue, withRlsCalls, addBulkCalls } = vi.hoisted(() => {
  const authState = {
    user: null as Record<string, unknown> | null,
  };

  const mockPrisma = {
    tenant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    ioc: {
      findMany: vi.fn(),
    },
  };

  const addBulkCallsInner: unknown[] = [];
  const mockQueue = {
    addBulk: vi.fn(async (jobs: unknown[]) => {
      addBulkCallsInner.push(...jobs);
      return jobs;
    }),
    close: vi.fn(async () => {}),
  };

  const withRlsCallsInner: Array<{ tenantId: string; isSuperAdmin: boolean }> = [];

  return {
    authState,
    mockPrisma,
    mockQueue,
    withRlsCalls: withRlsCallsInner,
    addBulkCalls: addBulkCallsInner,
  };
});

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

vi.mock('../src/plugins/auth.js', () => ({
  authenticate: async (req: Record<string, unknown>) => {
    if (!authState.user) {
      const { AppError } = await import('@etip/shared-utils');
      throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
    }
    req.user = authState.user;
  },
  getUser: (req: Record<string, unknown>) => req.user,
}));

vi.mock('@etip/shared-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@etip/shared-auth')>();
  return {
    ...actual,
    withRls: vi.fn(async (_prisma: unknown, ctx: { tenantId: string; isSuperAdmin: boolean }, fn: (tx: unknown) => Promise<unknown>) => {
      withRlsCalls.push(ctx);
      return fn(mockPrisma);
    }),
  };
});

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => mockQueue),
}));

process.env['TI_REDIS_URL'] ??= 'redis://localhost:6379';

// Real @etip/user-service pulls in a live PrismaClient — stub it so audit
// logging in tests never touches a real DB connection.
vi.mock('@etip/user-service', () => ({
  AuditLogger: vi.fn(() => ({ log: vi.fn() })),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────
import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from '../src/plugins/error-handler.js';
import { searchBackfillRoutes } from '../src/routes/search-backfill.js';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  await app.register(searchBackfillRoutes, { prefix: '/api/v1/gateway' });
  await app.ready();
  return app;
}

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeIoc(id: string, tenantId: string, opts: Partial<{ severity: string; updatedAt: Date }> = {}) {
  const updatedAt = opts.updatedAt ?? new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    tenantId,
    feedSourceId: null,
    iocType: 'ip',
    value: `1.2.3.${id}`,
    normalizedValue: `1.2.3.${id}`,
    severity: opts.severity ?? 'medium',
    tlp: 'amber',
    confidence: 50,
    lifecycle: 'new',
    tags: [],
    mitreAttack: [],
    malwareFamilies: [],
    threatActors: [],
    enrichmentData: null,
    enrichedAt: null,
    firstSeen: new Date('2026-01-01T00:00:00.000Z'),
    lastSeen: new Date('2026-01-01T00:00:00.000Z'),
    archivedAt: null,
    updatedAt,
  };
}

describe('POST /api/v1/gateway/search/backfill', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    authState.user = null;
    withRlsCalls.length = 0;
    addBulkCalls.length = 0;
    vi.clearAllMocks();
    mockPrisma.tenant.findMany.mockReset();
    mockPrisma.tenant.findUnique.mockReset();
    mockPrisma.ioc.findMany.mockReset();
    mockQueue.addBulk.mockClear();
    app = await buildTestApp();
  });

  it('returns 401 with no token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/gateway/search/backfill', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for a non-super-admin', async () => {
    authState.user = { sub: 'u1', tenantId: TENANT_A, role: 'tenant_admin' };
    const res = await app.inject({ method: 'POST', url: '/api/v1/gateway/search/backfill', payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('returns 400 for a bad body', async () => {
    authState.user = { sub: 'admin', tenantId: TENANT_A, role: 'super_admin' };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/gateway/search/backfill',
      payload: { tenantId: 'not-a-uuid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for an explicit unknown tenantId', async () => {
    authState.user = { sub: 'admin', tenantId: TENANT_A, role: 'super_admin' };
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/gateway/search/backfill',
      payload: { tenantId: TENANT_A },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for an offboarded explicit tenantId', async () => {
    authState.user = { sub: 'admin', tenantId: TENANT_A, role: 'super_admin' };
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_A, offboardedAt: new Date() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/gateway/search/backfill',
      payload: { tenantId: TENANT_A },
    });
    expect(res.statusCode).toBe(404);
  });

  it('excludes offboarded tenants from the where clause when no tenantId given', async () => {
    authState.user = { sub: 'admin', tenantId: TENANT_A, role: 'super_admin' };
    mockPrisma.tenant.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: 'POST', url: '/api/v1/gateway/search/backfill', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ offboardedAt: null }) }),
    );
  });

  it('pages across more than 500 rows for one tenant and enqueues all', async () => {
    authState.user = { sub: 'admin', tenantId: TENANT_A, role: 'super_admin' };
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, offboardedAt: null }]);

    const total = 1203;
    const rows = Array.from({ length: total }, (_, i) => makeIoc(String(i + 1).padStart(6, '0'), TENANT_A));
    let call = 0;
    mockPrisma.ioc.findMany.mockImplementation(async () => {
      const page = rows.slice(call * 500, call * 500 + 500);
      call += 1;
      return page;
    });

    const res = await app.inject({ method: 'POST', url: '/api/v1/gateway/search/backfill', payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(mockPrisma.ioc.findMany).toHaveBeenCalledTimes(3);
    expect(body.data.totals.dbCount).toBe(total);
    expect(body.data.totals.enqueued).toBe(total);
    expect(addBulkCalls.length).toBe(total);

    // cursor pagination: 2nd+ call must use cursor+skip
    const secondCallArgs = mockPrisma.ioc.findMany.mock.calls[1]![0];
    expect(secondCallArgs.cursor).toEqual({ id: rows[499]!.id });
    expect(secondCallArgs.skip).toBe(1);
    const firstCallArgs = mockPrisma.ioc.findMany.mock.calls[0]![0];
    expect(firstCallArgs.cursor).toBeUndefined();
    expect(firstCallArgs.where).toEqual({ tenantId: TENANT_A });
    expect(firstCallArgs.orderBy).toEqual({ id: 'asc' });
    expect(firstCallArgs.take).toBe(500);
  });

  it('dryRun reads and counts but never enqueues', async () => {
    authState.user = { sub: 'admin', tenantId: TENANT_A, role: 'super_admin' };
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, offboardedAt: null }]);
    mockPrisma.ioc.findMany.mockResolvedValueOnce([makeIoc('1', TENANT_A), makeIoc('2', TENANT_A)]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/gateway/search/backfill',
      payload: { dryRun: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.dryRun).toBe(true);
    expect(body.data.totals.dbCount).toBe(2);
    expect(body.data.totals.enqueued).toBe(0);
    expect(mockQueue.addBulk).not.toHaveBeenCalled();
  });

  it('running it twice produces identical jobIds', async () => {
    authState.user = { sub: 'admin', tenantId: TENANT_A, role: 'super_admin' };
    const row = makeIoc('1', TENANT_A);
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, offboardedAt: null }]);
    mockPrisma.ioc.findMany.mockResolvedValueOnce([row]);

    await app.inject({ method: 'POST', url: '/api/v1/gateway/search/backfill', payload: {} });
    const firstJobId = (addBulkCalls[0] as { opts: { jobId: string } }).opts.jobId;
    addBulkCalls.length = 0;

    mockPrisma.ioc.findMany.mockReset();
    mockPrisma.ioc.findMany.mockResolvedValueOnce([row]);
    await app.inject({ method: 'POST', url: '/api/v1/gateway/search/backfill', payload: {} });
    const secondJobId = (addBulkCalls[0] as { opts: { jobId: string } }).opts.jobId;

    expect(firstJobId).toBe(secondJobId);
    expect(firstJobId).toBe(iocIndexJobId('index', row.id, row.updatedAt));
  });

  it('skips a row that fails toIocDocument, still enqueues the rest', async () => {
    authState.user = { sub: 'admin', tenantId: TENANT_A, role: 'super_admin' };
    mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A, offboardedAt: null }]);
    const bad = makeIoc('1', TENANT_A, { severity: 'bogus' });
    const good = makeIoc('2', TENANT_A);
    mockPrisma.ioc.findMany.mockResolvedValueOnce([bad, good]).mockResolvedValueOnce([]);

    const res = await app.inject({ method: 'POST', url: '/api/v1/gateway/search/backfill', payload: {} });
    const body = res.json();
    expect(body.data.totals.skipped).toBe(1);
    expect(body.data.totals.enqueued).toBe(1);
    expect(addBulkCalls.length).toBe(1);
  });

  it('returns correct per-tenant and total counts for 2 tenants, and calls withRls per tenant', async () => {
    authState.user = { sub: 'admin', tenantId: TENANT_A, role: 'super_admin' };
    mockPrisma.tenant.findMany.mockResolvedValue([
      { id: TENANT_A, offboardedAt: null },
      { id: TENANT_B, offboardedAt: null },
    ]);
    mockPrisma.ioc.findMany
      .mockResolvedValueOnce([makeIoc('1', TENANT_A), makeIoc('2', TENANT_A)])
      .mockResolvedValueOnce([makeIoc('3', TENANT_B)]);

    const res = await app.inject({ method: 'POST', url: '/api/v1/gateway/search/backfill', payload: {} });
    const body = res.json();
    expect(body.data.tenants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tenantId: TENANT_A, dbCount: 2, enqueued: 2, skipped: 0 }),
        expect.objectContaining({ tenantId: TENANT_B, dbCount: 1, enqueued: 1, skipped: 0 }),
      ]),
    );
    expect(body.data.totals).toEqual({ dbCount: 3, enqueued: 3, skipped: 0 });

    expect(withRlsCalls).toEqual(
      expect.arrayContaining([
        { tenantId: TENANT_A, isSuperAdmin: false },
        { tenantId: TENANT_B, isSuperAdmin: false },
      ]),
    );
  });
});
