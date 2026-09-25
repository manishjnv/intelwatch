# Step 4 — Least-privilege DB roles + real RLS (Phase 1, S160) 🔒

**Written:** 2026-09-25. **Status:** spec, not started. **Parent:** docs/ROADMAP_S149_PLUS.md §3 step 4, §4 S160. **Needs:** Step 3 done (so its new tables get policies too). **Security-adjacent:** adversarial review before every push.

---

## 1. Goal

1. No service connects to Postgres as a superuser.
2. Schema changes run under a separate **owner/migration** role that apps never use.
3. For services that serve one tenant per request, Postgres itself refuses to return or write another tenant's rows, even if the app code forgets a `WHERE tenant_id = …`.

## 2. Why now

- Today RLS is decoration. The app role is a superuser, and superusers skip RLS always (S147_APP_WIRING_FOLLOWUPS.md "Other notes").
- A superuser app role can also drop tables, read server files and run shell commands through `COPY … PROGRAM`. One SQL injection = full VPS database compromise.
- Step 10 (AI agents that query data for a tenant) must not depend only on every query being written correctly.

## 3. Current state (verified in code 2026-09-25; live DB must be re-checked with §9 commands first)

### 3.1 Roles and ownership

| Fact | Evidence |
|---|---|
| `etip_user` is the Postgres image's `POSTGRES_USER`, i.e. the **bootstrap superuser** | `docker-compose.etip.yml:18` |
| All 12 DB-using containers connect as that user | `docker-compose.etip.yml:236, 290, 346, 396, 446, 490, 534, 578, 646, 865, 910, 988` |
| Schema is created by `prisma db push` as the same user, so it **owns** every table, enum and the trigger function from migration 0003 | `deploy.yml:197`; `prisma/migrations/0003_add_designation_and_guards/migration.sql:5–17` |
| Postgres image init only creates two extensions | `docker/postgres/init.sql:1–3` |
| No runtime DDL in any service (good: apps only need DML) | grep of `apps/*/src` for `CREATE/ALTER TABLE/TRUNCATE` → 0 |
| Ops scripts use `psql -U etip_user` | `scripts/seed-free-tier-feeds.sh:36,62`, `scripts/session81-vps-activate.sh:49,62` |
| No database backup script in the repo | grep for `pg_dump` in `scripts/`, `.github/`, compose → 0 |

### 3.2 RLS policies today

- `prisma/migrations/0004_row_level_security/migration.sql` enables RLS and adds two policies (`tenant_isolation_policy` for read/update/delete, `tenant_isolation_insert_policy` with `WITH CHECK`) on **19 tables** (header lines 13–19).
- Policy shape (line 44–48): `tenant_id = current_setting('app.tenant_id', true)::uuid OR current_setting('app.is_super_admin', true) = 'true'`. `tenant_item_consumption` compares as text (lines 313–327).
- `FORCE ROW LEVEL SECURITY` is **not** set on purpose (line 41–42): the table owner skips RLS.
- Deploy never runs `prisma/migrations` (DEPLOYMENT_RCA.md:452–454). 0004 was applied **by hand** in S122 (DEPLOYMENT_RCA.md:705). Anything added since then has no policy.

**Tenant tables with no RLS** (have `tenant_id`, not in 0004), from `prisma/schema.prisma`:

| Table | Model line | Note |
|---|---|---|
| `mfa_enforcement_policies` | 187 | `tenant_id` nullable; `scope = 'platform'` row has NULL |
| `sso_configs` | 197 | |
| `scim_tokens` | 984 | token lookup happens before tenant is known |
| `access_reviews` | 1002 | |
| `compliance_reports` | 1022 | `tenant_id` nullable (platform reports) |
| `webhook_subscriptions` | 1043 | |
| All Step-3 tables | — | `alert_*`, `alerts`, `integration*`, `export_*`, `drp_*`, `analytics_trend_points` |

Global tables without `tenant_id` (`tenants`, `global_*`, `plan_*`, `billing_coupons`, `ai_processing_costs`, `provider_api_keys`, `subscription_plan_definitions`, `plan_feature_limits`) stay without RLS. `tenants` is readable by every app role; see decision E4.

### 3.3 How tenant context is set today

