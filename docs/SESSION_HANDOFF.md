# SESSION HANDOFF DOCUMENT

**Date:** 2026-03-23
**Session:** 40
**Session Summary:** Billing Service (Module 19) — core + 5 P0 improvements. Plan management (Free/Starter/Pro/Enterprise), Razorpay billing, usage metering with threshold alerts, GST invoices, upgrade/downgrade with 72hr grace period, coupon codes. 28 endpoints, 149 tests. Port 3019.

---

## MANDATORY: Review These Architecture Docs Every Session

| Document | When to Load | Key Content |
|----------|-------------|-------------|
| `docs/architecture/CTI-Pipeline-Architecture-v2.0.html` | Pipeline work | 4-stage pipeline, composite confidence formula, enrichment Stage 2.5, cost model, 3-layer dedup, IOC lifecycle state machine |
| `docs/architecture/ETIP_Architecture_Blueprint_v4.html` | Phase 4+ | 22-module map, living graph with retroactive risk propagation, 3 enrichment patterns, reasoning trail schema, prompt caching, STIX/TAXII |

---

## ✅ Changes Made (Session 40)

| Commit | Files | Description |
|--------|-------|-------------|
| e2c897a | 43 | feat: add Billing Service (Module 19) — core + P0 improvements. 22 src files, 14 test files, package.json, tsconfig.json, vitest.config.ts, README.md + infra changes (docker-compose, deploy.yml, tsconfig.build.json, pnpm-lock.yaml). |

## 📁 Files Created

| File | Purpose |
|------|---------|
| `apps/billing-service/package.json` | Package definition, deps: fastify, zod, pino, razorpay, shared-* |
| `apps/billing-service/tsconfig.json` | TS config with composite:true + references to shared packages |
| `apps/billing-service/vitest.config.ts` | Test config with vitest alias resolution |
| `apps/billing-service/src/config.ts` | Zod-validated env config (port 3019, Razorpay keys) |
| `apps/billing-service/src/logger.ts` | Pino logger with key/secret redaction |
| `apps/billing-service/src/app.ts` | Fastify app builder with 8 route groups |
| `apps/billing-service/src/index.ts` | Entry point, DI wiring, graceful shutdown |
| `apps/billing-service/src/plugins/error-handler.ts` | AppError + ZodError + 429 rate-limit handler |
| `apps/billing-service/src/schemas/billing.ts` | All Zod schemas: PlanId, UsageMetric, CreateSubscription, etc. |
| `apps/billing-service/src/services/plan-store.ts` | 4 plan tiers with limits/features; tenant plan assignment; setRazorpayIds |
| `apps/billing-service/src/services/usage-store.ts` | In-memory usage metering; alert thresholds (80/90/100%); history; monthly reset |
| `apps/billing-service/src/services/razorpay-client.ts` | Razorpay SDK wrapper; HMAC-SHA256 webhook verify; timingSafeEqual |
| `apps/billing-service/src/services/invoice-store.ts` | GST invoice (18%); receipt generation; revenue metrics |
| `apps/billing-service/src/services/upgrade-flow.ts` | Proration calc; 72hr grace period; schedule downgrade to period-end |
| `apps/billing-service/src/services/coupon-store.ts` | Percentage/flat discounts; expiry + maxUses enforcement |
| `apps/billing-service/src/routes/health.ts` | GET /health, GET /ready |
| `apps/billing-service/src/routes/plans.ts` | GET /plans, /plans/compare, /plans/:planId, /plans/tenant/plan |
| `apps/billing-service/src/routes/usage.ts` | GET /usage, POST /usage/track, GET /usage/limits, GET /usage/history |
| `apps/billing-service/src/routes/subscriptions.ts` | POST/GET /subscriptions, POST /subscriptions/cancel, POST /checkout, GET /payment-methods |
| `apps/billing-service/src/routes/invoices.ts` | GET /invoices, /invoices/:id, /invoices/:id/receipt, POST /invoices/:id/resend |
| `apps/billing-service/src/routes/upgrade.ts` | GET /upgrade/preview, POST /upgrade, POST /downgrade |
| `apps/billing-service/src/routes/p0-features.ts` | GET /upgrade-prompts, GET /alerts, GET /coupons/:code, POST /coupons/apply |
| `apps/billing-service/src/routes/webhooks.ts` | POST /webhooks/razorpay (HMAC-SHA256 verified) |
| `apps/billing-service/src/routes/admin.ts` | GET /admin/dashboard (revenue, MRR, churn, plan distribution) |
| `apps/billing-service/README.md` | Module docs: 28 endpoints, plan tiers, env vars |
| `apps/billing-service/tests/*.test.ts` | 14 test files: plan-store, usage-store, razorpay-client, invoice-store, upgrade-flow, coupon-store, plan-routes, usage-routes, subscription-routes, invoice-routes, upgrade-routes, webhook-routes, admin-routes, health |

