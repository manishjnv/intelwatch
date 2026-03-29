-- ============================================================================
-- Migration 0004: Row Level Security (RLS) on all tenant-scoped tables
-- Session: S7 (I-06) — Defense-in-depth tenant data isolation
-- Compliance: SOC 2 CC6.3, ISO 27001 A.9.4.1, GDPR Article 32
--
-- HOW IT WORKS:
--   1. Every tenant-scoped table gets RLS enabled (not forced on owners — gradual rollout)
--   2. SELECT/UPDATE/DELETE policy: tenant_id must match app.tenant_id session var
--   3. INSERT policy: WITH CHECK ensures inserts match tenant context
--   4. Super admin bypass: app.is_super_admin = 'true' skips tenant filter
--   5. SET LOCAL scopes variables to current transaction (connection-pool safe)
--
-- TABLES WITH RLS (19 — all have tenant_id column):
--   users, sessions, api_keys, audit_logs, feed_sources, articles, iocs,
--   threat_actor_profiles, malware_profiles, vulnerability_profiles,
--   tenant_subscriptions, billing_invoices, billing_usage_records,
--   billing_grace_periods, feed_quota_plan_assignments,
--   tenant_feed_subscriptions, tenant_ioc_overlays,
--   tenant_item_consumption, tenant_feature_overrides
--
-- TABLES WITHOUT RLS (12 — global/system, no tenant_id):
--   tenants, billing_coupons, global_feed_catalog, global_articles,
--   global_iocs, global_ai_config, plan_tier_config, ai_processing_costs,
--   provider_api_keys, subscription_plan_definitions, plan_feature_limits
--
-- ROLLBACK: See DOWN section at bottom of this file
-- ============================================================================

-- ── Helper: ensure GUC defaults exist so current_setting never throws ──────
-- These are no-ops if already set; SET LOCAL overrides per-transaction.
-- The second arg `true` to current_setting() returns NULL instead of error
-- when the setting doesn't exist, so policies are safe without this,
-- but we register the GUCs for pg_settings visibility.

-- ============================================================================
-- ENABLE RLS ON ALL TENANT-SCOPED TABLES
-- ============================================================================

-- ── 1. users ─────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- FORCE ROW LEVEL SECURITY omitted — table owner (Prisma) bypasses RLS.
-- Add FORCE after all services adopt withRls() for full enforcement.

CREATE POLICY tenant_isolation_policy ON users
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON users
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 2. sessions ──────────────────────────────────────────────────────────────
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON sessions
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON sessions
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 3. api_keys ──────────────────────────────────────────────────────────────
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON api_keys
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON api_keys
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 4. audit_logs ────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON audit_logs
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON audit_logs
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 5. feed_sources ──────────────────────────────────────────────────────────
ALTER TABLE feed_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON feed_sources
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON feed_sources
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 6. articles ──────────────────────────────────────────────────────────────
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON articles
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON articles
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 7. iocs ──────────────────────────────────────────────────────────────────
ALTER TABLE iocs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON iocs
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON iocs
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 8. threat_actor_profiles ─────────────────────────────────────────────────
ALTER TABLE threat_actor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON threat_actor_profiles
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON threat_actor_profiles
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 9. malware_profiles ──────────────────────────────────────────────────────
ALTER TABLE malware_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON malware_profiles
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON malware_profiles
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 10. vulnerability_profiles ───────────────────────────────────────────────
ALTER TABLE vulnerability_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON vulnerability_profiles
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON vulnerability_profiles
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 11. tenant_subscriptions ─────────────────────────────────────────────────
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant_subscriptions
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON tenant_subscriptions
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 12. billing_invoices ─────────────────────────────────────────────────────
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON billing_invoices
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON billing_invoices
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 13. billing_usage_records ────────────────────────────────────────────────
ALTER TABLE billing_usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON billing_usage_records
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON billing_usage_records
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 14. billing_grace_periods ────────────────────────────────────────────────
ALTER TABLE billing_grace_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON billing_grace_periods
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON billing_grace_periods
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 15. feed_quota_plan_assignments ──────────────────────────────────────────
ALTER TABLE feed_quota_plan_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON feed_quota_plan_assignments
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON feed_quota_plan_assignments
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 16. tenant_feed_subscriptions ────────────────────────────────────────────
ALTER TABLE tenant_feed_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant_feed_subscriptions
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON tenant_feed_subscriptions
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 17. tenant_ioc_overlays ──────────────────────────────────────────────────
ALTER TABLE tenant_ioc_overlays ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant_ioc_overlays
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON tenant_ioc_overlays
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 18. tenant_item_consumption (tenant_id is VARCHAR, not UUID) ─────────────
ALTER TABLE tenant_item_consumption ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant_item_consumption
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON tenant_item_consumption
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
    OR current_setting('app.is_super_admin', true) = 'true'
  );

-- ── 19. tenant_feature_overrides ─────────────────────────────────────────────
ALTER TABLE tenant_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tenant_feature_overrides
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );

CREATE POLICY tenant_isolation_insert_policy ON tenant_feature_overrides
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.is_super_admin', true) = 'true'
  );


-- ============================================================================
-- DOWN MIGRATION (rollback)
-- Run this block to fully reverse RLS if needed:
-- ============================================================================
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON users;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON users;
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON sessions;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON sessions;
-- ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON api_keys;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON api_keys;
-- ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON audit_logs;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON audit_logs;
-- ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON feed_sources;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON feed_sources;
-- ALTER TABLE feed_sources DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON articles;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON articles;
-- ALTER TABLE articles DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON iocs;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON iocs;
-- ALTER TABLE iocs DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON threat_actor_profiles;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON threat_actor_profiles;
-- ALTER TABLE threat_actor_profiles DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON malware_profiles;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON malware_profiles;
-- ALTER TABLE malware_profiles DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON vulnerability_profiles;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON vulnerability_profiles;
-- ALTER TABLE vulnerability_profiles DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_subscriptions;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON tenant_subscriptions;
-- ALTER TABLE tenant_subscriptions DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON billing_invoices;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON billing_invoices;
-- ALTER TABLE billing_invoices DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON billing_usage_records;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON billing_usage_records;
-- ALTER TABLE billing_usage_records DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON billing_grace_periods;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON billing_grace_periods;
-- ALTER TABLE billing_grace_periods DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON feed_quota_plan_assignments;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON feed_quota_plan_assignments;
-- ALTER TABLE feed_quota_plan_assignments DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_feed_subscriptions;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON tenant_feed_subscriptions;
-- ALTER TABLE tenant_feed_subscriptions DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_ioc_overlays;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON tenant_ioc_overlays;
-- ALTER TABLE tenant_ioc_overlays DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_item_consumption;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON tenant_item_consumption;
-- ALTER TABLE tenant_item_consumption DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_feature_overrides;
-- DROP POLICY IF EXISTS tenant_isolation_insert_policy ON tenant_feature_overrides;
-- ALTER TABLE tenant_feature_overrides DISABLE ROW LEVEL SECURITY;
