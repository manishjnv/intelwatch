# Free Trial — Review and Plan

**Date:** 2026-09-23 (S147) · **Type:** review + proposal.

> **Superseded the same day by DECISION-031: no trials at all.** The owner chose "Free + sales-led paid" over the reverse trial proposed below. What shipped: signup always creates Free; paid plans go to Contact sales everywhere; Extend Trial and the dead `trialDays` field are removed; super admins set plans with `POST /api/v1/billing/upgrade` (docs/runbooks/SET_TENANT_PLAN.md). Phase 5 was a no-op: a read-only VPS check found zero trialing tenants. The findings in §3 remain accurate as a record of the pre-S147 state.
**Scope:** user-service (signup), billing-service, api-gateway billing routes, admin-service, frontend billing UI.
**Related:** DECISION-030 (pricing), docs/S147_P2B_PRICING_PAGE.md. Security items **S-1…S-3** came out of this review and are tracked privately with the owner until fixed; the repo is public, so details stay out of it.

## 1. Summary
1. **Trials never end.** A paid signup gets `status: 'trialing'` and a `trialEndsAt` 7 days out, but no code ever reads `trialEndsAt`. Enforcement keys off `Tenant.plan`, which is set to the paid plan at signup, so **every trial is permanent free access to a paid plan**.
2. **A trial user can't pay even if they want to.** The in-app Upgrade button calls an endpoint that doesn't exist (404), and no UI opens a Razorpay checkout. There is no self-serve conversion path.
3. **There are two trial records that don't sync.** The real one is in Postgres (`TenantSubscription`). A second one lives in admin-service memory, and that's the one Command Center's **Extend Trial** button changes. So extending a trial has no real effect, and the change is lost on restart.
4. **Trial length is defined in three places** (7 days hardcoded twice; `trialDays` 14/14/30 in billing, never read).
5. **No trial UX:** no days-left banner, no reminder emails, nothing at expiry.

Recommendation: fix the private security items first. Then do a **no-card "reverse trial"**: full paid features for N days, then an automatic downgrade to Free with data kept. It rolls out behind a dry-run flag, only after a working payment path exists.

## 2. How it works today
```
Register (plan=starter|pro)  ──►  Tenant.plan = starter|pro          ◄── quotas + FeatureGate read this
                                   TenantSubscription.status = 'trialing'
                                   TenantSubscription.trialEndsAt = now + 7d   ◄── read by nothing
        │
        └── day 8, 30, 300 … nothing happens. Paid features forever. No payment is ever requested.

Register (plan=free) ──► Tenant.plan = free, status 'active'
In-app "Upgrade" ──► POST /api/v1/billing/subscriptions/upgrade ──► 404 (route does not exist)
Command Center "Extend Trial" ──► admin-service in-memory TenantRecord only (not Postgres)
```

## 3. Findings
| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | **Critical (revenue)** | Trial expiry isn't implemented. Nothing compares `trialEndsAt` to the current time, and `trialing` is never read back or changed | The only writers are `apps/user-service/src/service.ts:83-90` and `apps/admin-service/src/services/tenant-store.ts:93`. A repo-wide grep found no readers in any cron, worker, middleware or route. Quotas: `apps/api-gateway/src/quota/plan-cache.ts:112-141` reads only `Tenant.plan`. FeatureGate: `apps/frontend/src/components/FeatureGate.tsx:60-68` is plan-based |
| F2 | **Critical (revenue)** | No working payment path | The frontend `useUpgradePlan` → `POST /billing/subscriptions/upgrade` (`apps/frontend/src/hooks/use-phase6-data.ts:177`) has no route in billing-service, which registers `/upgrade`, `/downgrade`, `/checkout`, `/subscriptions`, `/subscriptions/cancel`. `/checkout` creates a Razorpay order but no frontend code calls it or loads Razorpay Checkout |
| F3 | High | Two unsynced trial records. Command Center's "Extend Trial" edits the in-memory copy | `apps/admin-service/src/services/tenant-store.ts:7-21,188-195` (in-memory, DECISION-013) vs the Prisma `TenantSubscription` (`prisma/schema.prisma:610-627`) |
| F4 | Medium | Trial length defined in 3 places | 7 days hardcoded in `user-service/src/service.ts:84` and `admin-service/.../tenant-store.ts:93`. `billing-service/src/services/plan-store.ts` `trialDays` 0/14/14/30 is never read |
| F5 | Medium | No trial UX or notifications | BillingPage only colours a `trialing` status (`BillingPage.tsx:554`). No banner, countdown or email |
| F6 | Medium | Status literal mismatch | AdminOpsPage counts `'trial'` (`AdminOpsPage.tsx:715-716`), but the data uses `'trialing'` |
| F7 | Low | api-gateway `POST /api/v1/billing/upgrade` is unreachable dead code | nginx sends all of `/api/v1/billing` to billing-service. It's also gated by `org:read`, which only `super_admin` holds (`packages/shared-auth/src/permissions.ts:32-44`) |
| F8 | Low | No tests for the trial lifecycle | Only persistence round-trips exist (`billing-service/tests/repository.test.ts`) |
| — | Security | S-1, S-2, S-3 | Tracked privately. **They must be fixed before any phase below** |