- Helper: `withRls(prisma, ctx, fn)` in `packages/shared-auth/src/rls.ts:65–80`. It opens an interactive transaction and runs `SET LOCAL app.tenant_id = '<uuid>'` via `$executeRawUnsafe` (UUID-checked at `:44–48`).
- Gateway plugin `apps/api-gateway/src/plugins/rls.ts:28–47`, registered at `apps/api-gateway/src/app.ts:109–110`, adds `req.withRls()`.
- **Nothing calls it.** grep for `withRls(` / `req.withRls` in `apps/*/src` outside the plugin → 0 hits. All ~580 Prisma calls (grep estimate: gateway 65, user-service 158, user-mgmt 93, ingestion 54, normalization 53, ioc 38, actor 29, vuln 25, billing 25, malware 23, customization 12+9 raw, enrichment 9) run with **no** tenant context.
- So if we simply switch the app to a non-bypass role today, every RLS table returns **0 rows** and the product goes blank. The rollout must be staged.
- `RLS_PROTECTED_TABLES` (`rls.ts:111–131`) and `scripts/verify-rls.sql` list only the 19 old tables.
- Tests only mock Prisma (`packages/shared-auth/__tests__/rls.test.ts`). CI has no Postgres service (`deploy.yml:36–80`).

### 3.4 Code paths that must see more than one tenant

| Path | Evidence | Needs |
|---|---|---|
| Login / email lookup before tenant is known | `apps/user-service/src/repository.ts:57–58` (`findUserByEmail`), `break-glass-repository.ts:16–18`, `email-verification-repository.ts:9–22` | explicit super-admin context |
| Global pipeline + tenant overlay fan-out | `apps/normalization/src/workers/global-normalize-worker.ts`, `global-enrich-worker.ts`, `services/tenant-overlay-service.ts:151` | bypass role |
| Offboarding purge | `apps/user-management-service/src/services/offboarding-purge-worker.ts:66–132` | bypass role |
| Billing admin list | `apps/billing-service/src/repository.ts` `getAllTenantPlans` | super-admin context |

## 4. Target design

| Role | LOGIN | SUPERUSER | BYPASSRLS | Rights | Used by |
|---|---|---|---|---|---|
| `etip_user` (exists) | yes | yes | yes | all | **Break-glass only.** Humans with `psql`. No container env |
| `etip_owner` (new) | yes | no | no | owns all objects; `CREATE` on schema `public` | deploy schema push + policy apply only |
| `etip_worker` (new) | yes | no | **yes** | `SELECT/INSERT/UPDATE/DELETE` on tables, `USAGE/SELECT` on sequences | pipeline workers, purge, and **every service during stage A** |
| `etip_app` (new) | yes | no | no | same DML as worker | tenant-scoped services after stage C |

Why keep `etip_user`: Postgres 16 will not remove `SUPERUSER` from the bootstrap role (verify: `ALTER ROLE etip_user NOSUPERUSER` should fail). We keep it, but no service has its password.

Since `etip_app` does not own the tables, RLS applies to it without `FORCE`.

### 4.1 Tenant context: Prisma extension (replaces unused `withRls` calls)

```ts
// packages/shared-auth/src/tenant-prisma.ts (new; shared package — needs owner OK, decision E2)
export const tenantContext = new AsyncLocalStorage<{ tenantId: string; superAdmin: boolean }>();
export function withTenantRls<C extends PrismaClient>(base: C) {
  return base.$extends({ query: { $allModels: { async $allOperations({ args, query }) {
    const ctx = tenantContext.getStore();
    if (!ctx) throw new AppError(500, 'Query without tenant context', 'RLS_NO_CONTEXT');
    const [, , result] = await base.$transaction([
      base.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, true)`,
      base.$executeRaw`SELECT set_config('app.is_super_admin', ${String(ctx.superAdmin)}, true)`,
      query(args),
    ]);
    return result;
  } } } });
}
```
- Fastify: after auth, a `preHandler` hook calls `tenantContext.enterWith({ tenantId, superAdmin })`.
- BullMQ: wrap each job handler in `tenantContext.run({ tenantId: job.data.tenantId, … }, fn)`.
- Login-style lookups: `tenantContext.run({ tenantId: SYSTEM_TENANT, superAdmin: true }, …)`, kept in a short, reviewed list.
- `set_config(…, true)` uses bound parameters (no string building) and is transaction-local.
- Fail loud: no context = error, not "0 rows". A silent empty page looks like data loss.

### 4.2 Policy fixes

`policies.sql` rewrites every policy as:
```sql
USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
       OR current_setting('app.is_super_admin', true) = 'true')
