# Step 6 — Cleanup: empty folders, oversized files, DECISION-032 gate

**Roadmap:** docs/ROADMAP_S149_PLUS.md §3 step 6, §4 Phase 3 (S167–168) · **Module:** chore (repo layout) + docs · **Size:** S + S, then "as touched"
**Status:** spec, not started. Written 2026-09-25. All counts checked against the repo on that date.

---

## 1. Goal

1. Remove the **empty `apps/` folders** so `ls apps` shows only real services.
2. Have a **clear split plan** for source files over the 400-line limit (CLAUDE.md "Max file lines: 400").
3. Get an **owner decision on DECISION-032** (run fewer processes) before Step 7 starts.

## 2. Why now

- Step 7 moves services around. A clean map first avoids confusion like `apps/billing` (empty) vs `apps/billing-service` (real).
- The PROJECT_STATE module table uses names such as `digital-risk-protection`, `threat-hunting`, `user-management`, `admin-ops` — the **same names as the empty folders**, while the real code lives in `drp-service`, `hunting-service`, `user-management-service`, `admin-service`. New sessions can open the wrong folder.
- Step 7 cannot start without the DECISION-032 answer.

## 3. Current state (verified)

### 3a. Empty folders

Checked with `git ls-files apps/<dir>` and `find apps/<dir> -type f`. Each one holds **only `.gitkeep` files, 0 source files, no `package.json`, no `tsconfig.json`**.

| Folder | Tracked files | Real code lives in |
|---|---|---|
| `apps/admin-ops` | 3 `.gitkeep` (src/services, src/workers, tests) | `apps/admin-service` |
| `apps/attack-surface-management` | 3 `.gitkeep` | inside `apps/drp-service` (attack-surface engine) |
| `apps/auth` | 3 `.gitkeep` (src/services, src/strategies, tests) | `apps/user-service` + `apps/api-gateway` |
| `apps/billing` | 2 `.gitkeep` | `apps/billing-service` |
| `apps/digital-risk-protection` | 3 `.gitkeep` | `apps/drp-service` |
| `apps/enterprise-integration` | 4 `.gitkeep` | `apps/integration-service` |
| `apps/reporting` | 3 `.gitkeep` | `apps/reporting-service` |
| `apps/threat-hunting` | 2 `.gitkeep` | `apps/hunting-service` |
| `apps/user-management` | 3 `.gitkeep` | `apps/user-management-service` |
| `apps/websocket` | 2 `.gitkeep` | nothing (no websocket service; nginx `/ws/` goes to `etip_api`, "future") |

**Count is 10, not 11** as the roadmap says (§2 W10, §3 step 6). All other `apps/*` folders have real sources (smallest: `analytics-service`, 20 source files).

### 3b. What references them

| Place | References? | Evidence |
|---|---|---|
| `pnpm-workspace.yaml` | Glob `apps/*` only. Folders without `package.json` are not workspace members → no effect | `pnpm-workspace.yaml` |
| `tsconfig.build.json` | No. Lists 8 packages + 23 real apps (lines 5–36) | — |
| `Dockerfile` | No per-folder COPY (lines 25–49). `COPY apps/ apps/` (line 60) copies them as empty dirs — harmless | — |
| `docker-compose.etip.yml` | No | `grep` → none |
| `.github/workflows/*.yml` | No | `grep` → none |
| `Makefile` | No | — |
| `pnpm-lock.yaml` | No (no package.json → no importer entry) | — |
| `scripts/scaffold.js` | **Yes.** Lines 23–29, 74–118 create these exact paths with `.gitkeep`. Running `pnpm scaffold` (package.json line 30) would re-create them | `scripts/scaffold.js` |
| `scripts/init-modules.js` | **Yes, by name.** Lines 13–45 list `auth`, `websocket`, `threat-hunting`, `digital-risk-protection`, `reporting`, `enterprise-integration`, `user-management`, `billing`, `attack-surface-management`, `admin-ops`; line 158 **writes `package.json` + `tsconfig.json` into `apps/<name>`**. Running it would turn the empty folders into broken workspace packages | `scripts/init-modules.js` 157–159 |
| Docs | Module **names** only (PROJECT_STATE module table lines 50–75, dependency map, skills table in `.claude/commands/session-start.md`). No path references | `grep -rn "apps/<name>"` → only scaffold.js |

Both scripts are from the v4.0 bootstrap and describe a module list that no longer matches reality.

### 3c. Files over 400 lines

Command used (non-test source under `apps/` and `packages/`):

