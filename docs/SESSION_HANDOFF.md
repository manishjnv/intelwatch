# SESSION HANDOFF DOCUMENT

**Date:** 2026-09-29
**Session:** 174
**Session Summary:** Plan feature flags (`enabled:false`) were enforced only in the api-gateway's `preHandler` — nginx proxied 14 `/api/v1/*` service paths straight to the backend with identity checks only, so a tenant whose plan disabled a feature could still call it directly. PR #66 fixes this at the nginx edge: 14 locations set `X-Etip-Feature`, `auth-verify.ts` checks the plan and returns 403 `FEATURE_NOT_AVAILABLE`. A real trap was found and guarded during the fix: an `auth_request` subrequest re-runs server-level `set`/`rewrite` directives, so a server-level default for the same variable would have silently failed the check open — proven on a throwaway nginx container, guarded with a dedicated 31-test file that asserts no such default exists.

## ✅ Changes Made (Session 174)

| Commit(s) | Description |
|---|---|
| `d2ca0ac` → merge `e240372` | PR #66: 14 nginx locations set `$etip_feature`/`X-Etip-Feature`; `auth-verify.ts` checks `getPlanLimits` and returns 403 `FEATURE_NOT_AVAILABLE`; `error_page 403 = @etip_plan_denied;` for the JSON body; `nginx-feature-map.test.ts` guards against the auth_request variable-clobber trap (RCA #64). |
| `e8bd4e6`, `2523c99` | Post-deploy docs: `S174_PLAN_FEATURE_GATE.md`, RCA #64, PROJECT_STATE, handoff, stats; RCA symptom reworded (found by review, not observed). |
| `c5c6459`, `1aa8e9a` | Owner check snippet fixed (must send the Bearer token); owner browser check PASSED recorded. |
| `0abcbda` | DECISION-049 (Step 3 D1–D7 accepted) + DECISION-050 (functional first); queue now starts Step 3. |
| session-end commit | PROJECT_STATE WIP rewrite, handoff corrections, README badge. |

VPS HEAD `e240372`, 32/32 `etip_` containers healthy. api-gateway 366/366 (was 324), typecheck/lint clean, frontend unchanged (2,116 + 2 skipped). Real monorepo total 9,342 passed + 2 skipped (was 9,300 + 2). Full detail: `docs/S174_PLAN_FEATURE_GATE.md`.

## 📁 Files / Documents Affected (Session 174)

**New doc:** `docs/S174_PLAN_FEATURE_GATE.md`.

**Code touched:** `docker/nginx/conf.d/default.conf`, `docker/nginx/conf.d/service-auth.inc`, `apps/api-gateway/src/routes/auth-verify.ts`, `apps/api-gateway/tests/auth-verify.test.ts`, `apps/api-gateway/tests/nginx-feature-map.test.ts` (new).

