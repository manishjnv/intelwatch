# Parallel track — Revenue and growth (Razorpay checkout, SEO phases 2.2–4, weekly threat brief)

**Written:** 2026-09-25 · **Status:** spec, not started · **Roadmap:** docs/ROADMAP_S149_PLUS.md §3 row "∥", §4 Phase 4 (W12)
**Related:** DECISION-024, 030, 031 · docs/FREE_TRIAL_REVIEW_AND_PLAN.md · docs/SEO_PLAN.md · docs/runbooks/SET_TENANT_PLAN.md
**Order:** SEO and the weekly brief can run any time after step 1. **Razorpay checkout waits for step 5 (honest UI) and a new DECISION.** Every claim below was checked against the code on 2026-09-25.

---

# Part A — Razorpay self-serve checkout 🔒

## A1. Goal
A tenant admin picks Starter or Teams (monthly or annual), pays in Razorpay Checkout, and the plan is applied **only after a signature-verified payment**. Enterprise stays sales-led.

## A2. Why now (and why not before step 5)
There is no paying path today (W12). Every paid plan needs a super admin and a curl command. But charging people while pages can still show demo data (W6) would hurt trust, so this starts after step 5.

## A3. Current state (verified)
**What exists in billing-service (`apps/billing-service/src/`)**
- `services/razorpay-client.ts`: SDK wrapper (`razorpay` ^2.9.5). `createOrder` (:123), `createCustomer`, `createSubscription`, `cancelSubscription`. `verifyWebhookSignature` (:148) uses HMAC-SHA256 + `timingSafeEqual`. `parseWebhookEvent` (:162).
- `routes/subscriptions.ts:101` `POST /api/v1/billing/checkout`: takes `{planId, couponCode?}` (`schemas/billing.ts:36`), creates a Razorpay order for `PLAN_DEFINITIONS[planId].priceInr` (monthly only), returns `{orderId, amount, currency, planId, keyId}`.
- `routes/webhooks.ts:28` `POST /api/v1/billing/webhooks/razorpay`: handles `subscription.charged`, `subscription.cancelled`, `payment.captured`, `payment.failed`.
- nginx: `/api/v1/billing/webhooks/` is public (`docker/nginx/conf.d/default.conf:421`); the rest of `/api/v1/billing` goes through `auth_request` (:498). `POST /api/v1/billing/upgrade` goes to api-gateway (:469).
- Tests exist: `tests/razorpay-client.test.ts`, `tests/webhook-routes.test.ts`, `tests/subscription-routes.test.ts`.

**Gaps that block a real checkout**
| # | Gap | Evidence |
|---|---|---|
| G1 | Signature is checked on **re-serialised** JSON, not the raw bytes Razorpay signed. Real webhooks can fail verification if formatting differs | `routes/webhooks.ts:34` `JSON.stringify(req.body)`; no raw-body parser anywhere in billing-service |
| G2 | `payment.captured` only marks an invoice paid if one exists with that `orderId`, but `/checkout` never creates one. **No path applies the plan** | `routes/webhooks.ts:73–84`, `routes/subscriptions.ts:101–121`, `services/invoice-store.ts:205` |
| G3 | Billing's plan write touches only `tenant_subscriptions`, never `tenants.plan` (which quotas and FeatureGate read), and doesn't clear the gateway plan cache | `services/plan-store.ts:239–254`, `repository.ts:26–56`; real function is gateway `routes/billing-upgrade.ts` (Tenant + subscription in one transaction, then `invalidatePlanCache`, `quota/plan-cache.ts:78`, Redis key `plan_cache:<tenantId>`) |
| G4 | Plan id mismatch: billing-service uses `teams`; Prisma `Plan` enum and seeds use `pro`. A `teams` write fails and the store **silently falls back to memory** | `schemas/billing.ts:4`, `prisma/schema.prisma` enum `Plan`, `prisma/seeds/plan-definitions.ts:108`, `plan-store.ts:250` `catch { /* fall through */ }` |
| G5 | Prices come from in-code `PLAN_DEFINITIONS` (monthly only), not the seeded `subscription_plan_definitions` (`priceMonthlyInr`, `priceAnnualInr`). No annual checkout | `plan-store.ts:68–160`, `schema.prisma:927` |
| G6 | No idempotency: the same event delivered twice is processed twice. No event log | `routes/webhooks.ts` |
| G7 | The Razorpay secrets have placeholder **defaults** in config and compose. Production must refuse to start without real values | `config.ts:16–18`, `docker-compose.etip.yml:998–1000` |
| G8 | `/checkout` takes the tenant from the header with a `'default'` fallback and has no role check (any analyst can start a purchase) | `routes/subscriptions.ts:102` |
| G9 | No frontend code loads Razorpay Checkout. `useUpgradePlan` still calls a dead path | `grep checkout.razorpay apps/frontend` → none; `apps/frontend/src/hooks/use-phase6-data.ts:174–178` (unused) |
| G10 | No GST on the order. Prices are shown "excl. GST", `BillingInvoice` has `gstAmountInr` | `schema.prisma:651–672` |