```
Why `NULLIF`: after a `SET LOCAL`/`set_config(…, true)` transaction ends, Postgres keeps the custom setting as an **empty string** on that pooled connection. `''::uuid` then throws "invalid input syntax for type uuid" instead of returning 0 rows. The CI test in §7 proves it either way.

Nullable tables: `mfa_enforcement_policies` also allows `tenant_id IS NULL` for reads (platform default). `compliance_reports` NULL rows are super-admin only.

## 5. Flow

```
request ─► auth (JWT) ─► preHandler: tenantContext.enterWith({tenantId})
        ─► route ─► prisma (extended) ─► BEGIN; set_config x2; query; COMMIT
        ─► Postgres as etip_app ─► RLS policy filters by app.tenant_id

pipeline job ─► prisma (plain) ─► Postgres as etip_worker (BYPASSRLS) ─► app WHERE clauses only
deploy ─► prisma db push as etip_owner ─► psql -f prisma/rls/policies.sql as etip_owner
```

## 6. Changes per module

### 6.1 Stage A + B — S160a (ops/prisma, M) 🔒

| File | Change |
|---|---|
| `prisma/rls/roles.sql` (new) | One-time, run by hand as `etip_user`: create `etip_owner`, `etip_worker`, `etip_app`; grants; `ALTER DEFAULT PRIVILEGES FOR ROLE etip_owner GRANT … TO etip_worker, etip_app`; a `DO` block that runs `ALTER TABLE/SEQUENCE/TYPE/FUNCTION … OWNER TO etip_owner` for every object in `public` (use a loop, **not** `REASSIGN OWNED BY etip_user` — that fails for the bootstrap role because it also owns system objects) |
| `prisma/rls/policies.sql` (new) | Idempotent: for each tenant table `ENABLE ROW LEVEL SECURITY`, `DROP POLICY IF EXISTS` + `CREATE POLICY` with `NULLIF`. Covers the 19 old tables, the 6 missing ones, and all Step-3 tables. Down block at the end, commented |
| `prisma/migrations/0004_row_level_security/migration.sql` | Leave as history; add a header line "superseded by prisma/rls/policies.sql" |
| `.github/workflows/deploy.yml:195–206` | Push schema as owner: `docker exec -e TI_DATABASE_URL="$TI_DB_OWNER_URL" etip_api npx prisma db push …`; then `docker exec -i etip_postgres psql "$TI_DB_OWNER_URL_LOCAL" -v ON_ERROR_STOP=1 < prisma/rls/policies.sql`. Owner URL read from the VPS `.env` |
| `docker-compose.etip.yml` (12 blocks listed in §3.1) | `TI_DATABASE_URL: ${TI_DB_WORKER_URL:?…}` for all. Plus the Step-3 services |
| `.github/workflows/deploy.yml` (new job `rls-test`) | `services: postgres:16`; run roles.sql, db push as owner, policies.sql, then `pnpm exec vitest run scripts/tests/rls.test.ts` |
| `scripts/tests/rls.test.ts` (new), `scripts/tests/rls-seed.sql` (new) | Tests in §7 |
| `scripts/verify-rls.sql` | Replace the fixed table list with the catalog query in §9 |

Result of stage A: no service is a superuser; behaviour does not change (worker still bypasses RLS).

### 6.2 Stage C — tenant context, per service

| Session | Module | Files | Size |
|---|---|---|---|
| S160b | shared-auth 🔒 | `packages/shared-auth/src/tenant-prisma.ts` (new), `src/index.ts` export, `src/rls.ts` (switch `withRls` to `set_config` params; update `RLS_PROTECTED_TABLES` or delete it in favour of the catalog check), tests | S |
| S160c | ioc-intelligence | `src/prisma.ts` (wrap client), `src/app.ts` (preHandler), workers (wrap jobs), compose URL → `TI_DB_APP_URL` | S |
| S160d | threat-actor-intel | same pattern | S |
| S160e | malware-intel | same | S |
| S160f | vulnerability-intel | same | S |
| S160g | billing-service | same + `getAllTenantPlans` in super-admin context | S |
| S160h | alerting-service | same (new tables from Step 3) | S |
| S160i | integration-service | same | S |
| S160j | drp-service | same | S |
| S160k | customization | same; global tables unaffected; raw queries in `command-center-queries.ts:64–95` run inside the extension's transaction | M |
| S160l–m | api-gateway + user-service | same; login/SCIM/API-key lookups in super-admin context; remove the unused `req.withRls` plugin or make it call the new helper | L → 2 |
| — | ingestion, normalization, ai-enrichment, user-management-service | **stay on `etip_worker`** (cross-tenant by design). Revisit user-management-service later | — |

Each Stage C session: one service, flip only that service's compose URL, deploy, watch, then the next.

## 7. Tests

**`scripts/tests/rls.test.ts`** (real Postgres 16 in CI; seed two tenants A and B with one row in every tenant table):
1. As `etip_app`, no context → every tenant table returns 0 rows and **does not error**.
2. Context A → sees only A rows; `SELECT … WHERE id = <B row>` → 0 rows.
3. Context A → `INSERT … tenant_id = B` fails with "new row violates row-level security policy".
4. Context A → `UPDATE`/`DELETE` of a B row affects 0 rows.
5. One pooled connection: run context A, then B, then none → no leak between them (proves the `NULLIF` fix).
6. `app.is_super_admin = 'true'` → sees both tenants.
7. As `etip_worker` → sees both tenants without context.
8. As `etip_app` / `etip_worker`: `CREATE TABLE`, `DROP TABLE iocs`, `ALTER TABLE iocs DISABLE ROW LEVEL SECURITY`, `COPY … TO PROGRAM` → all fail.
9. **Catalog check** (catches future tables): every `public` table with a `tenant_id` column has `relrowsecurity = true` and at least one policy. Fails CI otherwise.

**Unit (per service, Stage C):** route test with a JWT for tenant A asking for B's record → 404; job without `tenantId` → `RLS_NO_CONTEXT`.

**shared-auth:** extension throws without context; passes `set_config` params (no string building); works inside `tenantContext.run`.

## 8. Rollout on the VPS (zero downtime)

All steps are additive until step 5. Run at low traffic.

| # | Action | Downtime |
|---|---|---|
| 0 | `git tag safe-point-2026-MM-DD-s160`. Backup: `docker exec etip_postgres pg_dump -U etip_user -Fc etip > /opt/intelwatch/backups/pre-s160.dump` (no backup job exists in the repo — decision E7) | none |
| 1 | Add `TI_DB_OWNER_PASSWORD`, `TI_DB_WORKER_PASSWORD`, `TI_DB_APP_PASSWORD` and the three URLs to `/opt/intelwatch/.env` (`openssl rand -hex 24` each) | none |
| 2 | `docker exec -i etip_postgres psql -U etip_user -d etip -v ON_ERROR_STOP=1 < prisma/rls/roles.sql` (roles, grants, ownership). `ALTER … OWNER` takes a short exclusive lock per table; set `lock_timeout = '5s'` and re-run if it times out | a few ms per table |
| 3 | Check: §9 queries 1–3 | none |
| 4 | Apply `policies.sql` as owner. Apps are still superuser, so nothing changes for users | none |
| 5 | Deploy the S160a PR: services recreate with `TI_DB_WORKER_URL` (same restart as any deploy; health checks gate it) | same as a normal deploy |
| 6 | Watch 24 h: `docker logs <svc> 2>&1 | grep -i "permission denied\|must be owner"` → 0 | none |
| 7 | Stage C, one service per session/deploy (§6.2) | one container restart each |

## 9. Acceptance checks

```bash
PSQL="docker exec etip_postgres psql -U etip_user -d etip -tAc"
# 1. Roles are right
$PSQL "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'etip%' ORDER BY 1"
#    etip_app|f|f  etip_owner|f|f  etip_user|t|t  etip_worker|f|t
# 2. No app connection uses the superuser
$PSQL "SELECT usename, count(*) FROM pg_stat_activity WHERE datname='etip' AND backend_type='client backend' GROUP BY 1"
#    etip_user appears only for your own psql session
# 3. Owner owns everything
$PSQL "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tableowner <> 'etip_owner'"   # 0
# 4. Every tenant table has RLS + a policy
$PSQL "SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='tenant_id'
       JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' WHERE c.relkind='r'
       AND (NOT c.relrowsecurity OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid))"   # empty