**Modified (docs):** `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md` (this file), `docs/DEPLOYMENT_RCA.md` (RCA #64), `docs/ETIP_Project_Stats.html`, `docs/DECISIONS_LOG.md` (049, 050), `docs/roadmap/STEP_03_PERSISTENCE.md` (unblocked), `README.md` (test badge).

## 🔧 Decisions & Rationale (Session 174)

**DECISION-049** — Step 3 owner decisions D1–D7 accepted as recommended (Redis `noeviction` + 512 MB, additive Prisma models per module session, 503 on DB error, archive off, TAXII store check, reporting before Step 4, one-time credential re-entry). **DECISION-050** — functional work first; audits only at a minimal level inside feature tasks (owner: "do audit only at minimal level just to ensure functionality is working"). The PR #66 fix itself needed no new decision: it applies the same server-side-enforcement principle behind S147c/RCA #48 (auth) to plan-level authorization: a feature hidden in the UI only is not gated — the server must reject it regardless of client.

## 🧪 Deploy Verification Results (Session 174)

```
PR #66 → e240372 : api-gateway 366/366, typecheck/lint clean, frontend unchanged.
                    nginx -t clean on the live config, no new warnings.
                    Runtime semantics verified in a throwaway nginx:1.27-alpine container (6/6):
                      gated route -> 403 JSON FEATURE_NOT_AVAILABLE; mapped route with feature
                      enabled -> 200; unmapped route sends no X-Etip-Feature header; a client-sent
                      X-Etip-Feature header cannot inject or override the server-computed value.
                    VPS HEAD e240372, 32/32 healthy, public / and /health 200,
                    unauthenticated /api/v1/drp/assets 401 (auth still required first).
Real monorepo test total: 9,342 passed + 2 skipped (was 9,300 + 2).
Reviews: etip-reviewer PASS. Codex adversarial review: no bypass found;
1 Low UI note (Command Center Alerts & Reports tab fetches /alerts + /reports with no
plan check — no impact today, both enabled on every seeded plan; deferred).
Owner browser check PASSED: Free-plan tenant_admin (incognito) -> /api/v1/drp/assets
403 FEATURE_NOT_AVAILABLE (digital_risk_protection); ~11k repeated calls from an
accidental DevTools Live Expression all returned the same 403, no errors.
Sensitive-content grep before commit: clean (no secrets/PII/unfixed-vuln details/@-emails).
```

## ⚠️ Open Items / Next Steps (Session 174)

**Owner re-prioritised 2026-09-29 (DECISION-050): functional work first, no standalone audit sessions.** Every functional task does a *minimal* audit of the pages it touches (real data or honest empty state, no crash) and removes fake data it meets there.

**Ordered task queue (one task per fresh session):**
1. ~~Plan-enforcement gap~~ — DONE this session (PR #66, owner browser check PASSED).
2. **Step 3 — no business data in memory** (`docs/roadmap/STEP_03_PERSISTENCE.md`; D1–D7 accepted as recommended, DECISION-049). Run the §10 rows in order, one per session. **First session (S175): the `154-0` ops row** — deploy pushes the schema *before* recreating app containers and fails the deploy if the push fails; plus D1 (Redis `noeviction` + `maxmemory 512mb` in `docker-compose.etip.yml`) and D4 (`TI_ARCHIVE_ENABLED=false`). Re-verify spec §3 against current code first (S168 added an `integrations` table). Then alerting (2 sessions), integration (2), DRP (2), hunting, small ones.
3. Wiring fixes found in the S173 sweep: `apiList` drops pagination totals; broken request bodies (correlation Create Ticket, DRP bulk triage + takedown, Jira/ServiceNow creation form); frontend admin `TenantRecord` type vs real `/admin/tenants` shape; missing/mismatched backend routes (TAXII managed-collection list, global IOC stats, `/ingestion/catalog/subscription-stats`, `/analytics/feed-performance` shape, per-source enrichment breakdown, test-notification route).
4. AI enrichment runner (DECISION-045) — also replaces the fake vendor verdicts in `EnrichmentDetailPanel` / `InvestigationDrawer` with real ones.
5. Graph visual redesign — needs owner reference designs; load the ui-design-workflow skill.
6. Owner-scheduled security fix (includes private items — see private notes); needs owner go-ahead + adversarial review; before the first real customer.
7. Folded into the tasks above, no own session: rest of old audit PR 3 (demo rows on IOC/malware/vuln/actor lists, fake MITRE IDs on actors, `PageStatsBar` Demo badge — shared-ui still needs owner approval), remaining `isDemo` hooks (access reviews, break-glass, campaigns; `useFeeds` swallows errors). Old audit PR 4 (dead demo code) waits until something needs it.
8. Deferred from S174, tracked in `docs/S174_PLAN_FEATURE_GATE.md`: (a) daily/monthly usage counters not applied on nginx-proxied routes; (b) Command Center Alerts & Reports tab has no plan check (no impact today); (c) `apps/api-gateway/src/config/feature-routes.ts` stale entries (`/hunting`, `/correlation`, `/threat-actors`, `/integrations`→`api_access`).

**Owner actions:** ~~browser check~~ **PASSED 2026-09-29** — Free-plan `tenant_admin` in incognito got `403` + `FEATURE_NOT_AVAILABLE` (`digital_risk_protection`) on `/api/v1/drp/assets` (snippet in `docs/S174_PLAN_FEATURE_GATE.md`; it sends the Bearer token from `localStorage.etip_auth`, a bare fetch returns 401 — paste at the console prompt, NOT as a Live Expression, which re-runs every 250 ms). ~~D1–D7~~ accepted. Still open: graph reference designs (task 5), security-fix go-ahead (task 6), `PageStatsBar` OK (only if a task needs it).

## 🔁 How to Resume (Session 175)

```
Run /session-start, then start task 2 (Step 3, first row `154-0` ops + D1 + D4) from this file.
Module: devops (deploy.yml + docker-compose.etip.yml) — deploy ordering changes can cause an outage:
dry-run what you can, keep the change small, and verify the next deploy end to end.

Frozen / do-not-touch without explicit instruction: shared-* packages (Tier 1, api-gateway
included) — additive only, list every consumer before any change; shared-ui needs owner approval
for any PageStatsBar change. intelwatch.in and ti-platform-* containers — never touch.
nginx conf.d changes must pass `nginx -t` inside the live container before merge (deploy
force-recreates etip_nginx; a bad config = outage) and must not add a server-level `set` for any
variable read inside an auth_request location (RCA #64).
```

---

# Previous session

**Date:** 2026-09-29
**Session:** 173
**Session Summary:** DECISION-048 honest-empty-states sweep COMPLETE + audit PR 2 + Customization wiring. Every page swept this session shows real data, an honest empty state, or an error card with Retry — no demo fallbacks remain in the swept hooks. 5 PRs merged and deployed. **PR #61** closes `/hunting` + `/correlation` + `/analytics`. **PR #62** closes DRP + alerting + reporting and fixes a request-body double-encoding bug that had been silently rejecting 16 write calls. **PR #63** closes integrations + customization + onboarding + global monitoring and fixes the module-toggle endpoint. **PR #64** stops the dashboard analytics hook from ever rendering demo numbers, on load or on error. **PR #65** (audit PR 2) fixes Command Center stats, `/search`, the IOC active-feed count, enrichment/AI-cost widgets, and wires Customization risk-weights/notifications/stats to real backend routes.

## ✅ Changes Made

| Commit(s) | Description |
|---|---|
| `9a0adf4`, `e529678` → merge `ad46f0c` | PR #61: `/hunting`, `/correlation`, `/analytics` honest empty/error states (RCA #57). |
| `7efea8a` → merge `0441dc5` | PR #62: DRP, alerting, reporting honest states + adapters; `lib/api.ts` stops double-encoding string request bodies (RCA #58–#59). |
| `ac690b5`, `39fc677` (+ docs fix `bb0d1fa`) → merge `2af3883` | PR #63: integrations, customization, onboarding, global monitoring honest states; module toggle fixed to `PUT /customization/modules/:module` (RCA #60). |
| `74dbd3c` (+ docs `77825b3`) → merge `318c719` | PR #64: dashboard analytics hook never renders demo numbers while loading or on error (RCA #61). |
| `f3b86ec` (+ docs fix `57beed5`) → merge `a561a8e` | PR #65: Command Center / search / IOC feed count / enrichment widgets real data; Customization tabs wired to real routes (RCA #62–#63). |

All 5 PRs merged to master and deployed; VPS HEAD `a561a8e`, 32/32 `etip_` containers healthy after every deploy. Full detail: `docs/S173_HONEST_EMPTY_PR1.md`, `…PR1B.md`, `…PR1C.md`, `…PR1D.md`, `docs/S173_AUDIT_PR2_AND_CUSTOMIZATION.md`.

## 📁 Files / Documents Affected

**New docs:** `docs/S173_HONEST_EMPTY_PR1.md`, `docs/S173_HONEST_EMPTY_PR1B.md`, `docs/S173_HONEST_EMPTY_PR1C.md`, `docs/S173_HONEST_EMPTY_PR1D.md`, `docs/S173_AUDIT_PR2_AND_CUSTOMIZATION.md`.

**Main frontend areas touched:** `apps/frontend/src/hooks/use-phase4-data.ts` (hunting/correlation/DRP/graph), `use-analytics-data.ts`, `use-analytics-dashboard.ts`, `use-alerting-data.ts`, `use-reporting-data.ts`, `use-phase5-data.ts`, `use-phase6-data.ts`, `use-global-monitoring.ts`, `use-command-center.ts`, `use-es-search.ts`, `use-enrichment-data.ts`; pages `CorrelationPage.tsx`, `HuntingWorkbenchPage.tsx`, `DRPDashboardPage.tsx`, `AlertingPage.tsx`, `ReportingPage.tsx`, `IntegrationPage.tsx`, `CustomizationPage.tsx`, `GlobalMonitoringPage.tsx`, `DashboardPage.tsx`, `AnalyticsPage.tsx`, `IocListPage.tsx`; `apps/frontend/src/lib/api.ts` (double-encoding fix).

**Modified (docs, this pass):** `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md` (this file), `docs/DEPLOYMENT_RCA.md`, `docs/ETIP_Project_Stats.html`, `README.md`.

## 🔧 Decisions & Rationale

No new DECISION entries this session — DECISION-048 (honest empty states for real tenants, recorded in S172) applied throughout every hook and page swept.

## 🧪 Deploy Verification Results

```
PR #61 → ad46f0c : run 36471944056 green (test 6m23s, build 2m26s, deploy 3m30s). VPS HEAD ad46f0c,
                    32/32 healthy, /health + /ready 200. Frontend 1,995 + 2 (was 1,990).

PR #62 → 0441dc5 : run 36486677254 green. 32/32 healthy. Frontend 2,008 + 2.

PR #63 → 2af3883 : green. 32/32 healthy. Frontend 2,043 + 2.

PR #64 → 318c719 : run 36493587783 green. VPS HEAD 318c719, 32/32 healthy, /health + /ready 200.
                    Frontend 2,073 + 2.

PR #65 → a561a8e : all Sonnet implementation + review passes green (1 FAIL caught the module-toggle
                    endpoint before merge, fixed in PR #63). VPS HEAD a561a8e, 32/32 healthy.
                    Frontend 2,116 + 2 skipped (was 2,073 + 2).

Real monorepo test total: 9,300 passed + 2 skipped (was 9,179 + 2 at session start).
Adversarial review: codex:rescue n/a — no auth/security code changed this session; integration-
credential mapping in PR #63/#65 checked by Opus against the backend schema instead.
Sensitive-content grep before each commit: clean (no secrets/PII/unfixed-vuln details/@-emails).
```

## ⚠️ Open Items / Next Steps

**Ordered task queue (one task per fresh session):**
1. Owner-scheduled private item #1 (due now that Step 5 is done — see private notes).
2. Audit PR 3: fake vendor verdicts in IOC detail / investigation panels (`EnrichmentDetailPanel`, `InvestigationDrawer`), demo rows on IOC/malware/vulnerability/threat-actor lists, fake MITRE IDs on actors, `PageStatsBar` Demo badge (shared-ui — needs owner approval).
3. Audit PR 4: delete unused demo datasets and dead code (e.g. `use-search-data.ts`, `DEMO_*` fixtures now only used by tests).
4. Wiring fixes found in the sweep: `apiList` drops pagination totals (`api()` returns only `json.data`); broken request bodies (correlation Create Ticket, DRP bulk triage + takedown, Jira/ServiceNow creation form lacks email/username); frontend admin `TenantRecord` type vs the real `/admin/tenants` shape (plan names, no seats); missing/mismatched backend routes (TAXII managed-collection list, global IOC stats — `GlobalIocStatsService` unwired, `/ingestion/catalog/subscription-stats`, `/analytics/feed-performance` shape, per-source enrichment breakdown, test-notification route).
5. Remaining hooks still reading `isDemo`: access reviews, break-glass, campaigns; `useFeeds` swallows errors.
6. Graph visual redesign — needs owner reference designs; load the ui-design-workflow skill.
7. AI enrichment runner (DECISION-045).
8. Owner-scheduled security fix (includes private items — see private notes); needs owner go-ahead + adversarial review.
9. Step 3 (no data in memory) — blocked on owner decisions D1–D7.

**Owner actions:** incognito browser check of every changed page on a 0-data tenant (dashboard, `/drp`, `/alerting`, `/reporting`, `/integrations`, `/customization`, `/onboarding`, Command Center, `/search`, `/iocs`); unblock task 2 (`PageStatsBar` OK to touch), task 6 (reference designs), task 8 (go-ahead), task 9 (D1–D7 decisions).

## 🔁 How to Resume

```
Run /session-start, then start task 1 from SESSION_HANDOFF.md.

Frozen / do-not-touch without explicit instruction: this session was frontend data-wiring only —
no visual redesign except where task 6 above explicitly calls for it (graph redesign, needs the
ui-design-workflow skill and owner reference designs first). shared-* packages (Tier 1, api-gateway
included) — additive only, list every consumer before any change; shared-ui needs owner approval
before task 2's PageStatsBar change. intelwatch.in and ti-platform-* containers — never touch.
```

## Agent Utilization

- **Opus:** plan, diff critique, 6 small fixes (duplicate toast, demo-domain scan button, api.ts double-encode, module-toggle endpoint, reset label, doc corrections), deploy checks, private-file containment.
- **Sonnet:** 21 implementation runs (parallel slices per PR) + 1 design pass + 2 doc runs; 6 etip-reviewer passes (1 FAIL caught the module-toggle endpoint).
- **Haiku:** 1 context digest, 2 mapping sweeps, 1 tenant check, 6 doc runs.
- **codex:rescue:** n/a — no auth/security code changed; integration-credential mapping checked by Opus against the backend schema.

**Routing telemetry:**
- Haiku · PR docs · reworked: Y (misplaced RCA entry, wrong IOC-type count, invented hook names — Sonnet doc-correction pass needed)
- Sonnet · parallel page slices · reworked: Y once (module-toggle endpoint caught in review)
- Sonnet · design pass (customization wiring) · reworked: N
