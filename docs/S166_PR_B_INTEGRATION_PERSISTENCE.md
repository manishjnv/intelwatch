# S166 PR B — Persist integration connectors in Postgres

**Date:** 2026-09-28 · **Branch:** `s166/integration-persistence` · **Module:** `apps/integration-service` (+ one new Prisma model, compose env) · **Roadmap:** Step 15 Phase 1 · **Owner approval:** 2026-09-28

## Why
Tenant SIEM / webhook / ticketing connector configs lived only in an in-memory `Map`, so every deploy or restart
wiped them. Step 15's easy-connect flow is useless if a customer's Splunk/Sentinel connection disappears on the next deploy.

## What changed
| Area | Change | Files |
|---|---|---|
| Schema | New `Integration` model → table `integrations` (id, tenant_id, name, type, enabled, triggers[], config Json, field_mappings Json, created_at, updated_at; index on tenant_id). Pure addition — no other model touched. Secrets inside `config` are already encrypted (`enc:v1:`, PR A) before they are written. | `prisma/schema.prisma` |
| DB client | Prisma client for integration-service (same pattern as ai-enrichment); `@prisma/client ^5.22.0`; lockfile updated. | `src/prisma.ts`, `package.json`, `pnpm-lock.yaml` |
| Store | Write-through cache: create/update/delete write to Postgres first (tenant-scoped `where`), then update the in-memory cache; DB failure → 503 `DB_UNAVAILABLE` (DB detail logged server-side only), cache unchanged. Reads stay synchronous from the cache. `touchIntegration` (after every push) updates cache immediately and writes to DB fire-and-forget. | `src/services/integration-store.ts`, `src/services/integration-row.ts` |
| Startup | `hydrateWithRetry()` loads all rows into the cache (5 attempts, 30 s apart); never throws, so `/health` is served even if Postgres is still starting. Prisma disconnects on shutdown. | `src/index.ts` |
| Callers | Routes, credential rotation now `await` the async mutators. | `src/routes/integrations.ts`, `src/routes/p2-routes.ts`, `src/services/credential-rotation.ts` |
| Compose | `etip_integration` gets `TI_DATABASE_URL` (same value as other services) and waits for `etip_postgres` healthy. | `docker-compose.etip.yml` |

Still in memory (out of scope): delivery logs, webhook deliveries/DLQ, tickets, rate-limiter state, rotation history.

## Deploy
`scripts/deploy-vps.sh` detects the schema hash change, takes a pre-deploy `pg_dump`, and runs `prisma db push` (creates the new
table; aborts if any change would lose data). No migration file. No new env var in `.env` (compose builds the URL from existing Postgres vars).

## Tests
integration-service 440 pass (store rewritten with mocked Prisma: hydrate, DB-first writes, 503 + unchanged cache on failure,
tenant-scoped update/delete, ciphertext-only persistence, hydrate retry, row round-trip). `pnpm -r run typecheck` / `pnpm -r run lint` exit 0;
`pnpm install --frozen-lockfile` OK; `prisma validate` / `generate` OK.

## Review notes
- Opus review: removed 6 unused placeholder columns; wired `TI_DATABASE_URL` (agent flagged it missing — without it prod would start empty);
  stopped returning raw DB error text in 503 responses.
- Row-level security: the new table is tenant-scoped in application code (every query filters `tenant_id`), same as other tables today;
  a DB-level RLS policy comes with Step 4.

## Verify after deploy
1. VPS: `docker exec etip_postgres psql -U etip_user -d etip -c '\d integrations'` → table exists.
2. `docker logs etip_integration | grep hydrated` → "IntegrationStore hydrated from DB".
3. Create a connector in the UI (or API) → redeploy/restart `etip_integration` → connector still listed.

## Rollback
`git revert` the PR B commit. The extra `integrations` table is harmless if left in place (or `DROP TABLE integrations;` after a dump).

## Deployed (2026-09-28)
- master `c44a5f0`, CI/CD run 36345804944 green (test/typecheck/lint/audit, build + push, deploy).
- VPS: HEAD `c44a5f0`, 32/32 etip containers healthy, none stuck; `prisma db push` created table `integrations` (0 rows);
  `etip_integration` logged "IntegrationStore hydrated from DB" on attempt 1; `TI_DATABASE_URL` set in the container.
- No new deploy issues. End-to-end "survives redeploy" check is done through the PR C UI (see `docs/S166_PR_C_INTEGRATIONS_UI.md`).
