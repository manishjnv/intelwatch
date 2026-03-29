import { describe, it, expect, vi } from 'vitest';
import {
  withRls,
  superAdminRlsContext,
  rlsSetLocalSql,
  RLS_PROTECTED_TABLES,
  RLS_EXCLUDED_TABLES,
  type RlsContext,
} from '../src/rls.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000';

function createMockPrisma() {
  const execCalls: string[] = [];
  const mockTx = {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      execCalls.push(sql);
      return 0;
    }),
    user: {
      findMany: vi.fn(async () => [{ id: '1', tenantId: TENANT_A }]),
    },
    ioc: {
      create: vi.fn(async (args: unknown) => args),
    },
  };

  const mockPrisma = {
    $transaction: vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  };

  return { mockPrisma, mockTx, execCalls };
}

// ─── withRls ──────────────────────────────────────────────────────────────────

describe('withRls', () => {
  it('sets tenant_id and is_super_admin before executing callback', async () => {
    const { mockPrisma, execCalls } = createMockPrisma();
    const ctx: RlsContext = { tenantId: TENANT_A, isSuperAdmin: false };

    await withRls(mockPrisma, ctx, async (tx) => {
      const client = tx as ReturnType<typeof createMockPrisma>['mockTx'];
      return client.user.findMany();
    });

    expect(execCalls).toHaveLength(2);
    expect(execCalls[0]).toBe(`SET LOCAL app.tenant_id = '${TENANT_A}'`);
    expect(execCalls[1]).toBe("SET LOCAL app.is_super_admin = 'false'");
  });

  it('sets is_super_admin = true for super admin context', async () => {
    const { mockPrisma, execCalls } = createMockPrisma();
    const ctx: RlsContext = { tenantId: TENANT_A, isSuperAdmin: true };

    await withRls(mockPrisma, ctx, async () => 'ok');

    expect(execCalls[1]).toBe("SET LOCAL app.is_super_admin = 'true'");
  });

  it('returns the callback result', async () => {
    const { mockPrisma } = createMockPrisma();
    const ctx: RlsContext = { tenantId: TENANT_A, isSuperAdmin: false };

    const result = await withRls(mockPrisma, ctx, async (tx) => {
      const client = tx as ReturnType<typeof createMockPrisma>['mockTx'];
      return client.user.findMany();
    });

    expect(result).toEqual([{ id: '1', tenantId: TENANT_A }]);
  });

  it('rejects invalid UUID to prevent SQL injection', async () => {
    const { mockPrisma } = createMockPrisma();
    const maliciousTenantId = "'; DROP TABLE users; --";

    await expect(
      withRls(mockPrisma, { tenantId: maliciousTenantId, isSuperAdmin: false }, async () => 'ok'),
    ).rejects.toThrow('Invalid UUID for RLS context');
  });

  it('rejects empty string tenant ID', async () => {
    const { mockPrisma } = createMockPrisma();

    await expect(
      withRls(mockPrisma, { tenantId: '', isSuperAdmin: false }, async () => 'ok'),
    ).rejects.toThrow('Invalid UUID for RLS context');
  });

  it('uses SET LOCAL (not SET) for connection pool safety', async () => {
    const { mockPrisma, execCalls } = createMockPrisma();

    await withRls(mockPrisma, { tenantId: TENANT_A, isSuperAdmin: false }, async () => 'ok');

    for (const sql of execCalls) {
      expect(sql).toMatch(/^SET LOCAL /);
    }
  });

  it('wraps callback in $transaction', async () => {
    const { mockPrisma } = createMockPrisma();

    await withRls(mockPrisma, { tenantId: TENANT_A, isSuperAdmin: false }, async () => 'ok');

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it('propagates callback errors', async () => {
    const { mockPrisma } = createMockPrisma();

    await expect(
      withRls(mockPrisma, { tenantId: TENANT_A, isSuperAdmin: false }, async () => {
        throw new Error('DB error');
      }),
    ).rejects.toThrow('DB error');
  });

  it('tenant A context does not set tenant B id', async () => {
    const { mockPrisma, execCalls } = createMockPrisma();

    await withRls(mockPrisma, { tenantId: TENANT_A, isSuperAdmin: false }, async () => 'ok');

    expect(execCalls[0]).toContain(TENANT_A);
    expect(execCalls[0]).not.toContain(TENANT_B);
  });
});

// ─── superAdminRlsContext ─────────────────────────────────────────────────────

describe('superAdminRlsContext', () => {
  it('returns system tenant with isSuperAdmin true by default', () => {
    const ctx = superAdminRlsContext();
    expect(ctx.tenantId).toBe(SYSTEM_TENANT);
    expect(ctx.isSuperAdmin).toBe(true);
  });

  it('accepts custom tenant ID for cross-tenant super admin access', () => {
    const ctx = superAdminRlsContext(TENANT_B);
    expect(ctx.tenantId).toBe(TENANT_B);
    expect(ctx.isSuperAdmin).toBe(true);
  });
});

// ─── rlsSetLocalSql ──────────────────────────────────────────────────────────

describe('rlsSetLocalSql', () => {
  it('generates correct SET LOCAL statements', () => {
    const stmts = rlsSetLocalSql({ tenantId: TENANT_A, isSuperAdmin: false });
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toBe(`SET LOCAL app.tenant_id = '${TENANT_A}'`);
    expect(stmts[1]).toBe("SET LOCAL app.is_super_admin = 'false'");
  });

  it('generates super admin statements', () => {
    const stmts = rlsSetLocalSql({ tenantId: TENANT_A, isSuperAdmin: true });
    expect(stmts[1]).toBe("SET LOCAL app.is_super_admin = 'true'");
  });

  it('rejects invalid UUID', () => {
    expect(() =>
      rlsSetLocalSql({ tenantId: 'not-a-uuid', isSuperAdmin: false }),
    ).toThrow('Invalid UUID for RLS context');
  });
});

// ─── Table lists ──────────────────────────────────────────────────────────────

describe('RLS table constants', () => {
  it('RLS_PROTECTED_TABLES has 19 tenant-scoped tables', () => {
    expect(RLS_PROTECTED_TABLES).toHaveLength(19);
  });

  it('RLS_EXCLUDED_TABLES has 11 global tables', () => {
    expect(RLS_EXCLUDED_TABLES).toHaveLength(11);
  });

  it('no overlap between protected and excluded tables', () => {
    const overlap = RLS_PROTECTED_TABLES.filter((t) =>
      (RLS_EXCLUDED_TABLES as readonly string[]).includes(t),
    );
    expect(overlap).toHaveLength(0);
  });

  it('protected tables include all expected tenant-scoped tables', () => {
    const expected = [
      'users', 'sessions', 'api_keys', 'audit_logs', 'feed_sources',
      'articles', 'iocs', 'threat_actor_profiles', 'malware_profiles',
      'vulnerability_profiles', 'tenant_subscriptions', 'billing_invoices',
      'billing_usage_records', 'billing_grace_periods',
      'feed_quota_plan_assignments', 'tenant_feed_subscriptions',
      'tenant_ioc_overlays', 'tenant_item_consumption', 'tenant_feature_overrides',
    ];
    for (const table of expected) {
      expect(RLS_PROTECTED_TABLES).toContain(table);
    }
  });

  it('excluded tables include plan definitions (global, no tenant_id)', () => {
    expect(RLS_EXCLUDED_TABLES).toContain('subscription_plan_definitions');
    expect(RLS_EXCLUDED_TABLES).toContain('plan_feature_limits');
  });
});
