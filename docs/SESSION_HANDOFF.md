# SESSION HANDOFF DOCUMENT

**Date:** 2026-09-28
**Session:** 170
**Session Summary:** S165 — Threat Graph page called a non-existent `graph/entity/root` endpoint and silently fell back to demo data. Wired it to the existing `GET /graph/overview` route instead: new tenant-scoped `?limit=1..500` (default 50) endpoint returning the top-N most-connected entities + edges, a frontend adapter mapping the real shape, deletion of demo graph data, honest loading/error/empty states, and correct labels on node expand and the IOC-detail relationship graph. Deployed and verified. Previous session (169) was planning-only (commit `6f6ec48`, another Claude session) — reviewed the Phase 13 roadmap and generated session prompts for S161b/S162/S163/S164/S165; no code.

## ✅ Changes Made

| Commit(s) | Description |
|---|---|
| `823884b` | feat: Threat Graph shows real data via `GET /graph/overview` (S165) — 14 files. |
| `eea4496` | docs: S165 graph overview change log + RCA #51 (`docs/S165_GRAPH_OVERVIEW.md`, `docs/DEPLOYMENT_RCA.md`). |
| `2975762` | docs: post-deploy stats update — session 170 (S165 graph overview). |
| `2c0ef46` | docs: neutral wording for next-action security item. |

PR #49, fast-forward merged to master. Restore-point tag `safe-point-2026-09-28-s165-graph-overview`. Branch `s165/graph-overview` (local + remote) can be deleted next session.

## 📁 Files / Documents Affected

**New files:**

| Path | Purpose |
|---|---|
| `apps/threat-graph/tests/overview.test.ts` | Tests for the new `GET /graph/overview` route. |
| `apps/frontend/src/hooks/graph-adapter.ts` | Maps the real `/graph/overview` backend shape into the frontend's graph-widget shape. |
| `apps/frontend/src/__tests__/graph-overview.test.tsx` | Frontend test for the real-data Threat Graph view. |
| `docs/S165_GRAPH_OVERVIEW.md` | Full session detail: root cause, fix, deploy verification. |

**Modified files:**

| Path | Change |
|---|---|
| `apps/threat-graph/src/repository-extended.ts` | Overview query support. |
| `apps/threat-graph/src/repository.ts` | Overview query support. |
| `apps/threat-graph/src/routes/graph-extended.ts` | New `GET /graph/overview` route (limit 1–500, default 50). |
| `apps/threat-graph/src/schemas/search.ts` | Schema for the overview query/response. |
| `apps/frontend/src/hooks/use-phase4-data.ts` | Threat Graph hooks call `/graph/overview` instead of the non-existent `/graph/entity/root`. |
| `apps/frontend/src/hooks/phase4-demo-data.ts` | Demo graph data deleted. |
| `apps/frontend/src/pages/ThreatGraphPage.tsx` | Loading / error+Retry / empty states; "Avg Risk" tile renamed "Avg Links". |
| `apps/frontend/src/components/viz/GraphWidgets.tsx` | Renders real node/edge labels, confidence (0–1 → %). |
| `apps/frontend/src/__tests__/graph-actions.test.tsx` | Updated for the real-data path. |
| `apps/frontend/src/__tests__/mobile-responsive.test.tsx` | Updated for the real-data path. |
| `apps/frontend/src/__tests__/phase4-pages.test.tsx` | Updated for the real-data path. |
| `docs/PROJECT_STATE.md`, `docs/DEPLOYMENT_RCA.md`, `docs/ETIP_Project_Stats.html`, `README.md`, this file | Session-end documentation. |

## 🔧 Decisions & Rationale

No new DECISIONS this session. Note: the owner-ordered "Next-work queue" below is the owner's explicit ordering, not an engineering judgment call — do not resequence it without asking.

## 🧪 E2E / Deploy Verification Results

```
S165 → 823884b + eea4496 : CI/CD run 36362964512 green (test/typecheck/lint, build&push, deploy)
VPS HEAD eea4496, 32/32 etip_ containers healthy, 0 in Created state
etip_threat_graph / etip_frontend / etip_nginx recreated
Live bundle chunk use-phase4-data-*.js contains "graph/overview", zero "graph/entity/root"
GET https://intelwatch.in/api/v1/graph/overview → 401 unauthenticated (route exists; was 404-by-design before)

Tests:
  threat-graph : 308 passed (was 294)
  frontend     : 1,988 passed + 2 skipped (1,990 total), was 1,975 + 2 (1,977)
  tsc / eslint : 0 errors both
```

