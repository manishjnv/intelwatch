# S148 — Offboarding purge: external-datastore deletion

## What changed
Completed the three stubbed deletions in the tenant offboarding purge worker
([offboarding-purge-worker.ts](../apps/user-management-service/src/services/offboarding-purge-worker.ts)).
Purging an offboarded tenant now also removes its **graph data (Neo4j)**,
**search indices (Elasticsearch)**, and **cached plan/quota data (Redis)** — not
just its Postgres rows.

## Why
`purgeTenant()` hard-deleted all Postgres tables for a tenant but left three
`console.log("Would delete …")` stubs for Neo4j, Elasticsearch, and Redis. An
offboarded/purged tenant's graph nodes, ES indices, and cached plan limits
survived the purge — a data-retention and correctness gap.

## Files touched (module: user-management-service only)
- **NEW** `src/services/external-purge.ts` — `ExternalPurger` class.
  - `purge(tenantId)` deletes across all three stores, isolating failures per store.
  - `fromEnv(env)` builds real clients from `TI_REDIS_URL` / `TI_NEO4J_URL` /
    `TI_ES_URL` (+`TI_ES_USERNAME`/`TI_ES_PASSWORD`); a store with no URL is a no-op.
  - Redis: `KEYS plan_cache:${id}* / quota:${id}*` → `DEL`.
  - Neo4j: `MATCH (n {tenantId:$id}) DETACH DELETE n` (bound param, tenant-scoped).
  - ES: `indices.delete('etip_${id}_iocs_*')` after a get to count matches.
- **MOD** `src/services/offboarding-purge-worker.ts` — `runPurgeCheck` /
  `purgeTenant` take an optional `ExternalPurger`; external counts are merged into
  `deletedCounts` (`graphNodes`, `esIndices`, `cacheKeys`) and any external errors
  are recorded on the `offboarding.purged` audit entry. **The Postgres purge runs
  regardless** — external stores are best-effort; PG is authoritative.
- **MOD** `package.json` — added `@elastic/elasticsearch`, `@etip/shared-cache`,
  `ioredis`, `neo4j-driver`.
- **MOD** `tsconfig.json` — added `@etip/shared-cache` project reference.
- **NEW** `tests/external-purge.test.ts` — 5 tests (happy path, per-store error
  isolation, null clients no-op, no-match ES, empty-tenantId guard).

## Safety
- **Cross-tenant blast radius:** `tenant.id` is a Postgres UUID (fixed 36-char);
  no UUID prefixes another, so the `KEYS` globs and ES/Neo4j patterns cannot match
  a different tenant. Verified against `prisma/schema.prisma`.
- **Empty-tenantId guard:** `purge()` throws on empty/blank id *before* touching any
  store, so a bad caller can never turn the glob into `plan_cache:*` / `quota:*` and
  wipe every tenant's cache. (Adversarial-review finding, addressed.)
- Adversarial sign-off: Codex unavailable (model 404); Sonnet takeover, verdict
  REVISE → the one material finding (empty-id guard) is fixed; the rest are
  wiring-time notes (below).

## Not done here (deliberately out of scope — pre-existing gaps)
1. **No scheduler wires `runPurgeCheck`.** The archive→purge pipeline was never
   invoked at runtime (`offboardingQueue` is `null`; no BullMQ worker consumes it).
   This change makes the deletion *correct and ready* but it does not auto-run yet.
   To activate: build `ExternalPurger.fromEnv(process.env)` in `index.ts`, run
   `runPurgeCheck(prisma, auditLogger, purger)` on a daily job, and call
   `purger.close()` in a `finally` (avoids leaking a Redis/Neo4j/ES connection per run).
2. **Compose env wiring:** the UMS container will need `TI_NEO4J_URL` and `TI_ES_URL`
   (+ ES creds) when the scheduler lands; today `fromEnv` is never called.

## How to verify
- `pnpm --filter @etip/user-management-service exec vitest run` → 339 passing.
- `pnpm exec tsc -b apps/user-management-service/tsconfig.json` → clean.

## Rollback
Single module; revert the commit — the worker returns to Postgres-only purge with
the three logging stubs.
