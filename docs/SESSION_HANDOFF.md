# SESSION HANDOFF DOCUMENT
**Date:** 2026-09-28
**Session:** 168 (label S168 — RCA #49 + RCA #50 fixed and deployed: webhook "Test connection" 500 + demo stat tiles, self-service sign-up CAPTCHA + Contact Sales. This closing update also covers the full session span since the last handoff, S161b PR1 through S167.)

**Session Summary (current, read this first):** This session's deploys, in order (commit range `c68d452..ddcb6be`, 22 commits, 134 files, +8,823/−1,466), all on master, all deployed unless docs-only:

- **S161b PR 1** (`255b49f`, docs-only follow-up `db0b250`): RCA #45 double-unwrap sweep across 17 frontend hooks (`api<{data}>` already unwraps — fixed ~40 sites).
- **S162** (`045fb35`, docs `2c98451`): user-management-service real `/users`, `/users/stats`, `/users/audit` routes from Prisma, tenant from nginx-verified `x-tenant-id` (401 if missing). DECISION-037.
- **S164** (`05ea889`, test fix `57aa75c`, CI lint fix `0ce8767` — RCA #46): ai-enrichment severity-gated auto-enrichment (critical/high only; manual `/trigger` bypasses), new `GET /enrichment/ioc/:iocId`, per-tenant AI Redis budget (fails closed), free-lookup gate separate from the AI gate. DECISION-038. **PROJECT_STATE.md's ai-enrichment rows had never been updated for this — fixed in this session's docs pass (366 tests, was 329).**
- **Roles fix** (`69f8239`): Command Center Roles & Permissions tab shows the 3 real roles instead of a fake matrix.
- **Step 15 roadmap v1→v2** (`3dd4f19` → `434cd4e` → `2cfb58f`): SIEM integrations plan revised to threat exposure verdicts, advisories, and connection types. DECISION-039.
- **S166 PR A** (`2831d00`, docs `efe5e92` — RCA #47): integration-service outbound hardening — new `safeFetch()` SSRF guard on all 11 outbound call sites, connector credentials encrypted at rest, `errorHandlerPlugin` fixed. DECISION-040.
- **S166 PR B** (`c44a5f0`): integration connectors persisted to Postgres (`Integration` table, write-through cache), replacing the in-memory store. DECISION-041.
- **S166 PR C** (`b4f9e71`): real easy-connect Integrations tab (frontend only).
- **S167** (`1790380` role enforcement + `f426026` API keys panel — RCA #48): server-side RBAC (`requirePermission()`, fail closed) on integration-service and user-management-service API-key routes. DECISION-042. (`docs` `e28cf52`.)
- **S168 — this closing session** (`fbd925c` RCA #49, `1481ac9` RCA #49 follow-up, `ddcb6be` RCA #50): see below.

## S168 detail — the two fixes this closing pass adds

**RCA #49 — "Test connection" 500 on bodyless requests (`fbd925c`):** Integrations → Add connection → Webhook → Test connection
showed "Internal server error". Root cause: `apps/frontend/src/lib/api.ts` always set `Content-Type: application/json`, even
with no body — Fastify rejects an empty body declared as JSON (`FST_ERR_CTP_EMPTY_JSON_BODY`, a 400), and integration-service's
error handler mapped every non-AppError/Zod error, including Fastify's own 4xx client errors, to a generic 500. Fix: `api()`
sets the JSON header only when a body is actually sent (fixes every bodyless POST/DELETE app-wide — Test connection, Delete
connector, Revoke API key, …); the error handler now passes Fastify 4xx errors through with their own status/code. New test:
`apps/frontend/src/__tests__/api-json-content-type.test.ts` (red without the fix, green with it) plus two route tests in
integration-service.

**Same-day owner retest follow-up (`1481ac9`):** After the RCA #49 fix, testing a **webhook** connector returned "No SIEM or
ticketing config found" — `POST /integrations/:id/test` only ever handled SIEM/ticketing types; webhooks had a separate
`/:id/test-webhook` route the UI never called. Fixed: `/:id/test` now also tests webhooks via `WebhookService.testWebhook`
(one Test endpoint for every connector type). Same screen also showed demo stat tiles (Total 14, Events/hr 2840) —
`useIntegrationStats` fell back to demo data and its type never matched the real backend shape (RCA #45 class bug). Fixed with
a real hook in `hooks/use-integrations.ts`; tiles relabelled Connections / Enabled / Failed deliveries / Dead-letter queue (no
events-per-hour metric exists in the backend). integration-service: 458 tests (was 455).

**RCA #50 — self-service sign-up impossible (`ddcb6be`):** `/register` always failed with "CAPTCHA verification required", no
widget ever shown — see `docs/S168_SIGNUP_CAPTCHA_FIX.md` for full root cause (CI built the frontend without
`VITE_TURNSTILE_SITE_KEY`) and fix (repo variable + CI build arg + build-time assertion; CAPTCHA gating and recovery UX on
`RegisterPage`/`ClientOnboardingPage`). Same commit fixed "Contact Sales" doing nothing (`window.open(mailto:)` was
popup-blocked) via a new same-tab link + always-visible copyable address (`SalesContactNote.tsx`). DECISION-043.

**Deploy verification (final, this session):** Master `ddcb6be`, CI/CD run 36358218015 green (test/typecheck/lint, build&push
incl. the new CAPTCHA build-time key guard, deploy), VPS HEAD `ddcb6be`, 32/32 etip containers healthy, frontend bundle
`assets/index-icIBot1J.js`, Turnstile site key confirmed present in the live bundle via grep.

**Owner browser checks passed:** Integrations tab — webhook Test connection to a webhook.site URL returns "Webhook test
successful" and the POST arrives from the real VPS IP (187.127.138.93); a private-network URL (`http://127.0.0.1:...`) is
rejected inline; stat tiles show real counts; the connector survives `docker restart etip_integration` with the row still in
the DB and 0 plaintext secrets. Roles & Permissions tab shows the 3 real roles. Team list is real (not the fake matrix/list from
before this session's earlier fixes).

**Owner has NOT yet tested sign-up** after the CAPTCHA fix (deferred by the owner) — this is the first item for the next
session.

## ✅ Changes Made

| Commit(s) | Description |
|---|---|
| `b4975c6` | docs: session-start command optimization (double-read fix, scoped roadmap read, lazy decisions log) — landed at the very start of this span, by another session. |
| `255b49f` | S161b PR 1 — RCA #45 sweep: remove `api<{data}>` double-unwrap across 17 frontend hooks (~40 sites). |
| `db0b250` | docs: post-deploy stats update — S161b PR 1. |
| `045fb35` | S162 — user-management-service directory routes: `GET /users`, `/users/stats`, `/users/audit` from Prisma, tenant scoped to nginx-verified `x-tenant-id`. DECISION-037. |
| `2c98451` | docs: post-deploy stats update — S162. |
| `05ea889` | S164 — ai-enrichment severity-gated auto-enrichment, per-IOC enrichment endpoint, per-tenant AI budget. DECISION-038. |
| `57aa75c` | test: align EnrichmentDetailPanel `not_selected` assertion with final copy. |
| `0ce8767` | fix: remove unused identifiers in S164 tests that failed CI lint (RCA #46). |
| `69f8239` | fix: Roles & Permissions tab shows the 3 real roles, not a fake matrix. |
| `3dd4f19` | docs: Step 15 roadmap — SIEM integrations v1 (push/REST/TAXII/read connectors, coverage use cases). |
| `434cd4e` | docs: SIEM posture market research + Step 15 v2 proposal (threat exposure verdicts, advisories, connection types). |
| `2cfb58f` | docs: Step 15 v2 approved — replaces v1. DECISION-039. |
| `2831d00` | S166 PR A — harden integration-service outbound calls (`safeFetch()`, RCA Issue 47) and encrypt connector credentials at rest. DECISION-040. |
| `efe5e92` | docs: post-deploy S166 PR A + roles fix; Step 15 architecture & UI design doc. |
| `c44a5f0` | S166 PR B — persist integration connectors in Postgres (`Integration` table, write-through cache). DECISION-041. |
| `b4f9e71` | S166 PR C — real easy-connect Integrations tab (frontend only). |
| `1790380` | fix: enforce admin permissions on integration and API-key routes (RCA Issue 48). DECISION-042. |
| `f426026` | feat: API keys panel in Users & Access (create once-shown key, revoke) + TAXII card link. |
| `fbd925c` | fix: bodyless requests no longer send JSON content-type; 4xx framework errors not masked as 500 (RCA #49). |
| `e28cf52` | docs: post-deploy S166 PR B/C + S167 (RCA #48), RCA #49, session handoff. |
| `1481ac9` | fix: Test connection works for webhooks; integration stat tiles show real counts (RCA #49 follow-up). |
| `ddcb6be` | fix: sign-up CAPTCHA works in production; Contact Sales always usable (RCA #50). DECISION-043. |

## 📁 Files / Documents Affected

**New docs this session:** `docs/S161b_PR1_RCA45_UNWRAP_SWEEP.md`, `docs/S162_USER_MANAGEMENT_ROUTES.md`,
`docs/S164_AI_ENRICHMENT_AUTO_ENRICH.md`, `docs/S166_PR_A_INTEGRATION_OUTBOUND_HARDENING.md`,
`docs/S166_PR_B_INTEGRATION_PERSISTENCE.md`, `docs/S166_PR_C_INTEGRATIONS_UI.md`,
`docs/S167_API_KEYS_PANEL_AND_ROLE_ENFORCEMENT.md`, `docs/S168_SIGNUP_CAPTCHA_FIX.md` (new, this closing pass),
`docs/research/SIEM_POSTURE_MARKET_RESEARCH.md`, `docs/roadmap/STEP_15_SIEM_INTEGRATIONS.md` (v2),
`docs/roadmap/STEP_15_ARCHITECTURE_UI.md`.

**Key code areas touched this session:** `apps/frontend/src/hooks/*` (17-hook RCA #45 sweep, `use-integrations.ts`),
`apps/user-management-service/src/routes/directory.ts` (new), `apps/ai-enrichment/src/services/tenant-budget.ts` (new) +
`workers/enrich-worker.ts` + `routes/enrichment.ts`, `apps/integration-service/src/utils/safe-fetch.ts` (new) +
`plugins/authz.ts` (new) + `routes/{integrations,webhooks,export,advanced,p2-routes}.ts` + Prisma `Integration` model,
`apps/user-management-service/src/routes/api-keys.ts`, `apps/frontend/src/components/command-center/integrations/*` (new),
`apps/frontend/src/lib/api.ts` (Content-Type fix), `apps/frontend/src/components/SalesContactNote.tsx` (new),
`apps/frontend/src/pages/{RegisterPage,ClientOnboardingPage}.tsx`, `.github/workflows/deploy.yml` (Turnstile build arg +
build-time assertion).

**Docs updated in this closing pass:** `docs/PROJECT_STATE.md` (session counter → 168, deployment/module status rows for
frontend/integration-service/user-management-service/ai-enrichment, WIP section, 2 new Deployment Log rows), this file,
`docs/DECISIONS_LOG.md` (037–043 added), `docs/DEPLOYMENT_RCA.md` (2 new resolution-summary rows — issues 49/50 detail
entries already existed), `docs/ETIP_Project_Stats.html`, `README.md`, `docs/modules/ai-enrichment.md`,
`docs/modules/user-management-service.md`. No `docs/modules/frontend.md` or `docs/modules/integration-service.md` (or
`enterprise-integration.md`) exists in this repo — module docs cover only backend services that have a file; both were
skipped for the same reason prior sessions noted for frontend.

## 🔧 Decisions & Rationale

- **DECISION-037** (S162): user directory served from Prisma; tenant only from nginx-verified header; sessions list scoped to the current user (gateway is frozen, a tenant-wide sessions route is out of scope).
- **DECISION-038** (S164): enrichment gating — severity gate, separate free-lookup and AI gates, per-tenant AI budget, fail closed on Redis error.
- **DECISION-039** (Step 15 v2): "Threat Exposure & Detection Posture" replaces the v1 SIEM-integrations checklist — provider flow ingest→master DB→relevance→deliver→assess→advise→track, per-threat "Am I safe?" verdict cards, basic advisories in P2 MVP. Gated on 7 owner decisions.
- **DECISION-040** (S166 PR A): every tenant-supplied outbound integration destination goes through `safeFetch()` (DNS-lookup-time validation, no redirects, deadline, size cap); connector secrets encrypted at rest.
- **DECISION-041** (S166 PR B): integration connectors persisted to Postgres via write-through cache; logs/DLQ/rate-limiter state stay in memory.
- **DECISION-042** (S167): server-side RBAC is mandatory on every authenticated mutating route — UI hiding is never access control.
- **DECISION-043** (S168): frontend build-time config the server depends on (`VITE_TURNSTILE_SITE_KEY`) must be a CI build input with a build-time assertion, never only a VPS `.env` value.

Full text of each: `docs/DECISIONS_LOG.md`.

## 🧪 Deploy Verification Results

```
S161b PR 1  → 255b49f : CI 36328956242 green · 32/32 healthy · 1,944 frontend tests
S162        → 045fb35 : CI 36330819062 green · 32/32 healthy · 1,934 frontend / 360 user-management-service tests
S164        → 05ea889 (+ 0ce8767 lint fix) : Sonnet adversarial takeover verdict ACCEPT (codex companion stale) · 366 ai-enrichment tests
Roles fix   → 69f8239 : CI 36341451741 green · 32/32 healthy
S166 PR A   → 2831d00 : CI 36343537845 green · 32/32 healthy · dist/utils/safe-fetch.js present · 430 integration-service tests
S166 PR B   → c44a5f0 : CI 36345804944 green · integrations table + hydrate log verified on VPS
S166 PR C   → b4f9e71 : CI 36347744374 green · 32/32 healthy · 1,954 frontend tests
S167        → 1790380 + f426026 : CI 36349837126 green · 32/32 healthy · 455 integration-service / 371 user-management-service / 1,969 frontend tests
S168        → fbd925c + 1481ac9 + ddcb6be : CI 36358218015 green (final) · VPS HEAD ddcb6be · 32/32 healthy
             bundle assets/index-icIBot1J.js · Turnstile site key confirmed present in the live bundle

Final test counts (measured this session via `pnpm --filter <pkg> test -- --run`, 4 target packages —
full `pnpm -r test` bailed on an unrelated pre-existing flaky timing test in packages/shared-persistence,
`scheduleCheckpoint > debounces multiple calls into a single save`, not touched this session):
  frontend                    : 1,975 passed + 2 skipped (1,977 total), 138 test files, 0 failed
  integration-service          : 458 passed, 30 test files, 0 failed
  user-management-service      : 371 passed, 23 test files, 0 failed
  ai-enrichment                 : 366 passed, 21 test files, 0 failed
```

**Owner browser checks passed (this session, live production):** Integrations tab — webhook test to webhook.site succeeds,
POST arrives from 187.127.138.93; private URL rejected; real stat tiles; connector persists across
`docker restart etip_integration`, 0 plaintext secrets in the DB. Roles & Permissions tab real. Team list real.
**Not yet done:** owner retest of self-service sign-up after the RCA #50 fix.

## ⚠️ Open Items — Immediate (owner)

1. **Test sign-up at `/register`** now that RCA #50 is fixed — needs the verification email to arrive (Resend key is set; if
   no email shows up, check `etip_api`/user-management-service logs, not the CAPTCHA path, which is confirmed fixed).
2. **Make the 7 Step 15 P2 decisions** in `docs/roadmap/STEP_15_ARCHITECTURE_UI.md` §11: new `exposure-service` vs. extending
   correlation-engine/integration-service; where tenant org-profile lives server-side; asset/vuln-scanner data ownership;
   sightings ownership; rule→technique mapping ownership; posture-widget cache-TTL exception to the 48hr dashboard constant;
   new `/exposure` top-level route vs. folding into Command Center.
3. **Decide `TI_AI_ENABLED` in prod `.env`** — currently `true` but the Anthropic key is empty, so no AI calls actually happen
   yet; either set the key or turn the flag off to make the state match reality.
4. **Close the stale peer Claude session** `intelwatch-dd [99cbe6]` if it's still open (one-folder-one-session rule,
   DECISION-034).

## ⚠️ Open Items — Engineering follow-ups (no owner input needed)

- Tenant admins cannot add users in-app: team invite is in-memory (not DB-backed), SCIM routes exist but aren't reachable via
  nginx, SSO JIT callback isn't wired, there's no Prisma-backed role-change route, and Command Center "Add Client" invite is
  also in-memory. **Recommend a dedicated "real user & tenant provisioning" task** before more feature work stacks on top of
  fake provisioning paths.
- Correlation page "Create ticket" (`use-phase4-data.ts` `useCreateTicket`) sends no `integrationId`, which
  `POST /integrations/tickets` requires — pre-existing 400, needs a ticketing-integration picker in the UI.
- Route-permission coverage test (RCA Issue 48 prevention item, not yet built): a test per service that iterates its
  registered routes and fails if an authenticated route lacks a permission preHandler.
- **Check other services' error handlers for the same 4xx→500 masking RCA #49 found in integration-service** — it was found by
  accident on one screen; nothing has swept the rest of the services for the same bug class.
- Known open plan-limit enforcement gap — details in the owner's private notes (`memory/project_plan_enforcement_gap.md`),
  intentionally not described here; scheduled before Step 3.
- integration-service logs/DLQ state is still in-memory (DECISION-041) — only connector config moved to Postgres.
- `integration-store.ts` is at 399 lines (right at the file-size limit) — watch it on the next touch.
- Tenant org-profile (industry/geo/tech-stack) lives only in browser `localStorage` — a P2 blocker per Step 15 decision #2.
- Audit-log redaction inside `AuditLogger.log()` still open (carried from S162 follow-ups).
- GET-query `ZodError` → 500 in user-management-service's error handler (also affects `teams.ts`) — carried from S162.
- Batch Anthropic tenant-budget check (before `TI_BATCH_ENABLED`) — carried from S164 follow-ups.
- S161b PR 2–4 (alerting/reporting, phase4, remaining phase5/6 hooks) still pending, unchanged since PR 1 landed.
- S163 backend gaps (billing/admin path+shape mismatches, DECISION-036) still open — see prior handoff for the full list
  (`/billing/plans` price field, `/billing/usage` shape, `/billing/subscription` singular vs. plural, missing
  `/billing/stats`/`/admin/stats`, `QuotaWarningBanner.tsx` wire-vs-delete, `BillingPage`'s `DEMO_PLAN_PRICES` table).
- **Deferred with reason (not forgotten, just not now):** Razorpay/self-serve payments (owner decision, sales-led by
  DECISION-031); ops hardening beyond what's already shipped (no paying customers yet, functional work takes priority per
  `feedback_functional_first.md`).

## 🔁 How to Resume

```
/session-start → S169. One folder (E:\code\IntelWatch), branch per task, one PR merged + deployed at a time (DECISION-034).
Use Sonnet/Haiku as much as possible (Opus for plan/review/security judgment only).

Two independent tracks are open — pick whichever the owner wants first, they don't block each other:

TRACK A — Step 15 P2, blocked on the owner:
Present the 7 open architecture decisions in docs/roadmap/STEP_15_ARCHITECTURE_UI.md §11 (exposure-service vs. extending
existing services, org-profile ownership, asset/vuln-scanner data ownership, sightings ownership, rule→technique mapping
ownership, posture-widget cache TTL exception, /exposure sidebar route). Once the owner decides, branch for P2 MVP
("Am I affected?" + basic advisories) per the v2 spec (docs/roadmap/STEP_15_SIEM_INTEGRATIONS.md v2 + STEP_15_ARCHITECTURE_UI.md).

TRACK B — no-decision follow-ups (recommend starting here):
1. Real user & tenant provisioning (new, not previously scoped) — team invite, SCIM routes reachable via nginx, SSO JIT
   callback, Prisma-backed role-change route, Command Center "Add Client" — all currently in-memory or unreachable. This is
   the recommended first pick: it blocks real usage more than any single feature gap.
2. Route-permission coverage test per service (RCA Issue 48 prevention item).
3. Sweep every service's error handler for the RCA #49 4xx→500 masking bug class (only integration-service has been checked).
4. Correlation "Create ticket" integrationId picker.
5. Then resume S161b (remaining demo-fallback hook files) → S163 (billing/admin path+shape fixes, DECISION-036) → Step 3
   persistence → Step 4 DB role + RLS (security review before push) → Step 10 agent foundation → Steps 11-13.

Owner does a browser check after each deploy — CI/unit tests with correct shapes still aren't a substitute for a live
click-through (this is exactly how RCA #49 and #50 were caught this session — both were owner-reported, not test-caught).

Note: a personal (non-IntelWatch) OpenRouter free-router task has its own plan at
C:/Users/manis/bin/OR_FREE_ROUTER_PLAN.md — unrelated to this project, do not pull it into IntelWatch session scope.
```

## Module Map (frontend, integration-service — S168-relevant)

```
apps/frontend/src/lib/api.ts                 → Content-Type-on-body-only fix (RCA #49), applies to every endpoint app-wide
apps/frontend/src/hooks/use-integrations.ts  → real stats hook (RCA #49 follow-up), replaces demo use-phase5-data.ts stats hook
apps/frontend/src/components/SalesContactNote.tsx → new, same-tab mailto + copy (RCA #50)
apps/frontend/src/pages/RegisterPage.tsx, ClientOnboardingPage.tsx → CAPTCHA gating + recovery UX (RCA #50)
apps/integration-service/src/plugins/*        → errorHandlerPlugin 4xx passthrough (RCA #49), authz.ts requirePermission (S167)
apps/integration-service/src/routes/integrations.ts → /:id/test now covers webhooks via WebhookService.testWebhook
.github/workflows/deploy.yml                  → VITE_TURNSTILE_SITE_KEY build arg + build-time presence assertion (RCA #50)
```

## Agent utilization

- Opus (main session): plan, digest review, all doc synthesis for this closing pass (PROJECT_STATE/DECISIONS_LOG/RCA/
  SESSION_HANDOFF/S168 doc/module docs/stats HTML/README), diff-free verification (no code touched — docs-only session per
  instructions) — ~350k tokens (estimate)
- Sonnet (subagent, this session): none launched — docs-only task, all file reads/edits and the 4-package test run were done
  directly by the orchestrating agent per the caller's "do the work directly" instruction
- Haiku: none launched this session
- codex:rescue: n/a — docs-only session, no security/auth/classifier code touched

Routing telemetry:
- opus · full-suite test run (bailed on unrelated pre-existing flaky test) · reworked: Y (re-ran scoped to the 4 target packages via pnpm --filter)
- opus · docs synthesis across 8 files · reworked: N
