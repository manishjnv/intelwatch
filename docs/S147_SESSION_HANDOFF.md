# Session 147 — Handoff

**Dates:** 2026-09-22 → 2026-09-23 · **Model:** Opus 5.5 (1M) · **Status:** all work merged and deployed (PRs #20–#30). Nothing is left uncommitted.
**Later sessions:** S148 (nginx outage after the #30 deploy, fixed; PR #31) and S149 (offboarding purge, PR #32) ran afterwards. Their handoff is `docs/SESSION_HANDOFF.md`. This file covers S147 only.

## 1. Summary (in order)
**Ship the S146 branch**
- PR #20 merged and deployed. It had VPS hardening (all 33 published ports now loopback-only; only sshd is public), nginx security headers, and SEO Phase 1 (robots.txt, sitemap, true 404s, noindex on app routes). Master CI was green again for the first time since June.

**SEO Phase 2**
- #21: build-time prerender of public routes with React `renderToPipeableStream` (no headless browser), per-route `<head>` meta, and `/` served as prerendered `home.html`. Caught and fixed a React 18 `<style>` escaping bug.
- #22: public `/pricing` (INR, monthly/annual toggle, JSON-LD offers, sitemap).

**Pricing and trial decisions**
- DECISION-030: monthly ₹9,999 / 18,999 / 49,999; annual ₹7,999 / 14,999 / 39,999 per month. The signup cards had headlined the annual rate as the monthly price.
- The free-trial review found trials never expired and there was no working payment path.
- DECISION-031 (owner): **no trials**. Free is self-serve; every paid plan goes to Contact sales. The UI part shipped in #22 and the backend in #24. A super admin applies plans with a runbook.

**Security (found during the trial review)**
- #23: several services behind nginx had no authentication and trusted client `x-tenant-id` / `x-user-role` headers. Fixed with nginx `auth_request` to a new api-gateway `/api/v1/auth/verify[/super-admin]`, and the identity headers are now overwritten from the verified JWT. An adversarial review (Sonnet fallback) accepted it after one fix: the rate-limit key now uses the verified tenant or `CF-Connecting-IP`.
- #29: `POST /api/v1/search/reindex` (tenant taken from the request body) is now super-admin only.
- #24 also removed the paid-signup domain guard, which leaked other tenants' names, and the register API's `plan: enterprise` path.

**Owner click-through: fixing the app's wiring**
- The "Demo data" banners were older bugs hidden by the silent demo fallback, not the auth change.
- #26: DRP never loaded its JWT config (every request returned 500); billing and customization had no `TI_DATABASE_URL`.
- #27: the Billing tab shows the real plan (new gateway `/billing/subscription`); FeatureGate limits double-unwrap fixed; IOC pivot and timeline use the correct service.
- #28: `apiList()` normalises three list envelopes across 32 hooks. The Vulnerabilities list and others rendered empty before. SSO and ticketing paths fixed.

## 2. PRs and commits (all on master)
| PR | Merge | What | Detail doc |
|---|---|---|---|
| #20 | `9d7bf50` | VPS hardening + SEO Phase 1 + CI unblock | docs/S147_P1_HARDENING_SEO_PHASE1.md |
| #21 | `9708a3c` | Prerender + per-route meta | docs/S147_P2A_PRERENDER_PAGE_META.md |
| #22 | `249bcaf` | /pricing, DECISION-030, no-trial UI, free-trial review | docs/S147_P2B_PRICING_PAGE.md, docs/FREE_TRIAL_REVIEW_AND_PLAN.md |
| #23 | `537b7fb` | API auth at nginx (`auth_request`) + gateway verify + authenticated downloads | RCA "Session 147b" |
| #24 | `75e8cb8` | No trials (backend), sales-led plan change route, runbook | docs/runbooks/SET_TENANT_PLAN.md, DECISION-031 |
| #25 | `d612385` | Session docs (PROJECT_STATE, RCA, stats) | — |
| #26 | `9d12a91` | DRP JWT; DB URL for billing + customization | docs/S147_APP_WIRING_FOLLOWUPS.md |
| #27 | `32e5a3a` | Real billing plan/limits; IOC pivot/timeline | same |
| #28 | `93011bd` | `apiList()` list-envelope fix (32 hooks); SSO + ticketing paths | same |
| #29 | `3d44d36` | Search reindex super-admin only | same |
| #30 | `430a4b5` | Docs for #26–#29 + follow-ups | — |

## 3. Key files (new unless noted)
- **nginx:** `docker/nginx/conf.d/service-auth.inc`, `service-auth-super-admin.inc`; `default.conf` (modified: auth includes on 25 locations, gateway routes for admin features, `billing/(limits|subscription|upgrade)`, the webhook, reindex).
- **api-gateway:** `routes/auth-verify.ts`, `plugins/rate-limit-key.ts`; `routes/billing-upgrade.ts` (modified: `GET /subscription`).
- **frontend:**
  - `src/seo/public-routes.ts`, `hooks/use-page-meta.ts`, `entry-server.tsx`, `scripts/prerender*.mjs`
  - `pages/PricingPage.tsx`, `components/public/PublicLayout.tsx`, `data/plans.ts`
  - `lib/api-list.ts`, and `apiDownload()` in `lib/api.ts`
- **user-service, admin-service, billing:** trial logic removed (modified).
- **drp-service:** `index.ts` now calls `loadJwtConfig`.
- **compose:** `TI_DATABASE_URL` added for billing and customization.

## 4. Verification done
- Every deploy was verified live, with 32/32 healthy after each.
  - nginx configs were validated **before merge** with `nginx -t -c` inside the live `etip_nginx` container (method below).
  - Anonymous probes: services return 401, the webhook is reachable, gateway admin routes resolve.
  - `/pricing` has JSON-LD and zero "trial" mentions; `/` is prerendered.
- Test totals at the end: frontend **116 files / 1,826 passed**, api-gateway **290+** (verify 11, rate-limit, billing 15), user-service 176, admin-service 195, billing-service 190, drp-service 310.
- Read-only DB checks:
  - 0 trialing tenants and no subscription rows, so the migration phase was a no-op.
  - The app role `etip_user` is a superuser with BYPASSRLS.

## 5. Open items / next
1. **Owner re-test** after #26–#28: Billing & Plans (real plan), Overview, Vulnerabilities, DRP, IOC relations/timeline, SSO. The Users list still shows demo members (the backend list route doesn't exist).
2. **Search index empty** (0 of 5,934 IOCs). Only enrichment enqueues `IOC_INDEX`, and with a bad payload. Decide global-vs-tenant indexing (DECISION-029) first, then normalization enqueue plus backfill. Design in docs/S147_APP_WIRING_FOLLOWUPS.md §A.
3. **Missing backend endpoints** (§C): tenant user list, enrichment-by-IOC, graph overview, MFA enforcement, teams/roles/audit/stats, the global-AI config shape, and Command Center Clients (in-memory).
4. **Demo-fallback UX** (§B): show an error state when an API fails, not fake data.
5. **Hardening:** a least-privilege Postgres app role; cache auth verify results; a session-revocation check on access tokens.
6. **SEO 2c/2d:** features/solutions/legal pages, glossary, and a sitemap generated from `PUBLIC_ROUTES`. Owner: Search Console and Bing verification.
7. The private security notes (scratchpad `SECURITY_S147_PRIVATE.md`) cover fixed-and-deployed issues. Keep them private; the public RCA row "Session 147b" is the summary.

## 6. Techniques worth reusing
- **Validate nginx before merge without touching live config:** `git -c core.autocrlf=false archive <branch> docker/nginx/nginx.conf docker/nginx/conf.d | ssh … 'tar x -C /tmp/x; sed -i "s#/etc/nginx/conf.d/#/tmp/x/…/conf.d/#g" …; docker cp /tmp/x etip_nginx:/tmp/; docker exec etip_nginx nginx -t -c /tmp/x/…/nginx.conf'`.
- **Frontend tests locally:** `npx --yes node@22 ../../node_modules/vitest/vitest.mjs run` (local Node 20.11.1 is too old for jsdom 29).
- **Local frontend image:** `git -c core.autocrlf=false archive HEAD | docker build -f Dockerfile.frontend -`. Building from the working tree breaks on nested `node_modules`.
- **Deploy fails with `websocket: bad handshake`:** it's the Cloudflare tunnel; `gh run rerun <id> --failed`. **After any red deploy, check for containers stuck in `Created`** (see S148).
- **Don't trust a screenshot:** the UI silently falls back to demo data. Read nginx access logs for the real status codes.
- **Public repo:** unfixed vulnerability details stay out of `docs/` until deployed (memory: `feedback_public_repo_disclosure`).

## 7. How to resume
```
Working on: <search index pipeline | missing backend endpoints | SEO 2c>.
Read: docs/S147_APP_WIRING_FOLLOWUPS.md, docs/SESSION_HANDOFF.md (latest session), docs/PROJECT_STATE.md.
Use `env -u GH_TOKEN gh …`; commit with the noreply identity; validate nginx changes in the live container before merge.
```

## Agent utilization
- **Opus:** all planning, implementation, reviews, deploys and verification. Main session, Opus 5.5.
- **Sonnet:** 3 subagents. Free-trial code map; adversarial review of #23; API path-mismatch map.
- **Haiku:** n/a. Greps were small enough to run directly.
- **codex:rescue:** n/a. The companion wasn't used; the #23 security gate went to a Sonnet takeover, verdict=accept after 1 fix (rate-limit key).

Routing telemetry:
- `Sonnet/Explore · map free-trial code paths · reworked: N`
- `Sonnet/general · adversarial review auth_request fix · reworked: N` (its finding was applied)
- `Sonnet/Explore · map broken API path mismatches · reworked: Y` (it misread `api()` as not unwrapping `{data}`, so most "shape risk" claims were wrong; Opus corrected)
