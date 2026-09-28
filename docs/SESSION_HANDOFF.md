# SESSION HANDOFF DOCUMENT

**Date:** 2026-09-28
**Session:** 172
**Session Summary:** Owner queue item #1 — "self-service sign-up never completes" — is now FIXED end to end and verified live by the owner. 6 PRs merged and deployed. **#55/#56/#57 close the sign-up gap (RCA #54):** admin-service now runs a BullMQ worker that sends the verification email via Resend, api-gateway's `/auth/register` enqueues that job and no longer leaks the plaintext verification token in its reply, new verify-email/resend-verification routes exist, and the frontend offers a resend on a conflicting sign-up. **The owner's live end-to-end test then surfaced three more bugs, all fixed the same session:** the dashboard header showed "Your organization" / "Free Plan" for every tenant because `login()` never returned the tenant (#58, RCA #56); a 0-IOC tenant was shown a fabricated "IOC Trend ↓14%" from production demo-data seeding in analytics-service (#59, RCA #55); and the dashboard's timeline, geo map, and ATT&CK widgets were all stub/hardcoded/heuristic generators rather than real data (#60, also RCA #55). DECISION-048 records the resulting principle: a real customer tenant never sees demo data, ever — only an honest empty state.

## ✅ Changes Made

| Commit(s) | Description |
|---|---|
| `f5f1392` → merge `622186f` | PR #55 (admin-service): BullMQ worker consumes `etip-email-send` (`QUEUES.EMAIL_SEND`), sends the verification email via Resend. |
| `335873d` → merge `a77ccc0` | PR #56 (api-gateway): `/auth/register` enqueues the job, replies with an allowlisted body; new `POST /auth/verify-email` + `POST /auth/resend-verification`. |
| `a4505d3` → merge `13048b8` | PR #57 (frontend): RegisterPage resend-on-conflict UX; ThreatBriefingWidget IOC-trend "—" pill on <2 points. |
| `1647c6b` → merge `eecc7d8` | PR #58 (user-service): `login()` + `completeLoginAfterMfa()` return the real tenant `{id,name,slug,plan}`. |
| `49706ec` → merge `0f874fc` | PR #59 (analytics-service): removed production demo trend seeding (`seedDemo()`, 11 call sites). |
| `7c1d55a` → merge `06215ab` | PR #60 (frontend): ThreatTimeline/GeoThreatWidget/AttackTechniqueWidget fabricated-data generators deleted. |

All 6 PRs merged to master and deployed; VPS HEAD `06215ab`, 32/32 `etip_` containers healthy after every deploy. Full detail: `docs/S172_SESSION_SUMMARY.md`.

## 📁 Files / Documents Affected

**New files (code):** `apps/admin-service/src/workers/email-send-worker.ts`, `apps/admin-service/src/services/email-sender.ts` (`sendVerificationEmail`), `apps/api-gateway/src/routes/email-queue.ts`, `apps/api-gateway/tests/email-queue.test.ts`, `apps/api-gateway/tests/auth-verification.test.ts`.

