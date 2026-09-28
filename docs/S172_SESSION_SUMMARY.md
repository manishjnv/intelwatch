# Session 172 — Summary (2026-09-28)

**Owner queue item #1:** "self-service sign-up never completes" — FIXED end to end and verified live by the owner, plus three follow-up fixes the owner's live test surfaced.

Master `06215ab` = origin/master. VPS HEAD `06215ab`, 32/32 `etip_` containers healthy. Real test total (Step 0, `pnpm -r test`): **9,174 passed + 2 skipped (9,176)**, was 9,145 + 2.

## Goals

1. Fix self-service sign-up so it completes end to end (verification email delivered, verify/resend endpoints wired).
2. Do a live owner sign-up test and fix whatever it surfaces.

## PRs

### #55 — admin-service: email-send worker
Commit `f5f1392` → merge `622186f`. BullMQ worker (`src/workers/email-send-worker.ts`) consumes `etip-email-send` (`QUEUES.EMAIL_SEND`) and sends the verification email via Resend (`sendVerificationEmail` in `src/services/email-sender.ts`). Started in `index.ts` only when `TI_RESEND_API_KEY` is set. Zod-validated job payload, `UnrecoverableError` on bad data (no pointless retries), concurrency 5, limiter 2 jobs/s, throws on a Resend `{error}` response so BullMQ retries it. The email template renders no sign-up-supplied input (org name / display name are typed by whoever signs up — echoing them would let anyone send arbitrary text from the verified `intelwatch.in` domain, a phishing-relay risk); it says "Welcome to IntelWatch ETIP" only. `bullmq ^5.12.0` added as a dependency.

**Tests:** admin-service 203 (was 195).

Deploying this PR alone is a no-op — the queue stays empty until PR #56 starts producing jobs.

### #56 — api-gateway: verify/resend routes + safe register reply (RCA #54)
Commit `335873d` → merge `a77ccc0`. This is the actual root-cause fix.

**Root cause:** user-service's `register()` already built an `etip-email-send` job payload and returned it "for the caller to queue" — but no caller ever queued it, and nothing consumed the queue even if it had been. api-gateway had no verify-email or resend-verification routes, even though the frontend's `VerifyEmailPage` and the token logic in user-service both already existed expecting them. On top of that, `/auth/register`'s reply spread the internal result object back to the caller, which included the plaintext email-verification token in the HTTP response — every sign-up leaked its own verification token to the browser network tab.

**Fix:**
- `src/routes/email-queue.ts` (new) — `enqueueEmailJob()`: a lazy BullMQ `Queue(QUEUES.EMAIL_SEND)` (same `TI_REDIS_URL` pattern as the existing `search-backfill.ts` producer), rejects any queue name other than `EMAIL_SEND` (`INVALID_EMAIL_QUEUE`), job options `attempts: 5` with exponential backoff (30s base), `removeOnComplete: true`, `removeOnFail: { age: 86400 }` (24h) so stale job data doesn't linger in Redis, and a 5s cap (`EMAIL_QUEUE_TIMEOUT`) because `maxRetriesPerRequest: null` would otherwise make `.add()` hang forever if Redis is down.
- `src/routes/auth.ts` — `POST /register` now enqueues the verification job and replies with an explicit allowlist `{ user, tenant, message }` (the internal queue payload, including the token, is never returned). If enqueue fails, it's logged and the request still returns 201 — the user can resend later rather than sign-up itself failing on a transient queue issue. New `POST /verify-email` (`token`, must be 64 lowercase hex → 200 success / 404 `INVALID_TOKEN` / 410 `TOKEN_EXPIRED`) and `POST /resend-verification` (`email` → always the same generic message regardless of whether the account exists, to avoid account enumeration; 429 `RATE_LIMITED` inside a 5-minute cooldown).
- Tests: 26 new (`tests/email-queue.test.ts`, `tests/auth-verification.test.ts`, updates to `tests/auth.integration.test.ts`) covering: register reply never carries the queue payload or token, 201 even when enqueue fails, verify/resend status codes and body shapes, enqueue fires only when user-service actually produced a payload, the queue-name guard, `CONFIG_ERROR`, and the enqueue timeout. The register mock was corrected to match the real `RegisterResult` shape (register never returned tokens — a pre-existing test-mock drift, not a new bug).

**Tests:** api-gateway 324 (was 298).

No user-service or frontend code change needed for the core flow — the frontend already called these routes and already showed a "check your email" state; `VerifyEmailPage` already mapped 410 → expired and anything else → invalid.