```bash
git ls-files 'apps/*' 'packages/*' | grep -E '\.(ts|tsx|js|mjs)$' \
  | grep -vE '(\.test\.|\.spec\.|/__tests__/|/tests?/|/e2e/|\.d\.ts$|/dist/)' \
  | xargs wc -l | grep -v ' total$' | awk '$1>400' | sort -rn
```

Result: **38 files** (roadmap says 39 — likely counted with tests). 27 are frontend, 11 backend. `packages/` has none.

Full list: misp.ts 859 · AdminOpsPage.tsx 806 · BillingPage.tsx 759 · CorrelationPage.tsx 718 · AlertsReportsTab.tsx 707 · normalization/service.ts 698 · CustomizationPage.tsx 682 · BillingPlansTab.tsx 676 · HuntingWorkbenchPage.tsx 668 · ComplianceReportsPanel.tsx 584 · integration/schemas/integration.ts 580 · phase6-demo-data.ts 555 · ReportingPage.tsx 547 · use-phase5-data.ts 547 · ingestion/workers/feed-fetch.ts 542 · use-phase4-data.ts 539 · use-phase6-data.ts 515 · ThreatGraphPage.tsx 514 · demo-data.ts 504 · use-es-search.ts 501 · ingestion/workers/pipeline.ts 489 · ConfigureTab.tsx 477 · SsoConfigPanel.tsx 472 · ModuleIcons.tsx 472 · ioc-intelligence/service.ts 461 · customization/services/ai-model-store.ts 454 · threat-actor-intel/scoring.ts 448 · user-service/compliance-report-service.ts 442 · PlanBuilderPanel.tsx 435 · analytics/services/aggregator.ts 427 · IntegrationModals.tsx 420 · UsersAccessTab.tsx 416 · threat-actor-intel/service.ts 414 · DRPModals.tsx 413 · TenantSettings.tsx 413 · use-intel-data.ts 404 · AlertingPage.tsx 403 · EnrichmentDetailPanel.tsx 401.

## 4. Split plan — top 10

Rule from the roadmap: **split a file when a session already touches it.** Pure moves, no behaviour change, tests unchanged and green. Re-export from the old path if other files import it.

| # | File (lines) | Split into | Natural "touch" session |
|---|---|---|---|
| 1 | `apps/ingestion/src/connectors/misp.ts` (859) | `misp/schemas.ts` (Zod schemas, lines 7–145), `misp/rest-fetch.ts` (`fetch()`, lines 183–473), `misp/feed-fetch.ts` (`fetchFeed()`, 474–595), `misp/extract.ts` (IOC/galaxy/TLP helpers, 596–842), `misp/index.ts` (class + re-exports) | Step 9 connector plugin interface |
| 2 | `apps/frontend/src/pages/AdminOpsPage.tsx` (806) | `admin-ops/ServiceCard.tsx`, `MaintenanceRow.tsx`, `TenantRow.tsx`, `QueueRow.tsx` + `DlqRow.tsx`, `format.ts` (`fmtDate`, `timeAgo`); page keeps tab switch (from line 408) | S161 honest UI |
| 3 | `apps/frontend/src/pages/BillingPage.tsx` (759) | `billing/PlanCard.tsx`, `UsageMeter.tsx`, `UpgradeModal.tsx` + `CancelModal.tsx`, `PaymentHistoryTable.tsx`, `billing/format.ts` (`fmtINR`, `usagePercent`, `usageColor` — **same helpers are duplicated in `BillingPlansTab.tsx` lines 38–61**; share them) | Phase 4 Razorpay |
| 4 | `apps/frontend/src/pages/CorrelationPage.tsx` (718) | `correlation/KillChainBar.tsx`, `DiamondModelCard.tsx`, `CampaignCard.tsx`, `CorrelationDetail.tsx` (lines 210–378, the biggest block) | S161 |
| 5 | `apps/frontend/src/components/command-center/AlertsReportsTab.tsx` (707) | one file per sub-tab panel: `AlertRulesPanel`, `AlertHistoryPanel`, `ReportTemplatesPanel`, `GenerateSchedulePanel` (205 lines alone); shared badges → `command-center/badges.tsx` | S154 alerting (UI follow-up) |
| 6 | `apps/normalization/src/service.ts` (698) | `severity.ts` (`classifySeverity`, `escalate*`, lines 73–212), `confidence.ts` (`clampConfidence`, `batchPenalty`, `calculateVelocity`, 214–308), `mappers.ts` (`mapIOCType/Severity/TLP`, `buildDedupeHash`, 12–71). **`normalizeBatch()` alone is ~314 lines (361–675)** → extract per-IOC steps into private helpers | **S150** (adds IOC_INDEX enqueue here) — split first, then add |
| 7 | `apps/frontend/src/pages/CustomizationPage.tsx` (682) | one file per tab: `ModulesTab`, `AIConfigTab` (227 lines), `ProviderApiKeysCard`, `RiskWeightsTab`, `DashboardConfigTab`, `NotificationsTab` | S163 (AI global config shape) |
| 8 | `apps/frontend/src/components/command-center/BillingPlansTab.tsx` (676) | one file per panel (Subscription, Invoices, PlansUpgrade, Limits, Offers, BillingInfo, Compare); helpers from #3 | Phase 4 Razorpay |
| 9 | `apps/frontend/src/pages/HuntingWorkbenchPage.tsx` (668) | `hunting/HuntScoreGauge.tsx`, `PivotChain.tsx`, `HuntSessionCard.tsx`, `HypothesisKanban.tsx`, `EvidenceTimeline.tsx`, `TemplateCard.tsx` | S159 hunting persistence (UI follow-up) or F2 |
| 10 | `apps/frontend/src/components/command-center/ComplianceReportsPanel.tsx` (584) | `compliance/ReportViews.tsx` (Soc2 / PrivilegedAccess / Dsar views), `GenerateReportModal.tsx`, `DsarPanel.tsx`; keep `ComplianceReportsList` | S162 user-management |

