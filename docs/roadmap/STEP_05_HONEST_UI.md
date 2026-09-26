# Step 5 — Honest UI, missing endpoints, auto-enrich critical IOCs (S161–S166)

**Written:** 2026-09-25 · **Status:** in progress — S161a PR A deployed (PR #44, 2026-09-26); PR B next · **Roadmap:** docs/ROADMAP_S149_PLUS.md §3 step 5, §4 Phase 2 (W6, W7, W8, W13, W17)
**Details from:** docs/S147_APP_WIRING_FOLLOWUPS.md (Follow-ups B and C), DECISION-013, 029, 030, 031.
**Before you start:** step 3 (persistence) and step 4 (RLS) should be green. Every claim below was checked against the code on 2026-09-25; re-check line numbers, they drift.

---

## 1. Goal
1. When an API **fails**, the page says so ("Couldn't load — Retry"). It never shows invented users, plans or costs as if they were real.
2. Every call the UI makes hits a real route with the right shape.
3. Command Center "Clients" lists the real tenants from Postgres.
4. Critical/high IOCs get enriched by default, inside a per-tenant daily cost cap.
5. Demo annual prices match the seeds (W17).

## 2. Why now
We can't sell a product whose screens may be fake. Today a 500, a 404 and a real empty list all look the same: a "Demo" badge and made-up rows. Paid signup (parallel track, Razorpay) must wait for this.

## 3. Current state (verified)

### 3.1 How demo fallback works today
- Every data hook catches its own error and returns an empty value: `.catch(err => notifyApiError(err, 'x', empty))`. `notifyApiError` (`apps/frontend/src/hooks/useApiError.ts:33`) shows a toast and **returns the fallback**, so TanStack Query never sees an error (`isError` is always false).
- `withDemoFallback(result, demo, hasData)` then swaps in demo data whenever the result is empty. So **errors and real empty lists both become demo data**.
- The helper is copy-pasted **7 times**: `use-analytics-data.ts:22`, `use-phase4-data.ts:53`, `use-phase5-data.ts:57`, `use-phase6-data.ts:91`, `use-alerting-data.ts:31`, `use-reporting-data.ts:30`, `use-global-monitoring.ts:93` (all under `apps/frontend/src/hooks/`).
- 19 more hooks do the same thing inline (`isDemo = !isLoading && empty`): `use-access-reviews`, `use-analytics-dashboard`, `use-break-glass`, `use-campaigns`, `use-command-center` (:221–227), `use-compliance-reports`, `use-es-search`, `use-feature-limits` (:111–116), `use-global-ai-config` (:124–129), `use-global-iocs`, `use-linked-iocs`, `use-mfa`, `use-offboarding`, `use-plan-builder` (:96–101), `use-plan-limits`, `use-search-data`, `use-sessions` (:16), `use-sso`, `use-tenant-overrides`.

### 3.2 Hooks that use `withDemoFallback` (≈70) and the pages that show them
| Hook file | Hooks (endpoint) | Shown on |
|---|---|---|
| use-analytics-data | Widgets `/analytics`, Trends, Executive, ServiceHealth | AnalyticsPage |
| use-phase4-data | DRP ×5 `/drp/*`, Graph ×2 `/graph/*`, Correlation ×3, Hunts ×5 | DRPDashboardPage, ThreatGraphPage, CorrelationPage, HuntingWorkbenchPage, IocDetailPanel |
| use-phase5-data | Integrations ×6, Users ×6 `/users/*`, Customization ×10 | IntegrationPage, UserManagementPage, CustomizationPage, Command Center UsersAccessTab, ComplianceReportsPanel |
| use-phase6-data | Billing ×5, Admin ×7 `/admin/*`, Onboarding ×5 | BillingPage, AdminOpsPage, OnboardingPage, BillingPlansTab, SystemTab, PipelinePanel |
| use-alerting-data | Alerts, stats, history, search, rules, templates, channels, escalations | AlertingPage, AlertsReportsTab |
| use-reporting-data | Reports, stats, templates, schedules, comparison | ReportingPage, AlertsReportsTab |
| use-global-monitoring | Global IOC stats, corroboration, subscription stats | GlobalMonitoringPage |

### 3.3 Three fallbacks that are worse than cosmetic
| Where | What happens on error | Why it matters |
|---|---|---|
| `use-mfa.ts:18–23` `useMfaSetup` | Returns `DEMO_MFA_SETUP` (fixed secret + fixed backup codes, `security-demo-data.ts:46`) | The user can scan a **fake QR code**, then verify fails. Security UX bug. Remove first |
| `use-feature-limits.ts:111–116` | Returns `DEMO_LIMITS` (12 features enabled, random usage) | FeatureGate unlocks menus the plan doesn't include. Backend still enforces quotas, but the UI lies |
| `use-sessions.ts:16` | Returns `DEMO_SESSIONS` | "Active sessions" security screen shows fake devices |

### 3.4 Missing or mismatched endpoints (Follow-up C, re-verified)
Frontend base is `/api/v1` (`apps/frontend/src/lib/api.ts:8`). nginx: `docker/nginx/conf.d/default.conf`.

| UI call (file:line) | Backend reality | Decision |
|---|---|---|
| `GET /users` — `useUsers` (use-phase5-data.ts:196) | user-management-service (UMS) has no list route. `GET /users/team` exists (`routes/teams.ts:19`) but reads an **in-memory** `TeamStore` (`services/team-store.ts:20`), not the real `users` table | **Add backend route** in UMS reading Prisma `User` |
| `GET /users/teams`, `POST /users/teams` (:210, :282) | No Team model in Prisma. Only the in-memory TeamStore | **No backend.** Hide the Teams tab (owner decision O2) |
| `GET /users/roles`, `POST /users/roles` (:223, :291) | Route exists (`routes/permissions.ts:27`) but reads an in-memory `PermissionStore` (`services/permission-store.ts:61`). Real RBAC is the 3-value `Role` enum + `packages/shared-auth/src/permissions.ts:32`. Custom roles are never enforced | **Fix UI**: show the 3 real roles read-only with an adapter. Hide "Create role" (O2) |
| `GET /users/sessions` (:236) | UMS route exists but in-memory (`services/session-manager.ts:20`). Real sessions: gateway `GET /auth/sessions` (`api-gateway/src/routes/sessions.ts:9`, Prisma, current user only) | **Fix UI path** to `/auth/sessions` |
| `GET /users/audit` (:249) | No UMS route. Gateway has `GET /settings/audit` (`api-gateway/src/routes/audit.ts:47`) but it requires `org:read`, which only super_admin holds, so tenant admins get 403 | **Add backend route** in UMS reading Prisma `AuditLog` (keeps the session in one module; avoids editing the Tier-1 gateway) |
| `GET /users/stats` (:263) | No route | **Add backend route** in UMS |
| `POST /users/invite` (:273) | No route. Existing invite flow is admin-service in-memory `inviteToken` | Out of scope. Hide button until a DB-backed invite exists (O2) |
| `GET /enrichment/ioc/:id` — `useIOCEnrichment` (use-enrichment-data.ts:237), used by IocDetailPanel.tsx:66 | No route. Only `/enrichment/cost/ioc/:iocId` (`ai-enrichment/src/routes/cost.ts:22`). Results are stored in `Ioc.enrichmentData` (`repository.ts:17`) | **Add backend route** in ai-enrichment |
| `GET /graph/entity/root` — `useGraphNodes` (use-phase4-data.ts:244) | `/entity/:id` needs a real node id and returns 404 for "root" (`threat-graph/src/service.ts:94`). Shapes also differ: backend `nodeType`, `type`, `fromNodeId/toNodeId`, `nodesByType`; UI wants `entityType`, `relationshipType`, `sourceId/targetId`, `byType` | **Add backend route** `GET /graph/overview` + UI adapter |
| MFA enforcement `/settings/mfa/enforcement`, `/admin/mfa/enforcement` (use-mfa.ts:88, :98) | Real routes are mounted under `/api/v1/auth` (`api-gateway/src/app.ts:131`, `routes/mfa.ts:128–181`), so the right paths are `/auth/settings/mfa/enforcement` and `/auth/admin/mfa/enforcement`. These are Prisma-backed and are what login checks. UMS `/users/mfa/policy` (`routes/mfa.ts:107,120`) is in-memory, has no role check, and is not enforced anywhere | **Fix UI path** to `/auth/...`. Do not use `/users/mfa/policy` |
| Ticketing list `GET /integrations?type=ticketing` (use-phase5-data.ts:98) | `type` must be one of `splunk_hec, sentinel, elastic_siem, servicenow, jira, webhook` (`integration-service/src/schemas/integration.ts:5`). `ticketing` fails Zod → 400 → demo. The S147 fix is itself broken | **Fix UI**: fetch without `type`, keep `jira` + `servicenow` rows |
| Ticketing create `POST /integrations/ticketing` (:161) | No such route. Real: `POST /integrations` with `CreateIntegrationSchema` (`schemas/integration.ts:106`) | **Fix UI** body (§7) |
| `GET /customization/ai/global` (use-global-ai-config.ts:109) | Path OK. Returns `{config[], recommendations, costEstimate:{totalMonthly, perSubtask[]}}` (`customization/src/routes/global-ai.ts:39–52`). UI reads `{subtasks, confidenceModel, activePlan}`, gets `[]`, shows demo. Confidence model is a separate `GET /confidence-model` (:139). 503 when `TI_GLOBAL_PROCESSING_ENABLED` is false (default in compose) | **Fix UI** with an adapter. 503 → "Global processing is off" state, not demo |
| Command Center tenant mutations (use-phase6-data.ts:266–290) | Suspend/reinstate send `POST`, backend is `PUT` (`admin-service/src/routes/tenants.ts:72`). Bodies are `JSON.stringify`-ed twice (`api()` already stringifies, `lib/api.ts:90`) | Replaced by §3.5 |

### 3.5 Command Center "Clients"
- `ClientsTab` (`components/command-center/ClientsTab.tsx:194`) gets `tenantList` from `useCommandCenter` → `GET /customization/command-center/tenant-list` (`hooks/use-command-center.ts:140`).
- That route (`customization/src/routes/command-center.ts:115`, query `services/command-center-queries.ts:208`) lists only tenants **that consumed global items** in the period and returns `{tenantId, itemsConsumed, attributedCostUsd}`. The UI type needs `name, plan, members, status, usagePercent` (`use-command-center.ts:38`), so those are `undefined`, and the search filter calls `t.name.toLowerCase()` (ClientsTab.tsx:203). On error it falls back to `DEMO_TENANT_LIST` (:225).
- "Add client" (`AddClientModal.tsx:41`) and AdminOpsPage use admin-service `/admin/tenants`, an **in-memory** registry (`admin-service/src/services/tenant-store.ts`, DECISION-013). admin-service has no Prisma dependency (`apps/admin-service/package.json`).
- **Who owns tenants?** Nobody, cleanly. Tenant rows are created by `@etip/user-service` code running inside api-gateway (`/auth/register`). The plan is changed by gateway `POST /billing/upgrade` (`api-gateway/src/routes/billing-upgrade.ts`, super admin picks the tenant with `x-tenant-id`). Offboarding lives in UMS. Suspension is `Tenant.active=false`, enforced at login/refresh (`user-service/src/service.ts:120,205`).

### 3.6 Enrichment is idle
- `EnrichmentService.enrichIOC` returns `skipped` for **every** IOC when `TI_AI_ENABLED=false` (`ai-enrichment/src/service.ts:77–85`), even the free VT/AbuseIPDB lookups. Compose default is `false` for `etip_enrichment` (`docker-compose.etip.yml:407`; line 305 is the same flag for ingestion).
- normalization enqueues **every** new/changed IOC (`normalization/src/service.ts:586–599`), with `severity` in the job.
- A per-tenant daily cap **already exists** for the Haiku step: `costTracker.checkBudgetAlert(tenantId, dailyBudgetUsd)` (`service.ts:156–170`, `cost-tracker.ts:200`), limit from `TI_ENRICHMENT_DAILY_BUDGET_USD` (default $5, `config.ts:44`). Spend is in memory, flushed to Redis every 60 s (`cost-persistence.ts`), and written to `ai_processing_costs` for Command Center (`cost-tracker.ts:103`). Over 90 % → rule-based fallback.
- `PlanTierConfig` has `aiEnabled` and `dailyTokenBudget` per plan (`prisma/schema.prisma:859`). Only customization reads it; ai-enrichment ignores it.
- VirusTotal free tier is 4 requests/min (`config.ts:36`). Enriching all 5,934 IOCs this way takes ~25 h. Critical/high only is the realistic default.

### 3.7 Demo prices (W17)
`use-plan-builder.ts:80–82` demo annual prices 99,999 / 189,999 / 499,999 and plan id `teams`. Seeds (`prisma/seeds/plan-definitions.ts:84,112,140`): 95,988 / 179,988 / 479,988 and plan id `pro`.

## 4. Flow (target)
```
hook ──► api()/apiList() ──► 2xx rows>0 ──────────────► real data
                         ├─► 2xx rows=0 ──► EmptyState (+ "Show sample data" if allowed, labelled)
                         └─► throws ─────► ErrorState "Couldn't load <thing>. Retry"  (isError=true)

IOC upsert (normalization) ──► ENRICH_REALTIME ──► ai-enrichment
        severity in autoSeverities (default critical,high) OR manual trigger?
          no  ──► skip, status 'not_selected' (cheap, no API calls)
          yes ──► free lookups (VT/AbuseIPDB/GSB/IPinfo, own rate limits)
                  └─► AI step only if TI_AI_ENABLED && tenant under daily cap
                  └─► save Ioc.enrichmentData ──► GET /enrichment/ioc/:id
```

## 5. One shared UI pattern
**New file `apps/frontend/src/lib/query-state.ts`** (frontend only; `packages/shared-ui` is design-locked):
```ts
export type ViewState<T> =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown; retry: () => void }
  | { kind: 'empty'; sample?: T }          // sample only when allowed, always labelled
  | { kind: 'data'; data: T }
export function toViewState<T>(q: UseQueryResult<T>, isEmpty: (d: T) => boolean,
  sample?: T): ViewState<T>
```
**New component `apps/frontend/src/components/ui/QueryStateView.tsx`** (< 120 lines): skeleton for loading (UI rule: never spinner alone), error card with the resource name, HTTP class ("Server error", "Access denied", "Not available on your plan") and a **Retry** button (`refetch()`), empty state with an actionable CTA, and a clearly labelled **"Sample data"** banner when showing a sample.

**Rules for hooks (enforced in review):**
1. Don't `.catch()` inside `queryFn`. Let it throw, so `isError` works. Toasts move to a global `QueryCache({ onError })` in the QueryClient setup, which keeps the 10-second debounce from `useApiError.ts`.
2. Hooks return `{ ...query, isEmpty }`. No `data` substitution in hooks.
3. Delete the 7 `withDemoFallback` copies as each file is converted.

**When demo/sample data is still allowed:** only if the request **succeeded**, returned **zero rows**, and the page is a showcase page (Dashboard widgets, Analytics, Threat Graph, Correlation, Hunting, DRP). Recommended: the empty state shows a **"Show sample data"** button, off by default and remembered per page in `localStorage`, with a "Sample data — not your organisation's data" banner. Never allowed for: users, sessions, MFA, billing/plans/invoices, feature limits, audit, admin/tenants, alerts. (We don't have tenant `createdAt` in the auth store, so "brand-new tenant" can't be detected without touching user-service. See O1.)

## 6. Backend changes (file by file)

**S162 — user-management-service** (existing Prisma client `src/prisma.ts`, same pattern as `services/scim-user-service.ts:92`)
- `src/routes/directory.ts` (new): `GET /` (list users), `GET /audit`, `GET /stats`. Register with prefix `/api/v1/users` in `src/app.ts` **after** the existing plugins so `/team`, `/roles` etc. keep winning. Tenant from `x-tenant-id` (nginx overwrites it, `service-auth.inc`). Role from `x-user-role`: list/stats need `tenant_admin` or `super_admin`; audit needs `audit:read` (`hasPermission` from `@etip/shared-auth`). No `'default'` tenant fallback in new code: missing header → 401.
- `src/services/user-directory.ts` (new): Prisma queries. `select` only safe fields (never `passwordHash`, `mfaSecret`, `mfaBackupCodes`, tokens).
- `src/schemas/user-management.ts`: add `UserDirectoryQuerySchema` (page ≥1, limit 1–500 default 50, `search`, `role`, `status: active|inactive|all`) and `AuditQuerySchema`.
- `tests/directory-routes.test.ts` (new).

**S164 — ai-enrichment**
- `src/routes/enrichment.ts`: `GET /ioc/:iocId` → `repo.findById(iocId, user.tenantId)` (tenant-scoped, `repository.ts:7`) → 404 if no IOC, else `{data: {...ioc.enrichmentData, enrichedAt, enrichmentStatus}}`. If `enrichmentData` is null → `{data: {enrichmentStatus:'pending'|'not_selected', ...nulls}}` with 200 (the UI shows "Not enriched yet — Enrich now").
- `src/config.ts`: add `TI_ENRICHMENT_AUTO_SEVERITIES` (default `critical,high`) and `TI_ENRICHMENT_LOOKUPS_ENABLED` (default `true`). `TI_AI_ENABLED` then controls only the Haiku step.
- `src/schema.ts`: `EnrichJobSchema` gets optional `manual: boolean`. `routes/enrichment.ts:24` trigger sets `manual: true`.
- `src/service.ts`: replace the early return at :77 with (a) severity gate unless `manual`, (b) lookups gate, (c) keep the budget gate at :156 for the AI step. Skipped-by-severity jobs return before any API call.
- `src/services/tenant-budget.ts` (new, small): per-tenant daily USD limit = `PlanTierConfig` for the tenant's plan (`aiEnabled=false` → no AI; limit from O4), cached 5 min, fallback `TI_ENRICHMENT_DAILY_BUDGET_USD`. Read `Tenant.plan` + `PlanTierConfig` with the existing ai-enrichment Prisma client (read-only).
- Tests: `tests/enrichment-routes.test.ts` (ioc route, tenant isolation), `tests/service-gating.test.ts` (severity, manual, lookups flag, AI off, over cap).
- Optional later (normalization module, S): stop enqueueing below-threshold severities at `normalization/src/service.ts:588` to save queue work.

**S165 — threat-graph**
- `src/routes/graph-extended.ts`: `GET /overview?limit=50` (`graph:read`). Picks the top-N nodes by connections (reuse `repo.getStats().mostConnected`, `schemas/graph.ts:248`) and returns them plus the edges between them, in `GraphSubgraphResponse` shape. Empty graph → `{nodes:[],edges:[]}` with 200.
- `src/service.ts` + `src/repository.ts`: one Cypher query, tenant-filtered like the others.
- `tests/overview.test.ts`.

**S166 — Clients (see O3 for module choice). Recommended: customization**
- `customization/src/services/command-center-queries.ts:208`: rewrite `getTenantList` to start from `tenants` and LEFT JOIN consumption/cost, user count (`users.active`), and `tenant_subscriptions.status`. Return every tenant, excluding offboarded ones unless `?includeOffboarded=true`.
- `customization/src/routes/command-center.ts:115`: same route, new shape (§7). Keep `requireSuperAdmin`.
- Tests in `customization/tests/command-center*.test.ts`.
- Plan change from the drawer calls the existing gateway `POST /billing/upgrade` with `x-tenant-id` (runbook docs/runbooks/SET_TENANT_PLAN.md). No new backend.
- Suspend/reinstate/delete and "Add client" stay **hidden** until a DB-backed route exists (follow-up session in UMS: `POST /api/v1/users/admin/tenants/:id/suspend` setting `Tenant.active` + revoking sessions).

## 7. API shapes

`GET /api/v1/users?page=1&limit=50&search=&role=&status=all` →
```json
{ "data": [{ "id":"uuid","name":"Asha R","email":"a@x.in","role":"analyst","team":null,
  "status":"active","lastLogin":"2026-09-20T10:00:00Z","mfaEnabled":true,
  "createdAt":"2026-08-01T00:00:00Z" }], "total": 7, "page": 1, "limit": 50 }
```
`status` = `active` if `User.active` else `locked` (matches `UserRecord`, `phase5-demo-data.ts:62`).

`GET /api/v1/users/audit?page&limit&action&userId&startDate&endDate` →
`{ "data":[{ "id","timestamp","userName","action","resource":"entityType:entityId","ip","details" }], "total","page","limit" }` (`details` = short JSON string of `changes`).

`GET /api/v1/users/stats` → `{ "data": { "totalUsers": 7, "activeSessions": 3, "teams": 0, "roles": 3, "mfaPercent": 43 } }` (`activeSessions` = `Session` with `revokedAt null` and `expiresAt > now`).

`GET /api/v1/enrichment/ioc/:iocId` → `{ "data": EnrichmentResult }` (UI type `use-enrichment-data.ts:121`), 404 `NOT_FOUND` if the IOC isn't in the caller's tenant.

`GET /api/v1/graph/overview?limit=50` → `{ "data": { "nodes": GraphNodeResponse[], "edges": GraphEdgeResponse[] } }`. The UI maps `nodeType→entityType`, `type→relationshipType`, `fromNodeId→sourceId`, `toNodeId→targetId`, `properties.label ?? id → label`, and for stats `nodesByType→byType`.

`GET /api/v1/customization/command-center/tenant-list?period=month` →
```json
{ "data": [{ "tenantId":"uuid","name":"Acme SOC","slug":"acme","plan":"starter",
  "status":"active","members":4,"itemsConsumed":1200,"attributedCostUsd":0.42,
  "usagePercent":37,"createdAt":"2026-09-01T00:00:00Z" }], "total": 12 }
```
`status`: `suspended` if `active=false`, `over_limit` if `usagePercent ≥ 100`, else `active`. `usagePercent` = IOC count / plan IOC limit (O3 note).

Ticketing create (UI fix, no backend change) → `POST /api/v1/integrations`:
```json
{ "name":"Jira SOC","type":"jira","triggers":["alert.created"],
  "ticketingConfig":{ "type":"jira","baseUrl":"https://acme.atlassian.net",
  "email":"soc@acme.in","apiToken":"…","projectKey":"SOC","issueType":"Task" } }
```
ServiceNow: `ticketingConfig:{type:'servicenow', instanceUrl, username, password, tableName:'incident'}`. The modal needs separate username/password (or email/API token) fields instead of one `credentials` string.

Global AI config (UI adapter): `subtasks = config.map(c => ({category, subtask, model: c.model, recommended: c.recommended.model, accuracyPct: c.recommended.accuracy, monthlyCostEstimate: costEstimate.perSubtask.find(...)?.monthlyCost ?? 0}))`; `confidenceModel` from `GET /customization/ai/global/confidence-model` → `{data:{model}}`; `activePlan: null` (not stored).

## 8. Frontend changes (file by file)
**S161 (frontend, M — split in two if the file count passes 5):**
- `src/lib/query-state.ts`, `src/components/ui/QueryStateView.tsx` (new).
- `src/main.tsx:8` (`new QueryClient`): global `QueryCache.onError` toast. Leave `entry-server.tsx` (prerender) alone.
- First batch, the security-sensitive ones: `use-mfa.ts` (remove `DEMO_MFA_SETUP`/`DEMO_ENFORCEMENT` fallbacks; also fix paths to `/auth/settings/mfa/enforcement` and `/auth/admin/mfa/enforcement`), `use-sessions.ts`, `use-feature-limits.ts` (on error: fall back to the plan in the auth store, not `DEMO_LIMITS`), `use-phase6-data.ts` billing + admin hooks, `use-phase5-data.ts` user hooks.
- Then, one file per follow-up PR: alerting, reporting, phase4 (DRP/graph/correlation/hunting), analytics, global-monitoring, command-center, the remaining inline hooks. Pages switch to `<QueryStateView>`.
- `use-plan-builder.ts:80–82`: annual prices 95,988 / 179,988 / 479,988 and `teams` → `pro` (W17). Add an assertion in its test that demo prices equal `src/data/plans.ts` × 12.

**S163 (frontend, S):** `use-phase5-data.ts` — ticketing list (no `type`, filter jira/servicenow), create body (§7), `useSessions` → `/auth/sessions`, roles adapter, hide Teams/Create role/Invite (O2); `use-global-ai-config.ts` adapter + 503 state; `use-phase4-data.ts:244` → `/graph/overview` + adapter (after S165 is live); `IntegrationModals.tsx` ticketing fields.

**After S166:** `use-command-center.ts` no `DEMO_TENANT_LIST` on error; `ClientsTab.tsx` plan selector → gateway `/billing/upgrade`; hide suspend/add until real; `use-phase6-data.ts:252–290` admin-service tenant hooks removed from the Clients path (AdminOpsPage keeps them, labelled "legacy registry", until removed).

## 9. Tests
- Frontend: `query-state.test.ts` (loading/error/empty/data/sample); for each converted hook, a test that a rejected `api()` gives `isError=true` and **no demo rows**; `use-mfa.test.ts` asserts no fake secret on error; plan-builder price test.
- UMS: tenant isolation (tenant A never sees B), role checks (analyst → 403 on list/audit), no secret fields in JSON, pagination bounds.
- ai-enrichment: gating matrix (severity × manual × AI flag × cap), `/ioc/:id` tenant isolation.
- threat-graph: overview on empty graph, limit bound (max 500).
- customization: tenant with zero consumption still listed; offboarded excluded.

## 10. Acceptance checks (production)
1. Stop `etip_alerting` for a minute: AlertingPage shows "Couldn't load alerts — Retry", **no Demo badge**. Start it, press Retry, real data.
2. `grep -rn "withDemoFallback" apps/frontend/src` → 0 results.
3. Users tab lists the real users of the tenant (compare with `SELECT count(*) FROM users WHERE tenant_id=…`).
4. MFA enforcement toggle survives a gateway restart and is honoured at next login.
5. Create a Jira integration from the UI → it appears in the list after reload.
6. Graph page loads real nodes (or an empty state with CTA), no 404 in the network tab.
7. Clients tab count = `SELECT count(*) FROM tenants WHERE offboarded_at IS NULL`.
8. Within 24 h of deploy: Enrichment page "Enriched today" > 0, only critical/high IOCs enriched, `/enrichment/cost/budget` under cap.
9. Browser network tab on each page: no 404/400 from our own API.

## 11. Rollback
- Tag before each session: `git tag safe-point-2026-MM-DD-s16X`.
- Frontend: revert the PR. Hooks are converted per file, so one bad page can be reverted alone.
- Backend routes are additive; revert the PR. Enrichment: set `TI_ENRICHMENT_AUTO_SEVERITIES=` (empty) and `TI_AI_ENABLED=false` in `.env` and restart `etip_ai_enrichment`. No schema migrations in this step.

## 12. Session breakdown (one module each)
| S | Module | Work | Size |
|---|---|---|---|
| 161a | frontend | Pattern + QueryCache toast + MFA/sessions/feature-limits/billing/admin/users hooks + W17 prices | M |
| 161a PR A ✅ | frontend | **Done (PR #44, 2026-09-26):** QueryStateView pattern, QueryCache toast, MFA/sessions/feature-limits/tenant-usage hooks, W17 prices, DECISION-035. **PR B next:** billing/admin hooks (`use-phase6-data.ts`) + user hooks (`use-phase5-data.ts`) + `usePlanBuilder` error fallback. Splitting into two PRs did not need an O1 decision first — O1 (sample data) only governs showcase pages, and none of PR A's or PR B's screens are showcase pages, so sample data is never allowed on them regardless of how O1 is answered. | M |
| 161b | frontend | Remaining hook files, one PR each (alerting, reporting, phase4, analytics, monitoring, command-center, inline hooks) | M ×2–3 |
| 162 | user-management-service | `GET /users`, `/users/audit`, `/users/stats` from Prisma | M |
| 163 | frontend | Paths/shapes: sessions, roles, ticketing, AI global, MFA (if not done in 161a), hide Teams/Invite | S |
| 164 | ai-enrichment | `GET /enrichment/ioc/:id`, severity gate, lookups vs AI split, per-plan cap | M |
| 165 | threat-graph | `GET /graph/overview` (+ frontend adapter in the next frontend PR) | S |
| 166 | customization (or admin-service, O3) | Real tenant list; plan change via gateway; hide fake actions | M |

## 13. Owner decisions needed
- **O1** Sample data: "Show sample data" button (recommended) or automatic for new tenants (needs tenant `createdAt` in the login response, a user-service change)?
- **O2** Teams, custom roles and invite have no database behind them. Hide now (recommended) or schedule DB-backed versions?
- **O3** Clients API home: **customization** (recommended: it already has Prisma, super-admin checks and the Clients route) or **admin-service** as the roadmap says (it has no DB, so it would have to call another service that also lacks the route)? Longer term, write a DECISION naming one tenant-owner service.
- **O4** Enrichment defaults: severities `critical,high`? Turn `TI_AI_ENABLED` on in production? Per-tenant daily cap in USD per plan (suggest Free $0 AI / Starter $1 / Teams $3 / Enterprise $10; `PlanTierConfig.dailyTokenBudget` is in tokens, so either convert or add a USD column).

## 14. Risks
- Turning off demo fallback will make broken services visible. That is the point, but expect a burst of "Couldn't load" screens. Do step 3 first so fewer services lose data on restart.
- UMS reading `users`/`audit_logs` directly follows the existing SCIM/offboarding pattern, but it bends "no cross-module DB queries". Record it in the PR.
- Enrichment volume: VT 4/min. A new feed with many critical IOCs will queue for hours. Watch queue depth.
- The in-memory UMS stores (team/role/session/mfa-policy) stay alive and misleading. Delete them in step 6 cleanup.
- `GET /enrichment/stats` (`routes/enrichment.ts:41`) and `/enrichment/cost/ioc/:iocId` (`routes/cost.ts:22`) are not tenant-scoped. Low impact (counts/costs), but fix it in S164 while in the file.
