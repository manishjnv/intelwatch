# SESSION HANDOFF DOCUMENT
**Date:** 2026-09-25
**Session:** 149
**Session Summary:** Three-part session. **Part 1:** shipped the offboarding purge fix (PR #32) so purging a tenant also deletes its Neo4j graph, Elasticsearch indices, and Redis cache — not just Postgres rows; PR #31 (S148 outage fix) was merged and deployed first. **Part 2:** ran a read-only VPS baseline check (no restarts/edits) and found real gaps: no backups at all, Redis evicting keys, Elasticsearch 0 docs against 12,010 Postgres IOCs, and DB access running as a bypassrls superuser. **Part 3:** fixed and deployed Step 0B (urgent fixes) — tenant isolation, billing gate, Grafana exposure, Redis eviction policy, secret rotation, and a nightly backup cron — verified live with 32/32 containers healthy. A password-reset incident after deploy (unrelated to the deploy itself) is also recorded here.

## ✅ Changes Made

### Part 1 — Offboarding purge (PR #32)
| Commit / PR | Files | Description |
|---|---|---|
| `ee46260` → merged `d447962` (**PR #32**, branch `fix/offboarding-purge`) | 7 | Offboarding purge deletes graph/search/cache. New `ExternalPurger` + wiring + tests + deps + docs. |
| `8c73723` (**PR #31**, branch `docs/rca-nginx-created-outage`) — merged this session | 4 | S148 outage fix: `scripts/*.sh` mode 100644 → 100755 + RCA + docs/S148_NGINX_OUTAGE.md (authored by peer session `intelwatch-9c`; merged and deployed by this session per the required merge order). |

Full detail (safety analysis, cross-tenant blast-radius check, file list): `git show fb65d0c:docs/SESSION_HANDOFF.md` and `docs/S148_OFFBOARDING_PURGE.md`.

**Deploys:** run `36106947700` (PR #31 → master), run `36108011998` (PR #32 → master). Both green. VPS landed on `d447962`.

### Part 2 — VPS baseline (read-only)
No code changes. `docs/VPS_BASELINE_2026-09-25.md` (commit `af17c29`, branch `claude/beautiful-allen-nd42lg`, merged to master) — a report only, nothing restarted or edited on the VPS. Secret findings are withheld from that public doc and kept in a local, git-excluded private file on the owner's machine.

**Findings:**
- 32/32 containers healthy.
- **No backups for ETIP** — no Postgres/Neo4j/ES/MinIO backup cron or files existed.
- Redis: `allkeys-lru`, 256 MB cap, **1,420 keys already evicted**.
- Postgres has **12,010 IOCs**; Elasticsearch has **0 docs** — 6,035 failed index jobs, error `Cannot read properties of undefined (reading 'type')`, failing since at least 2026-07-11.
- Only DB role in use is a **superuser with `bypassrls`**; 6 of 25 tenant tables have no RLS policy at all.
- Global feed processing is on (U11 live).

### Part 3 — Step 0B deploy (urgent fixes)
Spec: `docs/roadmap/STEP_00B_URGENT_FIXES.md`. Runbook: `docs/roadmap/VPS_DEPLOY_0B_PROMPT.md`.

**Step 0 — local checks before touching the VPS:**
- Tests pass except frontend (local `ERR_REQUIRE_ESM` env issue only — passes in CI).
- Ingestion typecheck: 2 pre-existing `TS2367` errors in `feed-fetch.ts`, in a file this branch doesn't change (same errors noted in S149 Part 1).
- Lint: 0 errors. `make docker-test` skipped — no `make`/Docker Desktop locally; CI's Docker build covers it.
- **Adversarial review:** codex quota-limited until 2026-09-29 → Sonnet takeover per the fallback ladder. Verdict **REVISE**: one blocker found — the billing payment gate tested the raw `req.url`, so a percent-encoded path (e.g. `che%63kout`) bypassed it because the router decodes before matching. **Fixed** in `5c33b36` (match `req.routeOptions.url` instead) + new tests. One non-blocker noted and deferred: the tenant guard on the reindex route only checks top-level `tenantId`, not nested body items — super-admin-only route, low risk.

**Step 1 — pre-deploy backup (before any changes landed):**
`pg_dump` on the VPS → `/var/backups/etip/pg-pre0B-2026-09-25.dump` (2.16 GB, 36 tables), copied off-box to the owner's machine (`E:\code\IntelWatch\backups\etip`, excluded locally via `.git/info/exclude`), checksum verified.

**Step 2 — secret rotation (live VPS, not via git):**
`.env` backed up as `.env.bak-2026-09-25-pre0B`. Login JWT secret and service JWT secret rotated to strong random values; integration encryption key added. Effect: **every user had to log in again.**

**Step 3 — deploy:**
PR #35 merged → `d3d4c01`. CI run `36158670164` green. Deploy run `36159365105` green on the first try.

**Step 4 — live verification:**
- 32/32 containers healthy; `nginx -t` ok.
- Redis: `noeviction`, 1 GB cap, 0 evictions, 63,992 keys kept.
- Integration service: 0 `CONFIG_INVALID` errors.
- Tenant guard: 403 for another tenant's data / 200 for own tenant (alerts, reports, search) — tested directly against the services with the nginx-forwarded headers, not through a browser session token.
- Billing payment routes: 503 including percent-encoded paths (confirms the review fix `5c33b36`).
- `/grafana/api/health` → 404 (no longer leaks version); `/grafana/` → 302 to login.
- Unauthenticated API calls → 401.

**Step 5 — backup automation:**
Installed cron `30 2 * * * /opt/intelwatch/scripts/etip-backup.sh >> /var/log/etip-backup.log 2>&1`. Manual run succeeded in 3m20s (Postgres 2.1 GB + Redis 478 MB, 7-day retention). Off-box copy is still manual (Step 1 follow-up). Minor known issue: every line the script logs shows the same start timestamp because `LOG_PREFIX` is computed once at the top of the script instead of per-line.

**Step 6 — docs:** commit `1e33b7a` (docs-only, no redeploy — `paths-ignore` correctly skipped CI/CD).

## 🔑 Login incident after deploy (not caused by the deploy)
The owner could not log in right after the Step 0B deploy. Root cause is unrelated to the deploy: the login lookup finds a user by email with an **unordered `findFirst`** (`apps/user-service/src/repository.ts:63`). Some emails have more than one user row across tenants — including an emergency break-glass row for that account — so which row gets checked is non-deterministic, producing either a 403 (break-glass row) or a 401 (wrong password against the other row). **Workaround applied:** both rows for that account were reset to the same new password directly in the database (value stored only in the owner's local, git-ignored `.env`). Verified: login 200, subsequent authed API calls 200. A proper fix (dedicated email for the break-glass account, deterministic lookup) is still pending — see Next Tasks.

## 📁 Files / Documents Affected
**New**
| File | Purpose |
|---|---|
| docs/VPS_BASELINE_2026-09-25.md | Part 2 read-only findings (secret details withheld from this public file) |
| docs/S149_STEP0B_DEPLOY.md | Part 3 detailed change/rollback/verify doc for Step 0B |

**Modified**
| File | Change |
|---|---|
| apps/billing-service (payment gate) | `5c33b36` — match `req.routeOptions.url` instead of raw `req.url`, so percent-encoded paths can't bypass the payment gate; tests added |
| docs/PROJECT_STATE.md | S149 WIP bullet + deployment log rows |
| docs/DEPLOYMENT_RCA.md | "No new issues" / relevant rows for Part 2/3 |
| docs/ETIP_Project_Stats.html | Session 149 stats |
| docs/SESSION_HANDOFF.md | this file |

Part 1's own file list (external-purge.ts, worker wiring, tests, deps) is unchanged from `git show fb65d0c:docs/SESSION_HANDOFF.md` — see that revision for the full table.

## 🧪 Verification Results
```
Part 1: UMS tests 339 passing (5 new) · UMS typecheck clean · deploys 36106947700 / 36108011998 success
Part 2: read-only, no live changes; findings listed above
Part 3: local — tests pass (frontend env-only fail, ingestion 2 pre-existing TS2367), lint 0 errors
        Sonnet adversarial review verdict REVISE → billing gate fixed (5c33b36)
        deploy PR #35 → d3d4c01, CI 36158670164 green, deploy 36159365105 green
        live: 32/32 healthy · nginx -t ok · Redis noeviction/1GB/0 evictions/63,992 keys
        integration 0 CONFIG_INVALID · tenant guard 403(other)/200(own) · billing 503 incl. encoded paths
        /grafana/api/health 404 · /grafana/ 302 · unauth API 401
        backup cron installed, manual run ok (3m20s, 2.1GB+478MB, 7-day retention)
```

## ⚠️ Open Items / Next Steps
**Immediate**
1. **Step 1** (`docs/roadmap/STEP_01_STAY_UP.md`): external uptime alert, deploy resilience + schema-push-before-restart (U9), automated off-box backups, fix the backup log timestamp bug, add `backups/` to `.gitignore` as part of that code PR.
2. **Login fix:** make normal login skip break-glass rows and correctly handle one email existing across several tenants (`apps/user-service`); give the break-glass account its own dedicated email so it can never collide with a real user's `findFirst` lookup.
3. **Owner:** click through the logged-in app in prod; enable MFA on the super_admin account; delete the VPS `.env` backup (`.env.bak-2026-09-25-pre0B`) after about a week of clean operation.
4. **Step 2 (search):** fix the Elasticsearch indexer's `'type'` crash (`Cannot read properties of undefined (reading 'type')`) and backfill the 12,010 IOCs currently missing from the index.

**Lower priority (carried)**
- Tenant-guard hardening for nested `tenantId` in the reindex route body (super-admin-only, deferred from Step 0B review).
- Alerting/reporting `:id` routes lack a tenant check — planned for Step 3.
- Wire the offboarding purge scheduler (Part 1 feature is deployed but inert — see `git show fb65d0c:docs/SESSION_HANDOFF.md` for the exact wiring steps).
- S147 follow-ups: `docs/S147_APP_WIRING_FOLLOWUPS.md`.
- 121 pre-existing frontend `tsc` errors; 2 pre-existing ingestion `tsc` errors (`feed-fetch.ts`).

**Process note:** use Sonnet/Haiku as much as possible even in step-by-step production sessions (saved to project memory and global `CLAUDE.md` this session) — this session under-used Haiku for VPS check/verify sweeps that were well suited to it.

## 🔁 How to Resume
```
/session-start
Working on: ops (Step 1 — uptime alert + deploy resilience + off-box backup automation). Do not modify: frozen shared-* packages, api-gateway structure.
First: read docs/roadmap/STEP_01_STAY_UP.md, then set up the external uptime alert.
Then: deploy.yml resilience (setsid + ServerAliveInterval), schema-push-before-restart (U9), off-box backup automation, backup log timestamp fix.
Separately: fix apps/user-service login findFirst (break-glass email collision) — see "Login incident" above.
```
Phase: 13 (production hardening + SEO). Plan docs: `docs/roadmap/STEP_01_STAY_UP.md`, `docs/S149_STEP0B_DEPLOY.md`, `docs/VPS_BASELINE_2026-09-25.md`.

## Agent-utilization footer
- **Opus:** orchestration, security judgment (payment-gate blocker triage), secrets/DB actions (rotation, password reset), billing fix decision.
- **Sonnet:** adversarial review of Step 0B (found the routeOptions.url blocker, reworked: N — one clean pass) + this handoff.
- **Haiku:** n/a — missed opportunity this session (VPS checks/verify sweeps were done directly instead); now routed to Haiku going forward per the updated rule.
- **codex:rescue:** n/a — quota exhausted until 2026-09-29; Sonnet takeover, verdict=revise → fixed in `5c33b36`.