Also note: the four demo-data files (`phase6-demo-data.ts` 555, `demo-data.ts` 504, and demo parts of `use-phase4/5/6-data.ts`) may shrink or go away in **S161** (honest UI). Do not split them before S161.

Frontend is marked "✅ UI FROZEN" in PROJECT_STATE (line 52). Frontend splits need the owner's OK for that session.

## 5. Flow

```
S167 (chore)                        S168 (docs)                          Step 7
─────────────                       ───────────                          ──────
git rm 10 empty folders   ──▶  write DECISION-032 (proposed)   ──▶  owner: accept / reject / defer
fix scaffold/init scripts        + pilot plan + metrics                │
PROJECT_STATE: folder column                                           ├─ accept → S169 pilot
                                                                       └─ reject/defer → skip Step 7, go to Step 8
Oversized files: split only when a session touches the file (table §4)
```

## 6. Changes

### Backend
None (splits happen in their own module sessions).

### Infra / repo

| File | Change |
|---|---|
| `apps/{admin-ops,attack-surface-management,auth,billing,digital-risk-protection,enterprise-integration,reporting,threat-hunting,user-management,websocket}/**/.gitkeep` | `git rm -r` the 10 folders (28 `.gitkeep` files) |
| `scripts/scaffold.js` | Delete the 10 folder entries (lines 23–29, 74–118), **or** delete the whole script (it is bootstrap-only) — owner choice. Also remove `"scaffold"` from root `package.json` line 30 if deleted |
| `scripts/init-modules.js` | Delete the script (bootstrap-only; running it today would overwrite real `package.json` files for `api-gateway`, `ingestion`, `normalization`, etc.) — **recommended**. Or rewrite its list to the real 23 apps |
| `docs/PROJECT_STATE.md` | Module table: add a "Folder" column (`digital-risk-protection` → `apps/drp-service`, etc.). Remove W10 from open items |
| `docs/ROADMAP_S149_PLUS.md` | W10: "11" → "10"; W11: "39" → "38" (or note the counting rule) |
| `.claude/commands/session-start.md` | Skill table (step 6): add the folder path next to each module name |
| `docs/DECISIONS_LOG.md` | S168: add DECISION-032 with **Status: Proposed** and the gate questions in §9 |

### Frontend
None in S167/S168.

## 7. Data model

None.

## 8. Tests

| Test | Expected |
|---|---|
| `pnpm install --frozen-lockfile` | no lockfile change (folders were never workspace members) |
| `pnpm exec tsc -b --force tsconfig.build.json` | passes |
| `pnpm -r test` | same pass count as before |
| `make docker-test` | passes; `docker build` unaffected |
| For each split later: the module's existing tests pass **unchanged**; no new logic |

## 9. Acceptance checks