### #57 — frontend: resend-on-conflict UX + trend-pill honesty fix
Commit `a4505d3` → merge `13048b8`. Two small, unrelated frontend fixes bundled together for deploy efficiency:
- `RegisterPage`: on a 409 `EMAIL_ALREADY_REGISTERED`/`CONFLICT` response, shows a "Resend verification email" action instead of a dead-end error — closes the loop for anyone who signed up before PR #56 landed and is stuck unverified with no path forward. Conflict copy also reworded to "An organization with this name already exists."
- `ThreatBriefingWidget`: the IOC-trend pill now shows "—" instead of a misleading percentage when there are fewer than 2 data points (a 1-point series has no meaningful trend direction).

**Tests:** frontend 1,990 + 2 skipped (net unchanged — no new test files, existing coverage extended).

### Owner live end-to-end test (after #55/#56/#57 deployed)

The owner ran the actual sign-up flow as a new user would: sign up with a real mailbox → verification email arrived from `noreply@intelwatch.in` → link opened `/auth/verify-email?token=…` → "Email Verified!" → logged in → landed on the dashboard. **The core fix worked.** But the fresh, 0-IOC tenant's dashboard immediately showed three things that were obviously wrong for a brand-new account, which became PRs #58–#60.

### #58 — user-service: login returns the real tenant (RCA #56)
Commit `1647c6b` → merge `eecc7d8`. **Symptom:** every tenant's dashboard header showed the generic placeholder "Your organization" instead of the real org name, and a paying tenant's plan badge showed "Free Plan". **Root cause:** `login()` and `completeLoginAfterMfa()` both queried the tenant row but never included it in what they returned to the caller — the frontend had no tenant data to render, so it fell back to its placeholder. **Fix:** both functions now return `tenant: {id, name, slug, plan}` as an explicit allowlist (no extra Prisma columns such as `settings` leaked).

**Tests:** user-service 186 (was 184) — includes a new test asserting the login response's tenant object is exactly `{id, name, slug, plan}`, no more.

### #59 — analytics-service: remove production demo trend seeding (RCA #55)
Commit `49706ec` → merge `0f874fc`. **Symptom:** the owner's brand-new, 0-IOC tenant showed a fabricated "IOC Trend ↓14%" stat on the dashboard. **Root cause:** analytics-service ran `seedDemo()` at startup in production — 11 call sites seeding random-but-plausible trend curves into the same data path real tenants read from, with no gate distinguishing a demo tenant from a real one. **Fix:** `seedDemo()` and all 11 call sites deleted. `GET /analytics/trends` now correctly returns no series for a tenant with no real data, instead of a synthetic curve.

**Tests:** analytics-service 93 (test count unchanged — the removed code was runtime seeding, not something the existing test suite exercised directly).

### #60 — frontend: remove fabricated timeline/geo/ATT&CK widgets (RCA #55)
Commit `7c1d55a` → merge `06215ab`. **Symptom:** the same dashboard showed a moving "recent activity" timeline, a geographic attribution map with pins, and ATT&CK technique badges — all with no real data behind any of them. **Root cause:** three separate widgets each had their own fabrication path: `ThreatTimeline` used a stub event generator, `GeoThreatWidget` rendered a hardcoded `DEMO_GEO_DATA` constant regardless of tenant, and `AttackTechniqueWidget` derived "top techniques" from a client-side heuristic instead of real IOC/enrichment data. **Fix:** all three generators deleted. `ThreatTimeline` now renders from real IOCs (`useIOCs`). `GeoThreatWidget` shows "Geographic attribution not available yet" when there's no real geo data. `AttackTechniqueWidget` shows "ATT&CK mapping not available yet" when there's nothing real to map.

**Tests:** frontend 1,990 + 2 skipped (net unchanged — generators replaced, not added; existing widget tests updated to assert the empty state instead of demo content).

## Decisions (DECISIONS_LOG.md)

- **DECISION-048** — Honest empty states for real tenants. A real customer tenant never sees demo/fabricated data — every page shows real data or an honest empty state with a next step; demo content only in an explicit demo tenant or demo mode. Triggered directly by the owner's live sign-up test. Rejected alternatives: labelling demo content "Demo data" until real data arrives (still shows fabricated numbers as representative); a per-tenant sample-data toggle (adds a permanent config surface for a temporary onboarding gap). Related to DECISION-035/036 — extends the same "no fake data in front of a real tenant" principle from error states to empty states and from frontend to backend seeding.

## RCA (DEPLOYMENT_RCA.md)

