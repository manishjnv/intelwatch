/**
 * @module @etip/shared-auth/rls
 * @description Row Level Security (RLS) helpers for PostgreSQL tenant isolation.
 *
 * Provides `withRls()` to wrap Prisma operations in an interactive transaction
 * with SET LOCAL session variables, ensuring RLS policies filter correctly.
 *
 * SET LOCAL scopes variables to the current transaction only — safe with
 * connection pooling (vars do not leak to the next connection user).
 *
 * Usage patterns:
 *
 * 1. Request-scoped (Fastify handlers):
 *    ```ts
 *    const result = await withRls(prisma, { tenantId, isSuperAdmin: false }, (tx) =>
 *      tx.user.findMany()
 *    );
 *    ```
 *
 * 2. Background workers (BullMQ):
 *    ```ts
 *    const ctx = rlsContextFromJob(job); // extract tenantId from job.data
 *    await withRls(prisma, ctx, (tx) => tx.ioc.create({ data: { ... } }));
 *    ```
 *
 * 3. Super admin / migrations / seeds:
 *    ```ts
 *    await withRls(prisma, superAdminRlsContext(), (tx) => tx.user.findMany());
 *    ```
 */

// UUID v4 regex — validates tenant IDs before embedding in SQL
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RlsContext {
  tenantId: string;
  isSuperAdmin: boolean;
}

/**
 * Validate a string is a valid UUID to prevent SQL injection.
 * RLS SET LOCAL embeds tenant_id as a literal — must be safe.
 */
function assertUuid(value: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`Invalid UUID for RLS context: ${value}`);
  }
}

/**
 * Execute a callback within a Prisma interactive transaction that sets
 * RLS session variables via SET LOCAL.
 *
 * @param prisma - Any PrismaClient instance (typed as `any` to avoid hard dep)
 * @param ctx    - Tenant context (tenantId + isSuperAdmin flag)
 * @param fn     - Callback receiving the transaction client (`tx`)
 * @returns      - Whatever `fn` returns
 *
 * SET LOCAL ensures variables are scoped to this transaction.
 * If no tenant context is set, RLS policies return zero rows (fail-safe).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrismaClient = { $transaction: (fn: (tx: any) => Promise<any>) => Promise<any> };

export async function withRls<T>(
  prisma: AnyPrismaClient,
  ctx: RlsContext,
  fn: (tx: unknown) => Promise<T>,
): Promise<T> {
  assertUuid(ctx.tenantId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${ctx.tenantId}'`);
    await tx.$executeRawUnsafe(
      `SET LOCAL app.is_super_admin = '${ctx.isSuperAdmin ? 'true' : 'false'}'`,
    );
    return fn(tx);
  }) as Promise<T>;
}

/**
 * Create an RLS context for super admin operations.
 * Sets is_super_admin = true so all RLS policies pass.
 * Uses the system tenant ID as the tenant context.
 */
export function superAdminRlsContext(tenantId?: string): RlsContext {
  return {
    tenantId: tenantId ?? '00000000-0000-0000-0000-000000000000',
    isSuperAdmin: true,
  };
}

/**
 * Build SQL statements for setting RLS context.
 * Useful for raw SQL operations or non-Prisma database access.
 * Always validate tenantId before calling.
 */
export function rlsSetLocalSql(ctx: RlsContext): string[] {
  assertUuid(ctx.tenantId);
  return [
    `SET LOCAL app.tenant_id = '${ctx.tenantId}'`,
    `SET LOCAL app.is_super_admin = '${ctx.isSuperAdmin ? 'true' : 'false'}'`,
  ];
}

/**
 * All tenant-scoped tables that have RLS policies enabled.
 * Use this for verification scripts and tests.
 */
export const RLS_PROTECTED_TABLES = [
  'users',
  'sessions',
  'api_keys',
  'audit_logs',
  'feed_sources',
  'articles',
  'iocs',
  'threat_actor_profiles',
  'malware_profiles',
  'vulnerability_profiles',
  'tenant_subscriptions',
  'billing_invoices',
  'billing_usage_records',
  'billing_grace_periods',
  'feed_quota_plan_assignments',
  'tenant_feed_subscriptions',
  'tenant_ioc_overlays',
  'tenant_item_consumption',
  'tenant_feature_overrides',
] as const;

/**
 * Global tables that do NOT have RLS (no tenant_id column).
 */
export const RLS_EXCLUDED_TABLES = [
  'tenants',
  'billing_coupons',
  'global_feed_catalog',
  'global_articles',
  'global_iocs',
  'global_ai_config',
  'plan_tier_config',
  'ai_processing_costs',
  'provider_api_keys',
  'subscription_plan_definitions',
  'plan_feature_limits',
] as const;