Also done this session but OUTSIDE this repo (owner's personal tooling, no IntelWatch impact): owner's personal OpenRouter tooling rebuilt in `C:\Users\manis\bin`.

## ⚠️ Open Items / Next Steps

**Immediate:**
1. **Owner browser check** — open `/graph` in a fresh incognito tab: real nodes or an honest "No graph entities yet" empty state, no Demo banner; Network tab shows `GET /api/v1/graph/overview?limit=50` → 200; clicking Expand on a node shows labelled neighbours.
2. **Step 6 PR 1 — cleanup** (`docs/roadmap/STEP_06_CLEANUP.md`): `git rm -r` the 10 empty `.gitkeep` folders; owner decision on deleting (spec recommends) vs. fixing `scaffold.js`/`init-modules.js`; add a "Folder" column to `PROJECT_STATE.md`. Small, no deploy impact — verify nothing references the folders first.

**Owner-ordered queue (one item per session, after the immediate items above):**
1. Step 6 PR 1 — cleanup (see above).
2. Owner-scheduled security fix (details in the owner's private notes) — must land BEFORE Step 3.
3. Real tenant Clients list — replace admin-service's in-memory TenantStore with a real persisted source (DECISION-013).
4. Step 3 — persistence (`docs/roadmap/STEP_03_PERSISTENCE.md`, ~12 sessions) — owner decisions D1–D7 needed first; spec partly stale, integration-service persistence was partly done in S166 PR B, re-check before starting.
5. Step 4 — least-privilege DB + real RLS (`STEP_04_DB_ROLE_RLS.md`, after Step 3, ~13 sessions) — owner decisions E1–E7, touches shared-auth.
6. Step 6 remainder — DECISION-032 proposal/gate + as-touched >400-line splits (38 files over limit, incl. `use-phase4-data.ts` 549, `ThreatGraphPage.tsx` 514).

**Carried forward (still open, unchanged since the prior handoff):**
- Owner sign-up test at `/register` after the RCA #50 fix (needs the verification email to arrive).
- 7 Step 15 Phase 2 architecture decisions (`docs/roadmap/STEP_15_ARCHITECTURE_UI.md` §11).
- `TI_AI_ENABLED` decision — currently `true` in prod `.env` but the Anthropic key is empty, so no AI calls actually happen; set the key or turn the flag off.
- Real user & tenant provisioning: team invite is in-memory, SCIM routes unreachable via nginx, SSO JIT callback unwired, no Prisma-backed role-change route, Command Center "Add Client" invite in-memory. Recommended before more feature work stacks on fake provisioning paths.
- RCA #49 error-handler sweep — only integration-service has been checked for the 4xx→500 masking bug class; other services not yet swept.
- Route-permission coverage test (RCA Issue 48 prevention item) — not yet built.
- Correlation "Create ticket" (`use-phase4-data.ts` `useCreateTicket`) sends no `integrationId`, which `POST /integrations/tickets` requires — needs a ticketing-integration picker in the UI.
- S161b PR 2–4 (alerting/reporting, phase4, remaining phase5/6 hooks) — still pending, unchanged since PR 1 landed.
- S163 backend gaps (billing/admin path+shape mismatches, DECISION-036) still open: `/billing/plans` price field, `/billing/usage` shape, `/billing/subscription` singular vs. plural, missing `/billing/stats`/`/admin/stats`, `QuotaWarningBanner.tsx` wire-vs-delete, `BillingPage`'s `DEMO_PLAN_PRICES` table.
- New minor follow-up: `useNodeNeighbors` still maps any error (not just 404) to "no neighbours" (pre-existing; `apps/frontend/src/hooks/use-phase4-data.ts`).

**Deferred with reason (not forgotten, just not now):**
- Flaky under full-suite load (pass alone and on re-run): user-service `access-review-service.test.ts > scanStaleSuperAdmins` (2 tests, failed once in `pnpm -r test` on 2026-09-28) and shared-persistence `scheduleCheckpoint > debounces multiple calls`. `pnpm -r test` bails on the first failing package — use `pnpm -r --no-bail test` for a real total (9,030 passed + 2 skipped on 2026-09-28).
- Ops hardening beyond what's already shipped (backups, DR, monitoring polish) — no paying customers yet, functional work takes priority.

## 🔁 How to Resume

```
/session-start → Session 171. One folder (E:\code\IntelWatch), branch per task, one PR merged + deployed at a time (DECISION-034).
Use Sonnet/Haiku as much as possible (Opus for plan/review/security judgment only).

FIRST: owner browser check of /graph (see Immediate item 1 above) — confirm real data, no Demo banner, Expand shows labels.

THEN start the owner-ordered queue at item 1 — Step 6 PR 1 cleanup:
Read docs/roadmap/STEP_06_CLEANUP.md. `git rm -r` the 10 empty .gitkeep folders after confirming nothing references them.
Get the owner's decision: delete scaffold.js + init-modules.js (spec recommends this) or fix them. Add a "Folder" column
to docs/PROJECT_STATE.md's module table. Small, single-module, no deploy-impact task — proceed directly per the
1-2 file SMALL sizing rule, no plan-mode needed unless scope grows.

Queue after that (owner-ordered, one per session): (2) owner-scheduled security fix — details in the owner's private
notes, must land before Step 3; (3) real tenant Clients list, replacing admin-service's in-memory TenantStore
(DECISION-013); (4) Step 3 persistence (~12 sessions, needs owner decisions D1-D7 first, re-check S166 PR B overlap);
(5) Step 4 least-privilege DB + real RLS (~13 sessions, needs owner decisions E1-E7, touches shared-auth, security
review before push); (6) Step 6 remainder — DECISION-032 gate + >400-line file splits (38 files over limit).

Frozen / do-not-touch without explicit instruction: shared-* packages (Tier 1, api-gateway included) — additive only,
list every consumer before any change; intelwatch.in and ti-platform-* containers — never touch; frontend is UI-FROZEN
(design system locked, data-wiring changes only, no visual redesign without the ui-design-workflow skill).

Module → skill map: any new/modified ETIP microservice under /apps/ → etip-service-pattern skill; any test file →
etip-testing skill; before any push → pre-push skill (mandatory, runs make pre-push equivalent checks); before
proposing an architectural alternative → check docs/DECISIONS_LOG.md first (lazy-load, don't read by default);
current-step roadmap spec → read the specific STEP_NN_*.md file for whichever queue item is active, not the whole
roadmap folder.

Owner does a browser check after each deploy — CI/unit tests with correct shapes still aren't a substitute for a live
click-through (this is exactly how RCA #49 and #50 were caught in S168 — both were owner-reported, not test-caught).

Note: a personal (non-IntelWatch) OpenRouter free-router task has its own plan at
C:/Users/manis/bin/OR_FREE_ROUTER_PLAN.md — unrelated to this project, do not pull it into IntelWatch session scope.
```
