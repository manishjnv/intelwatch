# Billing Service (Module 19)

**Port:** 3019 | **Phase:** 6 | **Status:** ✅ Complete | **Tests:** 149

Handles plan management, usage metering, Razorpay billing, invoice generation, and free-to-paid conversion for ETIP.

---

## Features

| Feature | File | Description |
|---------|------|-------------|
| Plan Management | `services/plan-store.ts` | 4 tiers: Free/Starter/Pro/Enterprise with feature flags + limits |
| Usage Metering | `services/usage-store.ts` | Track API calls, IOC ingestion, enrichments, storage per tenant |
| Razorpay Integration | `services/razorpay-client.ts` | Customer, subscription, order, webhook HMAC-SHA256 verification |
| Invoice & Billing | `services/invoice-store.ts` | Monthly invoices with GST (18%) + GST receipt generation |
| Upgrade/Downgrade | `services/upgrade-flow.ts` | Proration, scheduled downgrade, 72-hour grace period |
| Coupon Codes (P0 #10) | `services/coupon-store.ts` | Percentage/flat discounts with expiry + max-uses tracking |
| Upgrade Prompts (P0 #6) | `routes/p0-features.ts` | Contextual prompts at 80%/90%/100% usage |
| Usage Alerts (P0 #7) | `routes/p0-features.ts` + `services/usage-store.ts` | Threshold alerts, highest crossing returned |
| Grace Period (P0 #8) | `services/upgrade-flow.ts` | 72-hour tolerance after limit hit before hard cutoff |
| Billing Dashboard (P0 #9) | `routes/admin.ts` | Revenue, MRR, churn rate, plan distribution |

---

## API Endpoints (28)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Liveness probe |
| GET | /ready | Readiness probe |
| GET | /api/v1/billing/plans | List all 4 plans |
| GET | /api/v1/billing/plans/compare | Feature comparison matrix |
| GET | /api/v1/billing/plans/:planId | Get plan by id |
| GET | /api/v1/billing/plans/tenant/plan | Get tenant's current plan |
| POST | /api/v1/billing/plans/tenant/plan | Assign plan to tenant |
| GET | /api/v1/billing/usage | Current usage counters |
| POST | /api/v1/billing/usage/track | Track a usage event |
| GET | /api/v1/billing/usage/limits | Limits vs usage with % |
| GET | /api/v1/billing/usage/history | Usage history (30 days) |
| POST | /api/v1/billing/subscriptions | Create Razorpay subscription |
| GET | /api/v1/billing/subscriptions | Get current subscription |
| POST | /api/v1/billing/subscriptions/cancel | Cancel subscription |
| POST | /api/v1/billing/checkout | Create Razorpay checkout order |
| GET | /api/v1/billing/payment-methods | List available payment methods |
| GET | /api/v1/billing/invoices | List invoices (paginated) |
| GET | /api/v1/billing/invoices/:id | Get invoice |
| GET | /api/v1/billing/invoices/:id/receipt | GST receipt |
| POST | /api/v1/billing/invoices/:id/resend | Resend invoice email |
| GET | /api/v1/billing/upgrade/preview | Preview upgrade cost |
| POST | /api/v1/billing/upgrade | Execute upgrade |
| POST | /api/v1/billing/downgrade | Schedule downgrade |
| GET | /api/v1/billing/upgrade-prompts | Contextual upgrade prompts (P0 #6) |
| GET | /api/v1/billing/alerts | Usage threshold alerts (P0 #7) |
| GET | /api/v1/billing/coupons/:code | Validate coupon (P0 #10) |
| POST | /api/v1/billing/coupons/apply | Apply coupon (P0 #10) |
| POST | /api/v1/billing/webhooks/razorpay | Razorpay webhook (HMAC-SHA256 verified) |
| GET | /api/v1/billing/admin/dashboard | Revenue/MRR/churn (P0 #9) |

---

## Plan Tiers

| Plan | Price (INR) | Price (USD) | API Calls | Storage | Users |
|------|-------------|-------------|-----------|---------|-------|
| Free | ₹0 | $0 | 1,000/mo | 10K KB | 2 |
| Starter | ₹4,999/mo | $59/mo | 50,000/mo | 500K KB | 10 |
| Pro | ₹14,999/mo | $179/mo | 500,000/mo | 5M KB | 50 |
| Enterprise | Custom | Custom | Unlimited | Unlimited | Unlimited |

---

## Configuration

| Var | Default | Purpose |
|-----|---------|---------|
| TI_BILLING_PORT | 3019 | HTTP port |
| TI_BILLING_HOST | 0.0.0.0 | Bind address |
| TI_RAZORPAY_KEY_ID | placeholder | Razorpay API key id |
| TI_RAZORPAY_KEY_SECRET | placeholder | Razorpay API secret |
| TI_RAZORPAY_WEBHOOK_SECRET | placeholder | Webhook HMAC secret |
| TI_RAZORPAY_PLAN_STARTER | plan_starter | Razorpay plan id for Starter |
| TI_RAZORPAY_PLAN_PRO | plan_pro | Razorpay plan id for Pro |
| TI_RAZORPAY_PLAN_ENTERPRISE | plan_enterprise | Razorpay plan id for Enterprise |
| TI_JWT_SECRET | dev-only | JWT verification secret |
| TI_SERVICE_JWT_SECRET | dev-only | Service-to-service JWT secret |

---

## Data Notes

- **Storage:** In-memory (DECISION-013). Migrate to Prisma for production horizontal scaling.
- **Currency:** INR primary, USD displayed for reference.
- **GST:** 18% automatically added to all invoices (Indian compliance).
- **Grace period:** 72 hours after plan limit exceeded before hard cutoff.
- **Webhooks:** HMAC-SHA256 verified using `timingSafeEqual` before any processing.
- **Alert thresholds:** Iterate [100, 90, 80] — only highest crossing returned per metric.