# 5. Cross-tenant read fails as etip_app (use two real tenant ids)
docker exec -e PGPASSWORD="$TI_DB_APP_PASSWORD" etip_postgres psql -h 127.0.0.1 -U etip_app -d etip -tAc \
 "BEGIN; SELECT set_config('app.tenant_id','$TENANT_A',true); SELECT count(*) FROM iocs WHERE tenant_id='$TENANT_B'; ROLLBACK;"   # 0
# 6. App role cannot do DDL
docker exec -e PGPASSWORD="$TI_DB_APP_PASSWORD" etip_postgres psql -h 127.0.0.1 -U etip_app -d etip -c "DROP TABLE iocs"   # ERROR: must be owner
# 7. Product still works: log in, open IOCs, alerts, billing; counts match before/after
```

## 10. Rollback

| Level | How | Time |
|---|---|---|
| One service (Stage C) | Set its `TI_DATABASE_URL` back to `${TI_DB_WORKER_URL}`; `docker compose -p etip -f docker-compose.etip.yml up -d --no-deps <svc>` | < 1 min |
| All services (Stage A) | Point all URLs back to the `etip_user` URL in `.env`; `up -d` the app containers | ~2 min |
| Policies | Run the down block of `policies.sql` as owner (`DROP POLICY …; ALTER TABLE … DISABLE ROW LEVEL SECURITY`) | seconds |
| Ownership | Same `DO` loop with `OWNER TO etip_user`, run as `etip_user` | seconds |
| Code | `git reset --hard safe-point-2026-MM-DD-s160` and redeploy | one deploy |
| Data | `pg_restore` from step 0 (only if something wrote bad data; RLS changes do not alter rows) | minutes |

## 11. Session breakdown

| S | Module | Work | Size |
|---|---|---|---|
| 160a | ops / prisma 🔒 | Roles, ownership, idempotent policies (19 + 6 + Step-3), deploy as owner, all services → `etip_worker`, CI `rls-test` job | M |
| 160b | shared-auth 🔒 | Tenant Prisma extension + AsyncLocalStorage; fix `withRls` | S |
| 160c–k | one service each (§6.2) | Wrap client, set context, flip to `etip_app` | S each (customization M) |
| 160l–m | api-gateway + user-service 🔒 | Same, plus reviewed super-admin lookups | L → 2 |

"Step 4 is green" = 160a + 160b done and at least the four intel services + alerting/integration/drp on `etip_app`. The gateway can follow during Phase 2.

## 12. Owner decisions needed

| # | Question | Recommendation |
|---|---|---|
| E1 | Keep `etip_user` as a break-glass superuser (no container has its password)? | Yes. Rotate its password after S160a; keep it in a password manager |
| E2 | Add `tenant-prisma.ts` to `@etip/shared-auth` (shared package change)? | Yes. 10+ services need it; copying would break the "3 copies → extract" rule |
| E3 | Services that stay on the bypass role for good: ingestion, normalization, ai-enrichment, user-management-service (purge) | Accept, with a comment in compose explaining why |
| E4 | Add RLS to `tenants` (a tenant sees only its own row)? | Not now: login joins `tenant`. Revisit after the gateway moves |
| E5 | Replace one-off migration SQL with `prisma/rls/policies.sql` re-applied on every deploy? | Yes. It is idempotent, and `db push` never runs migration files |
| E6 | Pipeline jobs without a `tenantId` in the payload: fail, or treat as global? | Fail loudly (`RLS_NO_CONTEXT`) on `etip_app` services |
| E7 | There is no DB backup job in the repo. Add a daily `pg_dump` to MinIO or off-box before S160? | Yes, a small ops session before S160a |

## 13. Risks

| Risk | Mitigation |
|---|---|
| A service flipped to `etip_app` without full context coverage shows empty pages | Extension throws on missing context; flip one service at a time; watch logs for `RLS_NO_CONTEXT` |
| `''::uuid` errors on reused connections | `NULLIF` in every policy; CI test 5 |
| Extra round trips (BEGIN, 2× set_config, COMMIT) per query slow hot paths | Measure p95 per service before/after; hot bulk paths can use one `withRls` interactive transaction for many queries |
| Existing `$transaction(async tx => …)` code bypasses the extension's per-query wrapper | Grep each service for `$transaction(` in its Stage C session; set context inside those with `withRls` |
| `ALTER … OWNER` waits behind a long query and blocks traffic | `lock_timeout = '5s'`, run at low traffic, retry |
| `db push` as non-superuser fails (e.g. enum owned by `etip_user`) | Ownership loop covers types and functions; CI job runs the exact same push as `etip_owner` |
| A new table added later has no policy | CI catalog check (test 9) fails the build |
| Superuser still reachable: `.env` holds `TI_POSTGRES_PASSWORD`, and today 12 app blocks build their URL from it (`docker-compose.etip.yml:236…988`) | After S160a no app block references it; only the postgres container (`:19`, used at first init) does |
| `app.is_super_admin = 'true'` is a bypass switch any code can set | Only the helper sets it; review the short list of super-admin call sites in each Stage C PR |