```bash
# 10 folders gone
for d in admin-ops attack-surface-management auth billing digital-risk-protection \
         enterprise-integration reporting threat-hunting user-management websocket; do
  test -e apps/$d && echo "STILL THERE: $d"; done            # → no output
ls apps | wc -l                                              # 24 (23 services + frontend)
grep -rn "apps/\(auth\|websocket\|billing\|reporting\)/" scripts/ package.json   # → no output
git diff --stat origin/master -- pnpm-lock.yaml             # → empty
pnpm exec tsc -b --force tsconfig.build.json && pnpm -r test
# oversized count (re-run after each split session; must only go down)
git ls-files 'apps/*' 'packages/*' | grep -E '\.(ts|tsx|js|mjs)$' \
  | grep -vE '(\.test\.|\.spec\.|/__tests__/|/tests?/|/e2e/|\.d\.ts$|/dist/)' \
  | xargs wc -l | grep -v ' total$' | awk '$1>400' | wc -l      # ≤ 38
grep -n "DECISION-032" docs/DECISIONS_LOG.md                # S168: one entry, Status Proposed/Accepted/Rejected
```

## 10. Rollback

- S167: `git revert <sha>` brings the `.gitkeep` folders back. Nothing depends on them.
- Tag first only if scripts are deleted too (3+ files): `git tag safe-point-2026-xx-xx-step6-cleanup`.
- Split sessions: each is a pure move; `git revert` of that session's commit.

## 11. Session breakdown

| Session | Module | Work | Size |
|---|---|---|---|
| S167 | chore (repo layout, `scripts/`) | Remove 10 folders, fix/delete `scaffold.js` + `init-modules.js`, PROJECT_STATE folder column, roadmap counts | S |
| S168 | docs | DECISION-032 write-up (Proposed) + pilot plan + metrics; owner answers §12 | S |
| as touched | the file's own module | Splits from §4, one module per session, inside the session that already changes the file | S each |

S167 is docs + deletions only. It can run any time after Step 1; it does not need to wait for Steps 2–5. (Deploy note: with Step 0's `paths-ignore`, the `.gitkeep` removal still triggers a deploy because it is outside `docs/`. That is fine, or merge it together with another change.)

## 12. Owner decisions needed

### A. Small

1. Delete `scripts/scaffold.js` and `scripts/init-modules.js`, or keep and fix them? Recommend delete.
2. OK to split frontend files (UI is "FROZEN") when S161/S163 touch them?

### B. DECISION-032 gate (the big one)

The proposal is in docs/ROADMAP_S149_PLUS.md §6: keep the code modular, but run ~7 processes instead of 23 (`gateway`, `intel-core`, `graph-hunt`, `platform`, `integrations`, `pipeline-workers`, `drp`).

The owner must answer:

| # | Question | Facts to decide with |
|---|---|---|
| 1 | **Accept, reject, or defer?** | 32 containers today (PROJECT_STATE). 23 backend services, each a separate Node process: 11 with a 512 MB limit and 12 with 256 MB = ~8.5 GB of limits on a 16 GB VPS (`docker-compose.etip.yml` `deploy.resources.limits`) |
| 2 | Is the grouping right? | Which modules share a DB/queue today. `ingestion` is both an API and BullMQ workers — does it go to `pipeline-workers` or split in two? |
| 3 | Pilot scope | Roadmap suggests analytics + caching + admin (3 × 256 MB, small, low risk). Alternative: start with the 5 "platform" ones |
| 4 | Success metrics for the pilot | Suggest: RAM of the combined process < sum of the 3 today; deploy time not worse; all 3 health endpoints still pass; no test changes; one week with no incident |
| 5 | Blast radius | One crash now takes down 3 features instead of 1. Acceptable? (BullMQ workers keep retries; APIs restart in seconds) |
| 6 | Pre-condition | Step 3 (no business data in memory) must be done first, because merging processes mixes their in-memory state and restarts. Confirm Step 7 waits for Step 3 |
| 7 | URLs and ports | Keep every nginx route and `/api/v1/...` path the same (nginx upstreams point to the new process). Confirm no public URL change |
| 8 | Stop rule | If the pilot fails a metric, stop and record "Rejected" — do not roll out |

Until the owner answers, DECISION-032 stays **Proposed** and Step 7 does not start.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Someone runs `init-modules.js` and overwrites real `package.json` files | Delete it in S167 |
| Folder names in docs still point to the old logical names | PROJECT_STATE "Folder" column; skill table update |
| Big-bang split of 38 files breaks the frozen UI | Only split when touched; pure moves; tests unchanged |
| DECISION-032 accepted without data | Pilot with fixed metrics and a stop rule (§12 B.4, B.8) |