- **Issue 54** — Self-service sign-up never completed. Symptom: no verification email, every sign-up stuck unverified. Root cause: a producer/consumer contract that existed on both ends (user-service built the job, the frontend/token logic expected verify/resend routes) but was never actually wired together — nothing queued the job, nothing consumed it, no routes existed; register's reply also leaked the plaintext token. Fix: PR #55 + #56. Prevention: a producer/consumer contract needs an end-to-end test or a queue-depth check, not just matching shapes on both ends; reply bodies use explicit allowlists, never spread results, especially on auth routes.
- **Issue 55** — Fabricated data shown as real on a new tenant's dashboard. Symptom: fake IOC trend, stub timeline, hardcoded geo map, heuristic ATT&CK badges on a 0-data tenant. Root cause: analytics-service seeded demo trends in production; three frontend widgets used stub/hardcoded/heuristic generators instead of real data. Fix: PR #57 (trend pill honesty), #59, #60. Prevention: DECISION-048; grep for `seedDemo|generate.*Stub|DEMO_` on customer-facing paths before release; test the new-tenant view specifically, not just an established-tenant fixture.
- **Issue 56** — Dashboard header showed the wrong org name and plan. Root cause: login response omitted the tenant even though the query already loaded it. Fix: PR #58. Prevention: same lesson as RCA #45 — frontend types must match the real backend response; missing fields get added via an explicit allowlist, not guessed at on the frontend.
- Resolution-summary row for Session 172 (6 deploys, 32/32 healthy, RCA #54–#56) appended to `DEPLOYMENT_RCA.md`'s deploy-history table.

## Adversarial review

`codex:rescue` was unavailable this session — its most recent job log ended with a usage-limit message dated 2026-09-29 (future date, confirmed before attempting), so per the project's fallback ladder the Sonnet-takeover path was used instead: a self-contained adversarial prompt covering the auth/email path (register reply shape, token handling, rate limiting, queue-name validation) was run against a Sonnet subagent with no conversation history. **Verdict: ACCEPT.** One medium-severity finding — a possible race between two concurrent same-email sign-ups both hitting `findUnverifiedByEmail`'s non-unique `findFirst` — was downgraded to a documented follow-up after code verification showed `register()` already rejects any email that exists in any tenant, active or not, making the race benign under the current logic (it could only matter if that check is ever relaxed).

## Known issues / next session queue

1. **Next session task #1 — honest-empty-states sweep, PR 1 of 5:** `withDemoFallback` (`apps/frontend/src/hooks/use-analytics-data.ts:22`) still doesn't distinguish a real empty result (200 + `[]`) from an error — it swaps in demo data either way. Full scope and PR order: `docs/S172_FABRICATED_DATA_AUDIT.md`.
2. Graph visual redesign (ui-design-workflow skill) — real data exists (12,171 nodes, 26,804 relationships).
3. AI enrichment per DECISION-045 (host-side runner, ledger, super-admin usage view, golden-set gate).
4. Owner-scheduled security fix (owner's private notes) — before plan-tier gating.
5. Vulnerability scanner import (DECISION-046) + Step 15 Phase 2 MVP (DECISION-047).
6. Real tenant Clients list; Step 3 persistence (D1–D7); Step 4 DB roles + RLS (E1–E7); Step 6 remainder.
7. Follow-ups from this session: `findUnverifiedByEmail` non-unique-email race (documented, not fixed — benign today); resend cooldown derived from token expiry rather than an explicit sent-at; `sendInviteEmail` (separate path) still ignores a Resend `{error}` response; stale "(demo data)" comments in the analytics aggregator; `use-analytics-dashboard.ts` `?? 72`/`?? 84` numeric fallbacks (sweep candidate); 7 older unverified sign-ups from before this fix can self-recover via login → Resend, no backfill needed.
8. Carried forward, unchanged: route-permission coverage test, Correlation "Create ticket" integration picker, RCA #49 error-handler sweep on other services, S161b PR 2–4, S163 billing/admin path+shape mismatches, real user/tenant provisioning (team invite/SCIM/SSO JIT/Add-Client all in-memory or unreachable today), two backend data-scope follow-ups (owner's private notes).

## Rollback (per PR)

- **#55:** `git revert` — worker stops running; queue backs up harmlessly until reverted forward again.
- **#56:** `git revert` the PR; do this first if reverting the flow, since PR #55 alone is a no-op without it.
- **#57:** `git revert` — frontend only, no backend dependency.
- **#58:** `git revert` — login stops returning the tenant object; frontend falls back to its placeholder again, no data loss.
- **#59:** `git revert` restores `seedDemo()` — would reintroduce fabricated trend data, only do this if analytics-service breaks in an unrelated way.
- **#60:** `git revert` restores the three fabricated-data widgets — same caveat as #59.

## Detail docs

`docs/S172_SIGNUP_EMAIL_VERIFICATION.md` · `docs/S172_FABRICATED_DATA_AUDIT.md`