**New files (docs):** `docs/S172_SESSION_SUMMARY.md`, `docs/S172_SIGNUP_EMAIL_VERIFICATION.md` (from PR #55/#56 prep — status line added confirming deployed/verified), `docs/S172_FABRICATED_DATA_AUDIT.md` (pre-existing, not authored this pass — audit that scoped PRs #58–#60 and the honest-empty-states sweep still to come).

**Modified (code):** `apps/admin-service/src/index.ts` (starts the worker only when `TI_RESEND_API_KEY` set), `apps/admin-service/package.json` (bullmq dep); `apps/api-gateway/src/routes/auth.ts`, `apps/api-gateway/tests/auth.integration.test.ts`; `apps/frontend/src/pages/RegisterPage.tsx`, `apps/frontend/src/components/dashboard/ThreatBriefingWidget.tsx`, `apps/frontend/src/components/dashboard/ThreatTimeline*.tsx`, `apps/frontend/src/components/dashboard/GeoThreatWidget.tsx`, `apps/frontend/src/components/dashboard/AttackTechniqueWidget.tsx`; `apps/user-service/src/services/user-service.ts` (or equivalent — login/completeLoginAfterMfa), `apps/user-service/tests/service.test.ts`; `apps/analytics-service/src/*` (`seedDemo()` and its 11 call sites removed).

**Modified (docs, this pass):** `docs/PROJECT_STATE.md`, `docs/SESSION_HANDOFF.md` (this file), `docs/DECISIONS_LOG.md` (DECISION-048), `docs/DEPLOYMENT_RCA.md` (Issues #54–#56 + 6 deploy-summary rows), `docs/modules/admin-ops.md`, `README.md`, `docs/ETIP_Project_Stats.html`, `docs/S172_SIGNUP_EMAIL_VERIFICATION.md`.

## 🔧 Decisions & Rationale

- **DECISION-048:** Honest empty states for real tenants — a real customer tenant never sees demo/fabricated data; every page shows real data or an honest empty state with a next step; demo content only in an explicit demo tenant/mode. Triggered by the owner's live sign-up test surfacing fabricated dashboard data on their brand-new, 0-IOC tenant.

Note: the owner-ordered next-work queue below is the owner's explicit ordering — do not resequence without asking.

## 🧪 E2E / Deploy Verification Results

```
PR #55 → 622186f : admin logs "Resend email sender initialised" on boot when TI_RESEND_API_KEY set;
                    "email-send: job completed" per processed job; no worker-error lines after deploy.

PR #56 → a77ccc0 : POST /auth/verify-email with a malformed token → 400; with a random 64-hex token → 404
                    INVALID_TOKEN; POST /auth/resend-verification for an unknown email → 200 generic message
                    (no account enumeration). 324 api-gateway tests (was 298).

PR #57 → 13048b8 : owner-visible only after PR #56; verified as part of the live E2E test below.

PR #58 → eecc7d8 : owner confirmed dashboard header shows the tenant's real org name; paid tenants no
                    longer show "Free Plan". 186 user-service tests (was 184).

PR #59 → 0f874fc : GET /analytics/trends on a 0-IOC tenant returns no series (was a fabricated curve).
                    93 analytics-service tests (unchanged count, seeding removed from runtime not tests).

PR #60 → 06215ab : ThreatTimeline/GeoThreatWidget/AttackTechniqueWidget show "not available yet" on a
                    0-data tenant instead of fabricated content. Bundle rebuilt, 1,990 frontend tests + 2
                    skipped (net unchanged — generators replaced, not added).

Owner live E2E (the test that matters): sign up with a real mailbox → verification email arrives from
noreply@intelwatch.in → resend link works for a stuck older sign-up → verification link opens
/auth/verify-email?token=… → "Email Verified!" → log in → dashboard shows the real org name/plan and
no fabricated trend/timeline/geo/ATT&CK content on the fresh, empty tenant.

Adversarial review: codex:rescue unavailable (usage limit until 2026-09-29, confirmed via job log tail
before attempting) — Sonnet takeover per the fallback ladder, verdict ACCEPT. One medium-severity finding
(potential double-verification-row race) downgraded to a documented follow-up after code verification
showed register() already rejects duplicate emails across tenants, making the race benign today.

Real test total (Step 0, pnpm -r test): 9,174 passed + 2 skipped (9,176), was 9,145 + 2.
  admin-service 195→203, api-gateway 298→324, user-service 184→186, analytics-service 92→93 (already
  93 on disk pre-session — count unchanged this pass), frontend 1,990+2 skipped (net unchanged).
Sensitive-content grep before commit: clean (no secrets/PII/unfixed-vuln details/@-emails).
tsc / eslint: 0 errors (touched packages).
```

## ⚠️ Open Items / Next Steps

**Owner-ordered queue (one item per session):**
1. **Honest-empty-states sweep** — `withDemoFallback` (`apps/frontend/src/hooks/use-analytics-data.ts:22`) still swaps in demo data whenever a real call returns empty rather than distinguishing empty (200 + `[]`) from error; route it through `QueryStateView` instead. Full scope + PR order in `docs/S172_FABRICATED_DATA_AUDIT.md` (5 PRs, `withDemoFallback` first since it touches the most hooks).
2. Graph visual redesign (ui-design-workflow skill) — Threat Graph shows real data (12,171 nodes, 26,804 relationships).
3. AI enrichment per DECISION-045 — host-side runner, `AiProcessingCost` ledger wiring, super-admin usage view, golden-set evaluation gate.
4. Owner-scheduled security fix (details in the owner's private notes) — must land before plan-tier gating.
5. Vulnerability scanner import + tiers + channels per DECISION-046; Step 15 Phase 2 MVP per DECISION-047 (architecture now settled).
6. Real tenant Clients list — replace admin-service's in-memory TenantStore (DECISION-013).
7. Step 3 — persistence (`docs/roadmap/STEP_03_PERSISTENCE.md`, ~12 sessions) — owner decisions D1–D7 needed first.
8. Step 4 — least-privilege DB + real RLS (`STEP_04_DB_ROLE_RLS.md`, after Step 3) — owner decisions E1–E7, touches shared-auth.
9. Step 6 remainder — DECISION-032 proposal/gate + as-touched >400-line file splits (38 files over limit).

**Carried forward (still open, unchanged since the prior handoff):**
- Two backend data-scope follow-ups — details in the owner's private notes (unfixed, keep out of public docs).
- `findUnverifiedByEmail` uses `findFirst` on a non-unique email — safe today (only `register()` creates unverified users and rejects a duplicate email across tenants) but two concurrent same-email sign-ups could still create two rows.
- Resend cooldown derived from `emailVerifyExpires − 24h`, not an explicit sent-at timestamp — store one if the expiry window ever changes.
- `sendInviteEmail` (separate code path from the new verification email) still ignores a Resend `{error}` response.
- Stale "(demo data)" comments remain in the analytics aggregator; `use-analytics-dashboard.ts` still has `?? 72`/`?? 84` numeric fallbacks — candidates for the honest-empty-states sweep.
- `TI_AI_ENABLED` is `true` in prod `.env` with an empty Anthropic key — DECISION-045 gives the path forward (host-side runner first).
- Real user & tenant provisioning: team invite is in-memory, SCIM routes unreachable via nginx, SSO JIT callback unwired, no Prisma-backed role-change route, Command Center "Add Client" invite in-memory.
- RCA #49 error-handler sweep — only integration-service has been checked for the 4xx→500 masking bug class; other services not yet swept.
- Route-permission coverage test (RCA Issue 48 prevention item) — not yet built.
- Correlation "Create ticket" (`use-phase4-data.ts` `useCreateTicket`) sends no `integrationId`, which `POST /integrations/tickets` requires — needs a ticketing-integration picker in the UI.
- S161b PR 2–4 (alerting/reporting, phase4, remaining phase5/6 hooks) — still pending.
- S163 backend gaps (billing/admin path+shape mismatches, DECISION-036) still open.
- `useNodeNeighbors` still maps any error (not just 404) to "no neighbours" (pre-existing, minor; `apps/frontend/src/hooks/use-phase4-data.ts`).

**Deferred with reason (not forgotten, just not now):**
- 7 older unverified sign-ups (from before this fix) can self-recover via login → Resend — no backfill needed.
- Ops hardening beyond what's already shipped (backups, DR, monitoring polish) — no paying customers yet, functional work takes priority.
- Local branches `s172/*` are merged and can be deleted.

## 🔁 How to Resume

```
/session-start → Session 173. One folder (E:\code\IntelWatch), branch per task, one PR merged + deployed at a time (DECISION-034).
Use Sonnet/Haiku as much as possible (Opus for plan/review/security judgment only).

FIRST — owner-ordered queue item 1: honest-empty-states sweep, PR 1 of 5 (see docs/S172_FABRICATED_DATA_AUDIT.md
for the full scope and PR order). Start with `withDemoFallback` (apps/frontend/src/hooks/use-analytics-data.ts:22)
— it swaps in demo data whenever a real API call returns an empty result instead of distinguishing "empty"
(200 + []) from "error"; this affects the most hooks of any single fix in the sweep. Wire it through
QueryStateView per the pattern already used for billing/admin/users (S161a/S161b). Per DECISION-048: a real
tenant must never see demo data, only an honest empty state.

Queue after that (owner-ordered, one per session): (2) graph visual redesign (load the ui-design-workflow skill
first — real data now exists, 12,171 nodes / 26,804 relationships in prod); (3) AI enrichment per DECISION-045
(host-side Claude Code runner, AiProcessingCost ledger wiring, super-admin usage view, golden-set gate);
(4) owner-scheduled security fix — details in the owner's private notes, must land before plan-tier gating;
(5) vulnerability scanner import per DECISION-046 + Step 15 Phase 2 MVP per DECISION-047; (6) real tenant
Clients list, replacing admin-service's in-memory TenantStore (DECISION-013); (7) Step 3 persistence
(~12 sessions, needs owner decisions D1-D7 first); (8) Step 4 least-privilege DB + real RLS (~13 sessions,
needs owner decisions E1-E7, touches shared-auth, security review before push); (9) Step 6 remainder —
DECISION-032 gate + >400-line file splits (38 files over limit).

Frozen / do-not-touch without explicit instruction: shared-* packages (Tier 1, api-gateway included) — additive
only, list every consumer before any change; intelwatch.in and ti-platform-* containers — never touch; frontend
is UI-FROZEN (design system locked, data-wiring changes only, no visual redesign without the ui-design-workflow
skill — this is why queue item 2 above explicitly calls it out).

Module → skill map: any new/modified ETIP microservice under /apps/ → etip-service-pattern skill; any test file →
etip-testing skill; before any push → pre-push skill (mandatory, runs make pre-push equivalent checks); before
proposing an architectural alternative → check docs/DECISIONS_LOG.md first (lazy-load, don't read by default);
current-step roadmap spec → read the specific STEP_NN_*.md file for whichever queue item is active, not the whole
roadmap folder.

Owner does a browser check after each deploy — CI/unit tests with correct shapes still aren't a substitute for a
live click-through (this is exactly how RCA #49, #50, #53, and this session's #54-#56 were all caught).

Ops note: GitHub occasionally drops the push event on a merge — check `gh run list --workflow deploy.yml --limit 1`
after merging; if nothing appears, `gh workflow run deploy.yml --ref master`.

Note: codex:rescue was unavailable this session (usage limit until 2026-09-29) — check `or usage`-equivalent
quota state for codex before relying on it; Sonnet takeover is the documented fallback per the project's hard
rules and worked fine here.
```
