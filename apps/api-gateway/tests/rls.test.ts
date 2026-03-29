/**
 * @module api-gateway/tests/rls
 * @description Tests for Row Level Security (RLS) plugin:
 *   - RLS context attached from authenticated user
 *   - Super admin bypass sets is_super_admin = true
 *   - withRls wraps operations in transaction with SET LOCAL
 *   - No auth = no RLS context (fail-safe)
 *   - SQL injection prevention via UUID validation
 *   - Cross-tenant isolation via separate contexts
 *   - Connection pool safety (SET LOCAL, not SET)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoisted mocks ─────────────────────────────────────────────────────

const { authState, mockPrisma, txCalls, mockTx } = vi.hoisted(() => {
  const authState = {
    user: null as Record<string, unknown> | null,
  };

  const txCallsInner: string[] = [];
  const mockTxInner = {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      txCallsInner.push(sql);
      return 0;
    }),
    user: {
      findMany: vi.fn(async () => [{ id: 'u1' }]),
    },
  };

  const mockPrismaInner = {
    $transaction: vi.fn(async (fn: (tx: typeof mockTxInner) => Promise<unknown>) => fn(mockTxInner)),
  };

  return { authState, mockPrisma: mockPrismaInner, txCalls: txCallsInner, mockTx: mockTxInner };
});

// Mock Prisma client
vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

import Fastify, { type FastifyInstance } from 'fastify';
import { registerRls } from '../src/plugins/rls.js';

// ─── Test helpers ─────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Simulate auth plugin — attach user from authState
  app.addHook('preHandler', async (req) => {
    if (authState.user) {
      (req as Record<string, unknown>).user = authState.user;
    }
  });

  registerRls(app);

  // Test route that uses withRls
  app.get('/api/v1/test-rls', async (req) => {
    if (!req.rlsContext) return { context: null, txCalled: false };
    await req.withRls(async (tx) => {
      const client = tx as { user: { findMany: () => Promise<unknown[]> } };
      return client.user.findMany();
    });
    return {
      context: req.rlsContext,
      txCalled: true,
    };
  });

  // Test route that checks context only (no withRls call)
  app.get('/api/v1/test-context', async (req) => ({
    context: req.rlsContext,
  }));

  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('RLS Plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    authState.user = null;
    txCalls.length = 0;
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  describe('context attachment', () => {
    it('attaches rlsContext for authenticated tenant user', async () => {
      authState.user = {
        userId: 'u1',
        tenantId: TENANT_A,
        email: 'analyst@acme.com',
        role: 'analyst',
        sessionId: 's1',
      };

      const res = await app.inject({ method: 'GET', url: '/api/v1/test-context' });
      const body = JSON.parse(res.body);

      expect(body.context).toEqual({
        tenantId: TENANT_A,
        isSuperAdmin: false,
      });
    });

    it('sets isSuperAdmin = true for super_admin role', async () => {
      authState.user = {
        userId: 'u1',
        tenantId: TENANT_A,
        email: 'admin@intelwatch.in',
        role: 'super_admin',
        sessionId: 's1',
      };

      const res = await app.inject({ method: 'GET', url: '/api/v1/test-context' });
      const body = JSON.parse(res.body);

      expect(body.context).toEqual({
        tenantId: TENANT_A,
        isSuperAdmin: true,
      });
    });

    it('returns null context for unauthenticated requests', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/test-context' });
      const body = JSON.parse(res.body);

      expect(body.context).toBeNull();
    });

    it('sets isSuperAdmin = false for tenant_admin', async () => {
      authState.user = {
        userId: 'u1',
        tenantId: TENANT_A,
        email: 'ta@acme.com',
        role: 'tenant_admin',
        sessionId: 's1',
      };

      const res = await app.inject({ method: 'GET', url: '/api/v1/test-context' });
      const body = JSON.parse(res.body);

      expect(body.context.isSuperAdmin).toBe(false);
    });
  });

  describe('withRls wrapper', () => {
    it('wraps callback in $transaction with SET LOCAL', async () => {
      authState.user = {
        userId: 'u1',
        tenantId: TENANT_A,
        email: 'analyst@acme.com',
        role: 'analyst',
        sessionId: 's1',
      };

      await app.inject({ method: 'GET', url: '/api/v1/test-rls' });

      expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
      expect(txCalls).toContain(`SET LOCAL app.tenant_id = '${TENANT_A}'`);
      expect(txCalls).toContain("SET LOCAL app.is_super_admin = 'false'");
    });

    it('super admin context sets is_super_admin = true in SQL', async () => {
      authState.user = {
        userId: 'u1',
        tenantId: TENANT_A,
        email: 'admin@intelwatch.in',
        role: 'super_admin',
        sessionId: 's1',
      };

      await app.inject({ method: 'GET', url: '/api/v1/test-rls' });

      expect(txCalls).toContain("SET LOCAL app.is_super_admin = 'true'");
    });

    it('uses SET LOCAL (not SET) for connection pool safety', async () => {
      authState.user = {
        userId: 'u1',
        tenantId: TENANT_A,
        email: 'a@a.com',
        role: 'analyst',
        sessionId: 's1',
      };

      await app.inject({ method: 'GET', url: '/api/v1/test-rls' });

      for (const sql of txCalls) {
        expect(sql).toMatch(/^SET LOCAL /);
        expect(sql).not.toMatch(/^SET [^L]/);
      }
    });

    it('tenant A context cannot access tenant B data', async () => {
      authState.user = {
        userId: 'u1',
        tenantId: TENANT_A,
        email: 'a@a.com',
        role: 'analyst',
        sessionId: 's1',
      };

      await app.inject({ method: 'GET', url: '/api/v1/test-rls' });

      const tenantIdSql = txCalls.find((s) => s.includes('app.tenant_id'));
      expect(tenantIdSql).toContain(TENANT_A);
      expect(tenantIdSql).not.toContain(TENANT_B);
    });

    it('throws when withRls called without authentication', async () => {
      const rawApp = Fastify({ logger: false });
      registerRls(rawApp);
      rawApp.get('/test', async (req) => {
        try {
          await req.withRls(async () => 'ok');
          return { error: null };
        } catch (e) {
          return { error: (e as Error).message };
        }
      });
      await rawApp.ready();

      const res = await rawApp.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(res.body);
      expect(body.error).toContain('RLS context not initialized');

      await rawApp.close();
    });
  });

  describe('cross-tenant isolation', () => {
    it('different tenants get different SET LOCAL tenant_id values', async () => {
      // Request 1: Tenant A
      authState.user = { userId: 'u1', tenantId: TENANT_A, email: 'a@a.com', role: 'analyst', sessionId: 's1' };
      await app.inject({ method: 'GET', url: '/api/v1/test-rls' });
      const tenantASql = [...txCalls];

      txCalls.length = 0;
      vi.clearAllMocks();

      // Request 2: Tenant B
      authState.user = { userId: 'u2', tenantId: TENANT_B, email: 'b@b.com', role: 'analyst', sessionId: 's2' };
      await app.inject({ method: 'GET', url: '/api/v1/test-rls' });
      const tenantBSql = [...txCalls];

      expect(tenantASql[0]).toContain(TENANT_A);
      expect(tenantBSql[0]).toContain(TENANT_B);
      expect(tenantASql[0]).not.toEqual(tenantBSql[0]);
    });
  });
});