## 📝 Files Modified

| File | Change |
|------|--------|
| `tsconfig.build.json` | Added `{ "path": "apps/billing-service" }` |
| `docker-compose.etip.yml` | Added etip_billing container (port 3019, 256M memory limit, curl healthcheck) |
| `.github/workflows/deploy.yml` | Added etip_billing build + force-recreate + health check (port 3019) |
| `pnpm-lock.yaml` | Added razorpay ^2.9.5 lockfile entry |

## 🔧 Decisions & Rationale

No new DECISION entries. Billing service uses:
- **DECISION-012**: Fastify plugin pattern (same as all Phase 6 services)
- **DECISION-013**: In-memory stores (Maps) — no Prisma needed for Phase 6 validation

Key architectural choices:
- Razorpay (not Stripe) — Indian market focus, INR currency primary, USD reference only
- GST 18% auto-applied to all invoices (Indian tax compliance)
- Grace period 72 hours — stored as `GRACE_PERIOD_MS = 72 * 3600 * 1000`
- Proration: `(msRemaining / msInMonth) * monthlyPrice`
- Alert thresholds iterate [100, 90, 80] high-to-low to return only the highest crossing
- Routes registered at `/api/v1/billing` prefix (not sub-prefix) for checkout/payment-methods/upgrade/downgrade so URL paths match spec exactly

## 🧪 E2E / Deploy Verification Results

Tests only (no VPS deploy yet — CI triggered by commit):
- 149 tests / 149 passing across 14 test files
- TypeScript: `pnpm exec tsc -b --force tsconfig.build.json` — 0 errors
- Lint: `pnpm --filter @etip/billing-service run lint` — 0 warnings
- Docker: not tested locally (pending CI)

## ⚠️ Open Items / Next Steps

### Immediate
- Configure VPS `.env` with real Razorpay keys:
  - `TI_RAZORPAY_KEY_ID=rzp_live_...`
  - `TI_RAZORPAY_KEY_SECRET=...`
  - `TI_RAZORPAY_WEBHOOK_SECRET=...`
  - `TI_RAZORPAY_PLAN_STARTER=plan_...`
  - `TI_RAZORPAY_PLAN_PRO=plan_...`
  - `TI_RAZORPAY_PLAN_ENTERPRISE=plan_...`
- Verify CI passes (commit e2c897a — deploy.yml triggered)

### Deferred
- Billing frontend page (plan cards, usage meters, upgrade flow, payment history) — separate session
- Admin Ops Service (Module 22) — system health dashboard, maintenance mode, announcement banner
- Migrate billing to Prisma when scaling horizontally (DECISION-013 note in README)
- Elasticsearch IOC indexing
- QA_CHECKLIST.md update

## 🔁 How to Resume

Paste this prompt to start next session:

```
/session-start

Scope: Phase 6 — Admin Ops (Module 22) or Billing Frontend. Do not modify: shared-*, api-gateway, all Phase 1-5 backend services, all frontend pages, apps/onboarding/, apps/billing-service/.

Context:
- Session 40 built Billing Service (Module 19). Commit e2c897a. 149 tests. CI pending.
- Phase 6: 2/3 complete (onboarding + billing). Remaining: admin-ops.
- 4031 total monorepo tests.
- VPS needs Razorpay env vars configured before billing goes live.
- Next: Admin Ops (Module 22) port 3020/3021, OR Billing frontend page (plan cards, usage meters).
```

## Module Map (Phase 6)

| Module | Port | Status | Skill File |
|--------|------|--------|------------|
| onboarding | 3018 | ✅ Deployed | skills/18-ONBOARDING.md |
| billing | 3019 | ✅ Built (CI pending) | skills/19-FREE-TO-PAID.md |
| admin-ops | 3020/3021 | 📋 Not started | skills/22-ADMIN-PLATFORM.md |