## A4. New DECISION needed (updates DECISION-031)
Write it as the next free number (032 is reserved for the runtime proposal). Suggested text:
- **Starter and Teams become self-serve** through Razorpay one-time **prepaid orders**: 1 month or 12 months. No auto-renew in v1 (avoids RBI e-mandate work, see FREE_TRIAL_REVIEW §4 option B). Renewal = another checkout; reminder emails at T-7 and T-1.
- **Enterprise stays sales-led** (DECISION-031 path unchanged).
- Still **no trials** (DECISION-031 stays for trials).
- **One plan-change function** owned by api-gateway (`billing-upgrade.ts`), exposed to billing-service as an internal, service-JWT-only route. billing-service owns payments, invoices and the webhook.
- Prices come from `subscription_plan_definitions` (seeded, DECISION-030 numbers). GST is added on top at checkout (rate and GSTIN: owner).
- At period end without renewal: `past_due` for a 7-day grace, then Free with data kept (Free retention is 30 days: `user-management-service/src/services/retention-service.ts:18`, so warn before downgrade).

## A5. Flow
```
Billing page (tenant_admin)             billing-service                      Razorpay         api-gateway
 "Buy Starter · annual" ──POST /billing/checkout {planId, cycle}──►
                          validate role + plan + cycle; price from DB (+GST)
                          create order (notes: tenantId, planId, cycle, invoiceId)───►
                          create BillingInvoice pending (orderId)                         
 ◄── {orderId, amount, keyId, invoiceId} ──
 open Razorpay Checkout (checkout.js) ───────────────────────────────────────────► pay
 ◄── handler {razorpay_order_id, razorpay_payment_id, razorpay_signature}
 ──POST /billing/checkout/verify──► HMAC(order_id|payment_id, keySecret) ok?
                                    mark invoice 'verifying' (NOT paid, plan NOT applied)
 UI shows "Payment received — activating…" and polls GET /billing/checkout/:invoiceId
                                                      ◄── webhook payment.captured (raw body + signature)
                          verify signature on RAW bytes; drop if event id seen
                          fetch order from Razorpay; amount + notes must match invoice
                          invoice → paid ──POST /internal/billing/apply-plan (service JWT)──► same function as
                                                                                    /billing/upgrade: Tenant.plan +
                                                                                    TenantSubscription(status active,
                                                                                    periodStart/End) in 1 tx,
                                                                                    invalidate plan cache
 poll sees 'active' → refresh /billing/subscription and /billing/limits
```
The webhook is the only thing that applies a plan. The client-side verify is only for faster UX.

## A6. Backend changes (file by file)
**Session R1 — api-gateway (S) 🔒**
- `src/routes/billing-upgrade.ts`: move the body of `POST /upgrade` into an exported `applyPlanChange(tenantId, targetPlan, {source, periodStart?, periodEnd?, actor})`. Keep `/upgrade` calling it.
- `src/routes/internal-billing.ts` (new): `POST /internal/billing/apply-plan`, **service JWT only** (`verifyServiceToken` from `packages/shared-auth/src/service-jwt.ts:35`, issuer `billing-service`). Register without the `/api/v1` prefix so nginx never routes it. Downgrade checks stay for downgrades; upgrades skip them.
- Tests: service-JWT required, user JWT rejected, transaction writes both rows, cache key deleted.

