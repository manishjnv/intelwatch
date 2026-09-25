# SESSION HANDOFF DOCUMENT
**Date:** 2026-09-25
**Session:** 149
**Session Summary:** Completed the tenant-offboarding **purge** so purging an offboarded tenant now deletes its non-Postgres data — **Neo4j graph, Elasticsearch indices, and Redis plan/quota cache** — not just its Postgres rows. Shipped as PR #32 and deployed live. Because the same deploy would have regressed the S148 outage fix, PR #31 (health-recovery exec bit) was merged and deployed **first**. Both are live; 32/32 containers healthy; site 200; API auth gate holding.

## ✅ Changes Made
| Commit / PR | Files | Description |
|---|---|---|
| `ee46260` → merged `d447962` (**PR #32**, branch `fix/offboarding-purge`) | 7 | Offboarding purge deletes graph/search/cache. New `ExternalPurger` + wiring + tests + deps + docs. |
| `8c73723` (**PR #31**, branch `docs/rca-nginx-created-outage`) — merged this session | 4 | S148 outage fix: `scripts/*.sh` mode 100644 → 100755 + RCA + docs/S148_NGINX_OUTAGE.md (authored by peer session `intelwatch-9c`; **merged and deployed by this session** per the required merge order). |
| this handoff commit (branch `docs/s149-offboarding-purge`) | ~4 | PROJECT_STATE, this handoff, DEPLOYMENT_RCA, ETIP_Project_Stats.html |

**Deploys triggered this session (both green, VPS at `d447962`):**
- Run `36106947700` — PR #31 merge → master. Test/Build/Deploy all success.
- Run `36108011998` — PR #32 merge → master. Test/Build/Deploy all success.

**No live (non-git) VPS changes made this session.**

## 📁 Files / Documents Affected
**New (in PR #32, already on master)**
| File | Purpose |
|---|---|
| apps/user-management-service/src/services/external-purge.ts | `ExternalPurger` — tenant-scoped deletes across Redis (`KEYS`+`DEL`), Neo4j (`DETACH DELETE` by tenantId), ES (`indices.delete etip_<id>_iocs_*`). `fromEnv()` builds clients from `TI_REDIS_URL`/`TI_NEO4J_URL`/`TI_ES_URL`; a store with no URL is a no-op. |
| apps/user-management-service/tests/external-purge.test.ts | 5 tests: happy path, per-store error isolation, null-client no-op, no-match ES, empty-tenantId guard. |
| docs/S148_OFFBOARDING_PURGE.md | Detailed change doc (what/why/files/safety/rollback/follow-ups). |

**Modified**
| File | Change |
|---|---|
| apps/user-management-service/src/services/offboarding-purge-worker.ts | `runPurgeCheck`/`purgeTenant` take an optional `ExternalPurger`; external counts merged into `deletedCounts` (`graphNodes`,`esIndices`,`cacheKeys`); external errors recorded on the `offboarding.purged` audit entry. Postgres purge still runs regardless (authoritative). |
| apps/user-management-service/package.json | + `@elastic/elasticsearch`, `@etip/shared-cache`, `ioredis`, `neo4j-driver`. |
| apps/user-management-service/tsconfig.json | + `@etip/shared-cache` project reference. |
| pnpm-lock.yaml | new deps. |
| docs/PROJECT_STATE.md, docs/DEPLOYMENT_RCA.md, docs/ETIP_Project_Stats.html, docs/SESSION_HANDOFF.md | S149 handoff. |

## 🔒 Safety / Review
- **Cross-tenant blast radius:** `tenant.id` is a Postgres UUID (fixed 36-char, `gen_random_uuid`); no UUID prefixes another, so `KEYS plan_cache:<id>* / quota:<id>*`, the `etip_<id>_iocs_*` ES pattern, and the Neo4j `{tenantId}` match cannot touch another tenant. Verified against `prisma/schema.prisma`.
- **Empty-tenantId guard:** `ExternalPurger.purge()` throws on empty/blank id **before** touching any store — a bad caller can never turn the glob into `plan_cache:*`/`quota:*` and wipe every tenant's cache.
- **Adversarial sign-off:** Codex unavailable (its model returns 404) → Sonnet takeover per the fallback ladder, verdict **REVISE**; the one material finding (empty-id guard) is fixed. Other findings are wiring-time notes (see below).

## 🧪 Verification Results
```
UMS tests:        339 passing (incl. 5 new external-purge)
UMS typecheck:    pnpm exec tsc -b apps/user-management-service/tsconfig.json → clean
Deploys:          run 36106947700 (PR#31) success · run 36108011998 (PR#32) success
VPS commit:       d447962  ·  etip_user_management: Up (healthy)  ·  32/32 healthy
Live grid:        / 200 · /health 200 · /login 200 · /pricing 200
                  /api/v1/iocs 401 · /api/v1/auth/me 401  (auth gate holding after S147 #23)
Uptime alert:     UptimeRobot free-tier blocks API monitor creation (access_denied on newMonitor
                  even with Main key; reads OK). Must be created via dashboard.
```
Note: full-repo `tsc -b --force tsconfig.build.json` still shows 2 **pre-existing** errors in `apps/ingestion/src/workers/feed-fetch.ts` (FeedType vs 'cisa_kev'/'otx') — unrelated to this session, confirmed present on clean master.

## ⚠️ Open Items / Next Steps
**Immediate**
1. **Wire the purge scheduler** (the reason the feature is inert today): no code calls `runPurgeCheck`. To activate — build `ExternalPurger.fromEnv(process.env)` in `apps/user-management-service/src/index.ts`, run `runPurgeCheck(prisma, auditLogger, purger)` on a daily BullMQ repeatable job, and call `purger.close()` in a `finally` (a fresh `fromEnv()` per run without `close()` leaks a Redis conn + Neo4j driver + ES client each run). Then add `TI_NEO4J_URL` and `TI_ES_URL` (+ ES creds) to the `etip_user_management` service in `docker-compose.etip.yml` (it currently has `TI_REDIS_URL` only).
2. **External uptime alert** (carried from S148, still open) — UptimeRobot API creation is plan-locked on the free tier; create via the dashboard: HTTP(s) monitor on `https://intelwatch.in/health`, 5-min, alert contact `manishjnvk@gmail.com` (contact id `8850721`, already active). Or upgrade the plan and I can create it via one API call. Key lives in `.env` as `UptimeRobot_API_Key` (gitignored, untracked).
3. **Owner logged-in click-through** (carried from S147/S148) — dashboard, IOCs, Command Center; not exercised live since the #23 auth change. Needs a test login for automated verification.

**Lower priority (from adversarial review, optional)**
- Audit assertion: when Postgres `deletedCounts.iocs > 0` but `esIndices`/`graphNodes` come back 0, that may signal ES/Neo4j naming drift rather than a legitimately empty store — worth a warning.
- Neo4j `DETACH DELETE` assumes nodes/edges never cross tenant boundaries (they don't in the current MERGE-by-`{id,tenantId}` model) — reconfirm if the graph schema ever shares nodes across tenants.

**Carried (unchanged from S148)**
- S147 follow-ups: docs/S147_APP_WIRING_FOLLOWUPS.md (search-index pipeline, demo-fallback UX, missing endpoints, least-privilege DB role).
- 121 pre-existing frontend `tsc` errors; 2 pre-existing ingestion `tsc` errors (feed-fetch.ts).
- Docker cleanup cron not installed on KVM4 (disk ~22 %, low urgency).

**Process notes**
- Multiple sessions shared the working tree again (`intelwatch-e2` = this session, `intelwatch-9c`, `observer-sessions-84`). Use `git worktree add` per session; one session deploys at a time. My purge edits briefly landed on the peer's checked-out branch and were cleanly moved to `fix/offboarding-purge` off master before commit — nothing leaked into PR #31.
- Untracked strays present in the tree, **not** committed by this session: `AGENTS.md`, several `docs/*.docx`, `scripts/generate-ioc-test-plan.py`, `setup-breakglass.sh`.
