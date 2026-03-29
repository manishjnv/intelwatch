-- ============================================================================
-- RLS Verification Script
-- Run against the database to confirm RLS policies are correctly configured.
-- Usage: psql -U etip_user -d etip -f scripts/verify-rls.sql
-- ============================================================================

-- ── 1. Verify RLS is enabled on all tenant-scoped tables ─────────────────────
-- Note: forcerowsecurity is false (Option A — gradual rollout).
-- Table owner (Prisma DB user) bypasses RLS. Non-owner roles are filtered.
-- After all services adopt withRls(), add FORCE for full enforcement.
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'sessions', 'api_keys', 'audit_logs',
    'feed_sources', 'articles', 'iocs',
    'threat_actor_profiles', 'malware_profiles', 'vulnerability_profiles',
    'tenant_subscriptions', 'billing_invoices', 'billing_usage_records',
    'billing_grace_periods', 'feed_quota_plan_assignments',
    'tenant_feed_subscriptions', 'tenant_ioc_overlays',
    'tenant_item_consumption', 'tenant_feature_overrides'
  )
ORDER BY tablename;

-- ── 2. Verify RLS is NOT enabled on global tables ────────────────────────────
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants', 'billing_coupons', 'global_feed_catalog',
    'global_articles', 'global_iocs', 'global_ai_config',
    'plan_tier_config', 'ai_processing_costs', 'provider_api_keys',
    'subscription_plan_definitions', 'plan_feature_limits'
  )
ORDER BY tablename;

-- ── 3. List all RLS policies ─────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expr,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ── 4. Count policies per table (expect 2 per tenant-scoped table) ───────────
SELECT
  tablename,
  count(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- ── 5. Functional test: tenant isolation ─────────────────────────────────────
-- NOTE: Replace UUIDs with actual tenant IDs from your database.
-- Uncomment and run manually.
--
-- BEGIN;
--   -- Set tenant A context
--   SET LOCAL app.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
--   SET LOCAL app.is_super_admin = 'false';
--   SELECT count(*) AS tenant_a_users FROM users;
--
--   -- Set tenant B context
--   SET LOCAL app.tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
--   SET LOCAL app.is_super_admin = 'false';
--   SELECT count(*) AS tenant_b_users FROM users;
--
--   -- Super admin bypass
--   SET LOCAL app.is_super_admin = 'true';
--   SELECT count(*) AS all_users FROM users;
-- ROLLBACK;
--
-- ── 6. Fail-safe test: no context = no rows ──────────────────────────────────
-- BEGIN;
--   -- Do NOT set app.tenant_id — should return 0 rows
--   SELECT count(*) AS should_be_zero FROM users;
-- ROLLBACK;