**Session R2 — billing-service (M) 🔒**
- `src/config.ts`: in `production`, reject the placeholder values for all three Razorpay secrets (fail at start).
- `src/schemas/billing.ts`: `PlanIdSchema` → `free|starter|pro|enterprise` (map display name "Teams" in the UI only). `CreateCheckoutSchema` adds `cycle: 'monthly'|'annual'`. New `VerifyCheckoutSchema`.
- `src/routes/subscriptions.ts:101`: require `x-user-role` ∈ {tenant_admin, super_admin}; no `'default'` tenant fallback; reject `enterprise` and `free`; price from `subscription_plan_definitions` (annual = `priceAnnualInr`); add GST; create `BillingInvoice` (pending, orderId, period dates) before returning.
- `src/services/razorpay-client.ts`: `createOrder` accepts `notes`; add `verifyPaymentSignature(orderId, paymentId, signature)` (HMAC with key secret) and `fetchOrder(orderId)`.
- `src/routes/checkout.ts` (new, keeps files < 400 lines): `POST /checkout/verify`, `GET /checkout/:invoiceId` (status for polling, tenant-scoped).
- `src/routes/webhooks.ts`: register a scoped `addContentTypeParser('application/json', { parseAs: 'string' })` so the signature is checked on raw bytes. Store `x-razorpay-event-id` in a new table and skip duplicates. On `payment.captured`: load invoice by orderId, check amount and `notes.tenantId`, mark paid, call gateway `apply-plan` with `signServiceToken('billing-service','api-gateway')`. Retry the call via BullMQ if the gateway is down (queue name added to `@etip/shared-utils/queues` — shared package change, ask first). Remove the `subscription.cancelled` → Free branch for v1 (we don't sell subscriptions yet).
- `src/services/plan-store.ts:250`: stop swallowing repository errors on writes (log + throw).
- `prisma/schema.prisma` + migration: `BillingWebhookEvent { id (Razorpay event id, PK), type, receivedAt, processedAt?, status }`; `BillingInvoice` add `billingCycle` and `razorpayPayId` already exists.
- Tests: raw-body signature (a body with extra spaces must still verify), tampered body → 401, replay → processed once, amount mismatch → not applied, tenant mismatch → not applied, verify endpoint never applies a plan, production config refuses placeholders.

**Session R3 — frontend (M)**
- `src/lib/razorpay.ts` (new): load `https://checkout.razorpay.com/v1/checkout.js` on demand (no npm package). Check CSP: nginx sends no `Content-Security-Policy` today (`grep` finds none), so nothing to change now; if one is added later, allow `checkout.razorpay.com` and `api.razorpay.com`.
- `src/hooks/use-checkout.ts` (new): `startCheckout(planId, cycle)`, `verify`, poll status.
- `src/pages/BillingPage.tsx` (~:353 "Contact sales" button): Starter/Teams → "Buy"; Enterprise keeps Contact sales.
- `src/components/PlanCards.tsx`, `src/pages/PricingPage.tsx`: copy change from "Contact sales" to "Start with Free, upgrade in-app" for Starter/Teams. Guard test `plan-cards-pricing.test.ts` must still pass.
- Delete `useUpgradePlan` (`use-phase6-data.ts:174`).

**Session R4 — docs/ops (S):** runbook for refunds and "paid but not applied" (look up the invoice, re-run apply-plan), Razorpay dashboard webhook config, test-mode → live-mode switch checklist, update `SET_TENANT_PLAN.md`.

## A7. API shapes
`POST /api/v1/billing/checkout` `{ "planId": "starter", "cycle": "annual" }` →
`201 { "data": { "invoiceId": "uuid", "orderId": "order_Nx…", "amount": 11326584, "currency": "INR", "keyId": "rzp_live_…", "planId": "starter", "cycle": "annual", "prefill": { "email": "…", "name": "…" } } }`
(`amount` in paise: 95,988 + 18 % GST = ₹1,13,265.84 → 11326584. GST rate is O-R3.)

`POST /api/v1/billing/checkout/verify` `{ "invoiceId", "razorpay_order_id", "razorpay_payment_id", "razorpay_signature" }` → `200 { "data": { "status": "verifying" } }` or `400 PAYMENT_SIGNATURE_INVALID`.

`GET /api/v1/billing/checkout/:invoiceId` → `{ "data": { "status": "pending|verifying|paid|failed", "planApplied": true, "plan": "starter", "periodEnd": "2027-09-25T00:00:00Z" } }`.

Internal `POST /internal/billing/apply-plan` (gateway, service JWT) `{ "tenantId", "targetPlan": "starter", "source": "razorpay", "invoiceId", "periodStart", "periodEnd" }` → `200 { "data": { "plan": "starter", "status": "active" } }`.

Webhook: unchanged URL; always `200 {received:true}` after a valid signature (also for duplicates), `401` for bad signature.

## A8. Acceptance checks (Razorpay **test mode** first)
1. Buy Starter monthly with a test card → within 30 s `tenants.plan = 'starter'`, `tenant_subscriptions.status='active'`, invoice `paid`, FeatureGate unlocks without re-login.
2. Replay the same webhook from the Razorpay dashboard → no second invoice change, log says duplicate.
3. Send a webhook with a wrong signature → 401, nothing changes.
4. Close the checkout window → invoice stays `pending`, plan unchanged.
5. Annual Teams → `plan='pro'`, `currentPeriodEnd` ≈ +12 months.
6. billing-service refuses to start in production with placeholder secrets.
7. Adversarial review (🔒) signed off before live keys.

## A9. Rollback
Feature flag `TI_SELF_SERVE_CHECKOUT_ENABLED` (billing-service + a frontend build flag); off → Buy buttons revert to Contact sales, `/checkout` returns 404. The webhook stays on so in-flight payments still apply. Migrations are additive. Git tag before each session.

## A10. Owner decisions
- **O-R1** Approve the new DECISION (prepaid orders, no auto-renew, Starter/Teams self-serve).
- **O-R2** Grace period and what happens at expiry (Free with data kept, 30-day retention warning).
- **O-R3** GST: registered? GSTIN on invoices? Show prices incl. or excl. GST at checkout?
- **O-R4** Refund policy text for the pricing page.
- **O-R5** Live Razorpay keys and webhook secret set in the VPS `.env` (never committed).

## A11. Risks
- Payments are security-critical: signature on raw bytes, replay, amount/tenant tampering, and a paid-but-not-applied gap if the gateway is down (mitigated by retry queue + runbook).
- Two services touch plan state. Keeping **one** `applyPlanChange` function in the gateway is what keeps them consistent.
- The seed/billing plan id mismatch (`pro` vs `teams`) must be fixed first or plans will silently not persist.

---

# Part B — SEO plan phases 2.2–4: status check (2026-09-25)

| Item (SEO_PLAN §6) | Status | Evidence |
|---|---|---|
| 1.1 robots, sitemap, OG image, JSON-LD | ✅ Deployed (S147 #20) | `apps/frontend/public/robots.txt`, `sitemap.xml`, `brand/og-image.png`. `llms.txt` dropped by owner decision (AI crawlers blocked) |
| 1.2 true 404, noindex headers | ✅ Deployed (S147 #20) | PROJECT_STATE deploy log S147 |
| 1.3 lazy-load app pages | ✅ Done (19 `lazy(` in `App.tsx`) | — |
| 1.3 self-hosted fonts | ⏳ Pending | `index.html:66–68` still loads Google Fonts |
| 1.4 Search Console / Bing / IndexNow | ⏳ Unknown (off-repo); no IndexNow key file in `public/` | owner to confirm |
| 2.1 `usePageMeta` + prerender | ✅ Deployed (S147 #21) | `src/hooks/use-page-meta.ts`, `scripts/prerender.mjs`, `Dockerfile.frontend:33–38` |
| 2.2 `/pricing` | ✅ Deployed (S147 #22) | `src/pages/PricingPage.tsx`, route `App.tsx:84` |
| 2.2 `/features/*` (8), `/solutions/*` (3), about/contact/privacy/terms/security | ⏳ Not started | `src/seo/public-routes.ts` lists only `/` and `/pricing` (:61, :68) |
| 2.3 Glossary | ⏳ Not started | no `/glossary` route or content |
| 2.4 Sitemap from route list | ⏳ Not started | `public/sitemap.xml` is hand-written with 2 URLs |
| 3.1 Public CVE pages | ⏳ Not started | no `/cve` route in gateway `routes/public/` |
| 3.2 Free tools | ⏳ Not started | — |
| 3.3 IndexNow ping | ⏳ Not started | — |
| 4 compare pages, weekly brief, India cluster, links | ⏳ Not started | — |

**Next sessions (one module each):**
| S | Module | Work | Size |
|---|---|---|---|
| G1 | frontend | 2.4 first: generate `sitemap.xml` from `public-routes.ts` at build (prerender script), so every new page is listed automatically. Self-host fonts (1.3 leftover) | S |
| G2 | frontend | 2.2a: `/features/*` (8 pages) from one data file + one template component; add to `public-routes.ts` | M |
| G3 | frontend | 2.2b: `/solutions/*` + legal pages (privacy/terms need owner text) | M |
| G4 | frontend | 2.3 glossary (15–20 terms, `DefinedTerm` JSON-LD) | M |
| G5–6 | api-gateway 🔒 | 3.1 CVE pages (needs the vulnerability source decision below) | L → 2 |
| G7+ | api-gateway + frontend 🔒 | 3.2 tools, starting with EPSS/CVE lookup | L → 3 |

**Watch-out for 3.1:** vulnerability-intel data is tenant-scoped (`vulnerability-intel/src/routes/vulnerabilities.ts:42` uses `user.tenantId`). Public CVE pages need a global source: either the `intelwatch-system` tenant's data or a global CVE table. Decide before G5 (owner decision O-S1).

**Acceptance per page:** listed in `public-routes.ts` and the generated sitemap; prerendered HTML has title, description, canonical, JSON-LD; 375 px check; Lighthouse SEO ≥ 95.

---

# Part C — Weekly threat brief (reporting-service)

## C1. Goal
Every Monday, a draft "IntelWatch Weekly Threat Brief — India + Global, week YYYY-WW" built from **real** pipeline data. A human edits it, then it is published as a public blog page (SEO) and shown to customers in-app.

## C2. Why now
It is the cheapest recurring SEO content (SEO_PLAN §6 Phase 4) and a visible proof that the pipeline works.

## C3. Current state (verified) — a big surprise
- **Every report reporting-service produces today uses hard-coded, invented numbers.** `services/data-aggregator.ts:88–175` returns fixed values ("APT29 C2 Infrastructure", "Emotet", CVE-2024-3400, totals × 7 for weekly) and `Math.random()` trend points (:153). No call to any other service.
- Reports and schedules live in memory: `services/report-store.ts:33`, `services/schedule-store.ts:26–27` (not listed in W4/W14 — add to step 3).
- What exists and is reusable: report types incl. `weekly` (`schemas/report.ts:3`), formats json/html/pdf/csv, `template-engine.ts`, `workers/report-worker.ts`, `node-cron` and `bullmq` deps.
- Real data sources (all tenant-scoped behind user JWT today): normalization `GET /api/v1/normalization/global-iocs/stats` (`routes/tenant-overlay.ts:73`), vulnerability-intel `GET /api/v1/vulnerabilities?sortBy=…` and `/stats`, ingestion `GET /api/v1/articles`, analytics `top-iocs/top-actors/top-vulns` (`analytics-service/src/routes/dashboard.ts:51–65`).

## C4. Flow
```
cron Mon 05:30 IST (reporting-service)
  └─► BriefBuilder: fetch (service JWT) global IOC stats, top KEV/high-EPSS CVEs of the week,
      top articles by severity, India-tagged items (geo/CERT-In source)
  └─► template → Markdown + HTML draft, stored in Postgres (WeeklyBrief, status 'draft')
  └─► email owner "Draft ready" (existing mailer pattern)
owner edits in Command Center → status 'approved'
  └─► public: copy approved Markdown into apps/frontend/src/content/briefs/YYYY-WW.md (PR)
      → prerender builds /blog/weekly-threat-brief-YYYY-WW (+ BlogPosting JSON-LD, RSS)
  └─► in-app: GET /api/v1/reports/briefs/latest for all tenants
```
Publishing through a repo PR keeps the public site static (no new unauthenticated API).

## C5. Backend changes
**Session B1 — reporting-service (M)** — must fix the fake aggregator first:
- `src/services/data-aggregator.ts`: replace the invented collectors with HTTP calls to the services above (per-tenant for tenant reports). Where a source is down, the report says "data unavailable" for that section — never invented numbers. Split into `src/services/collectors/*.ts` to stay under 400 lines.
- Persistence for reports/schedules (Prisma, DECISION-027) — or do it in step 3 first (recommended).
**Session B2 — reporting-service (M):**
- `src/services/brief-builder.ts` (new), `src/routes/briefs.ts` (new): `GET /briefs/latest`, `GET /briefs/:week`, `PUT /briefs/:week` (super admin edits), `POST /briefs/:week/approve`.
- Prisma `WeeklyBrief { week (PK, '2026-39'), status, markdown, html, sources Json, createdAt, approvedBy?, approvedAt? }`.
- Cron in `src/index.ts` behind `TI_WEEKLY_BRIEF_ENABLED`.
**Session B3 — frontend (S–M):** `/blog` index + `/blog/:slug` from `src/content/briefs/*.md` at build; `BlogPosting` JSON-LD; RSS `public/rss.xml` generated at build; in-app "This week's brief" card.

## C6. API shapes
`GET /api/v1/reports/briefs/latest` → `{ "data": { "week": "2026-39", "title": "…", "status": "approved", "html": "…", "highlights": [{ "kind": "cve", "id": "CVE-…", "why": "KEV added, EPSS 0.94" }], "generatedAt": "…" } }`
`PUT /api/v1/reports/briefs/2026-39` (super admin) `{ "markdown": "…" }` → `{ "data": { "status": "draft" } }`.

## C7. Tests and acceptance
- Unit: aggregator never returns constants when sources fail (returns `unavailable`); brief builder with fixture data; IOCs defanged (`1.2.3[.]4`, `hxxp`); no tenant names or tenant-private IOCs in a public brief.
- Acceptance: a report generated for a tenant with 0 IOCs shows 0, not 1,250; Monday draft appears; one approved brief live at `/blog/weekly-threat-brief-2026-WW`, in the sitemap, with valid `BlogPosting`.

## C8. Rollback
`TI_WEEKLY_BRIEF_ENABLED=false`. Public briefs are just files; revert the PR to unpublish.

## C9. Owner decisions
- **O-B1** Global data source: the `intelwatch-system` tenant, or global tables (`GlobalIoc`/`GlobalArticle`, only filled when `TI_GLOBAL_PROCESSING_ENABLED=true`, default false)? Same question as O-S1.
- **O-B2** Who edits and approves each week; publish day.
- **O-B3** Use AI to write the summary paragraph (needs `TI_AI_ENABLED` and a cost line) or template only?

## C10. Risks
- Publishing anything that came from a customer's private feed. Only global/OSINT sources may feed the public brief; add a test.
- Until B1 ships, customers can download reports full of invented data. Consider hiding report generation or labelling it "sample" in step 5 (S161).

---

## Session summary (parallel track)
| Order | Module | Work | Size | Gate |
|---|---|---|---|---|
| any | frontend | SEO G1–G4 | S–M each | — |
| any | reporting-service | B1 real aggregator (+ persistence) | M | — |
| after B1 | reporting-service, frontend | B2, B3 weekly brief | M, S–M | owner O-B1 |
| after step 5 + DECISION | api-gateway | R1 apply-plan function + internal route 🔒 | S | adversarial review |
| after R1 | billing-service | R2 checkout, verify, raw-body webhook, idempotency 🔒 | M | adversarial review |
| after R2 | frontend | R3 Buy flow | M | test-mode E2E |
| after R3 | docs/ops | R4 runbooks, live keys | S | owner O-R1…R5 |
| later | api-gateway 🔒 | SEO 3.1 CVE pages, 3.2 tools | L | owner O-S1 |