**Data risk for any expiry rollout:** the Free plan keeps **30 days** of data (`user-management-service/src/services/retention-service.ts:18`), and the retention job archives older records. With a 14-day trial nothing is lost at expiry. But **tenants that have been "trialing" for months would lose everything older than 30 days on downgrade.** Phase 5 exists for them.

## 4. Trial model options
| Option | How it works | Fit for IntelWatch |
|---|---|---|
| **A. Reverse trial (recommended)** | Signup on a paid plan with no card. At trial end, auto-downgrade to **Free**. Data is kept (Free limits apply from then on), and upgrading any time restores the paid plan | Uses the Free plan that already exists. No payment-mandate work needed before launch. Lowest signup friction for Indian SOC teams, which often need purchase approval before entering a card |
| B. Card upfront, auto-convert | A Razorpay subscription with a trial period charges automatically at the end | Higher-intent signups, but more friction. Recurring card/UPI charges in India go through RBI e-mandate flows, which adds real integration and support work. Consider it later for self-serve Starter |
| C. No trial; Free plan + sales demos | Paid plans only through checkout or sales | Simplest, but loses self-serve evaluation of paid features (AI enrichment, SIEM, Threat Graph) |

**Trial length:** my suggestion is **14 days**. A threat-intel platform shows its value once feeds have accumulated and enrichment and correlation have produced findings, and evaluations usually involve more than one person. The unused billing `trialDays: 14` also suggests that was the original intent. 7 days is the live marketing claim today (pricing page, signup cards), so any change needs a copy update in the same release. **Owner decision.**

## 5. Target lifecycle (option A)
```
free ──(register paid / start trial)──► trialing(plan P, ends T)
trialing ──(payment captured, webhook verified)──► active(plan P)
trialing ──(T passed, no payment)──► expired ──► Tenant.plan = free, previousPlan = P   (data kept)
expired / free ──(payment captured)──► active(plan P)
active ──(renewal fails)──► past_due ──(grace G days)──► free        [later phase]
active ──(cancel)──► cancelled at period end ──► free
```
Rules:
- **One owner** of subscription state changes: billing-service. There is **one function** that changes the plan, and it updates `TenantSubscription` and `Tenant.plan` together, emits an event, and invalidates the api-gateway plan cache and the frontend `/billing/limits` cache.
- One trial per organisation: record `trialUsedAt` per tenant or per verified email.
- Enterprise stays sales-led, as the UI already does.

## 6. Implementation plan
Each phase is one session and one module, following the CLAUDE.md scope rules. The order matters.

| Phase | Module | Work | Gate |
|---|---|---|---|
| **0** | (private) | Fix S-1, S-2 and S-3 | Adversarial review before push; live curl grid |
| **1** | billing-service (+ prisma) | Single source of truth: a `trialDays` column on `SubscriptionPlanDefinition` (seeded; replaces the dead `plan-store` field). user-service reads it at signup. admin-service "Extend Trial" calls a billing endpoint that updates `TenantSubscription.trialEndsAt`; the in-memory trial fields are removed. `'trial'` → `'trialing'` in AdminOps | Unit tests; Extend Trial persists across restart |
| **2** | billing-service + frontend | **Payment path.** Point the frontend upgrade at the real flow: `/checkout` (Razorpay order), then Razorpay Checkout, then a **signature-verified** webhook (`/webhooks/razorpay`), then the single plan-change function sets `active` and the period dates. Remove the dead `/subscriptions/upgrade` call and the dead api-gateway `/billing/upgrade` | Razorpay test mode end to end; webhook signature tests; adversarial review (payments) |
| **3** | billing-service | **Expiry job.** A daily job (existing node-cron pattern) takes `status='trialing' AND trialEndsAt < now` with no captured payment and moves it to `expired`, downgrading to free through the single function. Idempotent. Behind `TI_TRIAL_EXPIRY_ENABLED` with `report-only` mode first, which logs the would-expire list | Report-only run on the VPS reviewed by the owner before enabling |
| **4** | frontend (+ existing mailer) | **UX.** Days-left banner in the dashboard layout (from `trialEndsAt`), a BillingPage countdown, an expired-state notice with an Upgrade CTA. Emails at T-3, T-1 and at expiry, reusing the verification-email mailer | 375 px check; copy review |
| **5** | billing-service (ops) | **Existing tenants.** Run a read-only count of tenants by `status`, `plan` and `trialEndsAt` on the VPS. Then choose: give every current `trialing` tenant a fresh trial ending at launch + N days with notice, or convert known design partners to a sales-managed plan. **Never downgrade a long-standing tenant without notice** (30-day Free retention, §3) | Owner sign-off on the list |

Phases 1 and 3 can't ship before Phase 2. Expiring trials while nobody can pay would only push users to Free.

## 7. Decisions needed from the owner
1. Trial model: A (reverse trial), B, or C?
2. Trial length: 14 days (recommended) or keep 7? Should it be the same for Starter and Teams?
3. At expiry: downgrade to Free with data kept (recommended), or read-only lock?
4. Existing trialing tenants (Phase 5): fresh trial with notice, or case by case?
5. Approve Phase 0 (security) as the next session, ahead of the remaining SEO work.

## 8. Changes made in this session because of this review
- `/pricing` (not yet deployed): the FAQ "Upgrade any time from Billing & Plans" was **untrue** (F2). It now reads "Email sales@intelwatch.in and we will move your workspace to the new plan."
- No other live requests were made. Findings come from reading the code.
