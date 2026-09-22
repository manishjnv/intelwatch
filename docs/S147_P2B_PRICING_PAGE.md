# S147 — P2(b): Public `/pricing` page + price alignment (SEO plan 2.2)

**Date:** 2026-09-23 · **Branch:** `feat/seo-phase2b-pricing` (stacked on `feat/seo-phase2a-prerender`)
**Status:** ✅ **Deployed and verified 2026-09-23** (PR #22, `249bcaf`). Later changed by DECISION-031: every paid plan is "Contact sales" and all trial copy is removed. Live: `/pricing` 200, JSON-LD offers, 0 "trial" mentions, in sitemap.
**Module:** frontend only. Billing, seeds and charge amounts are unchanged.
**Decision:** DECISION-030 (docs/DECISIONS_LOG.md)

## 1. Owner decisions (2026-09-23)
- List prices are **monthly**: Starter ₹9,999, Teams ₹18,999, Enterprise ₹49,999 (Free ₹0).
- `/pricing` shows **both monthly and annual** pricing through a toggle.

## 2. What the investigation found
| Question | Finding (code reference) |
|---|---|
| Price conflict ₹9,999 vs ₹7,999? | Not a billing conflict. `billing-service/src/services/plan-store.ts` and `prisma/seeds/plan-definitions*` already charge the monthly list prices. ₹7,999 / 14,999 / 39,999 is the per-month rate when billed annually (seed `priceAnnualInr` = 95,988 / 179,988 / 479,988 = 12×). **Bug:** `PlanCards.tsx` (Register and invite onboarding) headlined the annual rate as "/mo" without saying "billed annually" |
| Can customers buy annual self-serve? | **No.** `POST /billing/checkout` (`billing-service/src/routes/subscriptions.ts:107`) always charges `planDef.priceInr`, the monthly price. There is no annual cycle in the billing service. |
| Trial length | **7 days** for paid plans at signup (`user-service/src/service.ts:84`). The `trialDays` 14/30 values in billing `plan-store.ts` aren't used by signup |
| GST | 18%, added on top of the price (`invoice-store.ts:58` `GST_RATE = 0.18`). A GST receipt exists for paid invoices (`routes/invoices.ts:49`) |
| Payment methods | Razorpay: card, net banking, UPI, wallets, card EMI (`razorpay-client.ts:184`) |
| Enterprise contact | `sales@intelwatch.in` (already used by Register, ClientOnboarding and BillingPage) |

## 3. What was built
### 3.1 Signup cards (`PlanCards.tsx`) — commit `4617c80`
The headline is now the monthly list price. The annual option moves to the secondary line: "₹7,999/mo billed annually · save 20%" (Teams: ₹14,999, save 21%; Enterprise: ₹39,999, save 20%). `plan-cards-pricing.test.ts` pins the prices to the billing values.

### 3.2 `/pricing` page — commit `7c5b58f`
| Element | Detail |
|---|---|
| Design read | Pricing page for Indian security-team buyers (SOC leads, MSSPs), calm and dense B2B, on the app's existing dark CSS-variable tokens. Built with the `ui-design-workflow` skill |
| Hero | One h1, "Threat intelligence pricing in INR", plus a subtext of 13 words (trial and GST) and the **Monthly / Annual** toggle (`role=group`, `aria-pressed`). No CTAs or other elements in the hero |
| Cards | 4 plans from the same `PLANS` data as signup. Monthly view: list price, "Billed monthly · + 18% GST". Annual view: per-month annual rate, "₹95,988 billed yearly · + 18% GST" (Indian grouping, e.g. ₹1,79,988), and "Save N%" |
| CTAs | One label per intent. **Get started** → `/register` for Free, Starter and Teams (monthly). **Contact sales** (mailto with a subject) for Enterprise and **for every annual plan**, because checkout can only bill monthly and a signup must not silently bill monthly. "Recommended" (Teams) is the only filled card CTA |
| FAQ | 5 native `<details>` items, each answer 25 words or fewer and backed by §2 (GST, trial, payment, annual, upgrade). Claims that weren't backed were removed ("limits apply straight away", "built in India") |
| Layout | New shared `components/public/PublicLayout.tsx`: skip link, 64 px header (logo → `/`, Pricing, Sign in, **Get started**), footer (Pricing, Sign in, Contact sales). All links are real `<a>` elements. It will be reused by the 2(c) feature pages |
| Responsive | Cards are 1 column at base, 2 at `sm`, 4 at `xl`. On mobile the header hides the "Pricing" link (you're on it) and keeps Sign in and Get started |
| A11y | Visible focus ring on every interactive element, `aria-hidden` icons, `aria-live` note when switching to annual, `motion-reduce` on the FAQ icon |
| SEO | Route meta: title "Pricing — IntelWatch Threat Intelligence Platform". The description is generated from `PLANS` (never hand-typed prices). JSON-LD `SoftwareApplication` with one `Offer` per plan (INR, `UnitPriceSpecification` unit `MON`, `valueAddedTaxIncluded: false`). Prerendered to `dist/pricing/index.html` (29 KB). Added to `sitemap.xml` |

### 3.3 Infrastructure changes
- `src/data/plans.ts` (**new**) holds the plan data plus `formatInr`, `annualSavingsPercent`, `SALES_EMAIL` and `GST_RATE_PERCENT`. `PlanCards` re-exports `PLANS` and `PlanDef`, so existing imports are unchanged. It's data-only so the route table doesn't pull UI code into the landing bundle.
- Per-route JSON-LD: `prerender-lib.injectHead` inserts `<script type="application/ld+json" data-route-jsonld>` before `</head>`, and `usePageMeta` replaces or removes it on client navigation. The site-wide `@graph` in `index.html` is untouched.
- **Security:** `jsonLdScript` escapes `<` as `\u003c`, so no string value can close the `<script>` element. A test proves both that it can't be closed and that the escaped JSON parses back to the original.

## 4. Issues found and fixed during implementation
1. **JSON-LD escape silently a no-op.** My first write went through a Python heredoc, which turned the JS source `'\\u003c'` into `'\u003c'`. In JavaScript that is just `<`, so nothing was escaped. A runtime check caught it (the output contained `</script>`), and I fixed it byte-exactly. A regression test now covers it.
2. **Hydration test "Router inside Router" for `/pricing`** (lazy route). React 18's streaming server renderer leaves the last context values on shared context objects after a render that suspended. The client renderer in the same JS realm (the vitest process) then reads a stale Router context. **Production isn't affected:** browsers never run the server renderer, and sequential server-only renders in one process (what `prerender.mjs` does) were verified: `/pricing → / → /pricing → /` all render correctly. The fix is test-only: a trivial server render after each prerender, which switches the context state back to the root.

## 5. Verification (local)
| Check | Result |
|---|---|
| `node --test scripts/` | 11/11 (adds JSON-LD injection and script-breakout tests) |
| New and changed vitest suites | pricing-page 6, use-page-meta 9, prerender-hydration 4 (**`/` and `/pricing` hydrate with zero mismatches**), plan-cards-pricing 8 |
| **Full frontend suite** (Node 22) | **113 files, 1,812 passed, 2 skipped, 0 failed** |
| tsc | 121 errors both before and after the change, 0 in new or changed files |
| eslint (new and changed files) | clean |
| Build → SSR → prerender | `/pricing → dist/pricing/index.html (29,460 B)`: title, description, canonical, og:url and JSON-LD in the head; h1 and ₹0 / 9,999 / 18,999 / 49,999 in the body |
| Visual sweep at 1440 / 390 (Playwright) | **Not run.** Playwright isn't installed, and running containers locally was declined. Do the manual check after deploy (§6) |

## 6. Verify after deploy
```bash
curl -sI https://intelwatch.in/pricing | grep -iE "^HTTP|x-robots"            # 200, no x-robots
curl -s  https://intelwatch.in/pricing | grep -o '<title>[^<]*'               # Pricing — IntelWatch …
curl -s  https://intelwatch.in/pricing | grep -c 'data-route-jsonld'          # 1
curl -s  https://intelwatch.in/sitemap.xml | grep -c '/pricing'               # 1
```
Browser checks, at 1440 px and 390 px:
- No horizontal scroll, and the toggle switches prices.
- The Annual CTAs open a mail draft to sales. The Monthly CTAs go to `/register`.
- No hydration errors in the console.
- Google Rich Results Test on `/pricing` parses the SoftwareApplication offers.

## 7. Open items for the owner
1. **Self-serve annual checkout** needs a billing-service change: `POST /checkout` accepting `cycle: 'annual'` and charging `priceAnnualInr`, plus Razorpay handling. billing-service is a deployed (guarded) module, so this wasn't built. Until then, annual goes through sales.
2. Trial-length inconsistency: signup gives 7 days, but billing `plan-store.ts` has `trialDays` 14 / 14 / 30. The page states 7, which is what users actually get. Consider aligning or removing the unused field.
3. Demo-only annual figures in `use-plan-builder.ts` (99,999 / 189,999 / 499,999) differ from the seeds. They only appear in demo fallback mode.
