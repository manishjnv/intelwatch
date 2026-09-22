# IntelWatch SEO & Indexing Plan

**Created:** 2026-09-22 · **Status:** Phase 1 (1.1–1.3, minus self-hosted fonts) committed on `feat/vps-hardening-seo-phase1` in S146, not yet deployed. Phases 2–4 approved, not started. · **Owner:** Manish

## 1. Audit — current state (verified against repo + live intelwatch.in)

| Item | State |
|---|---|
| robots.txt / sitemap.xml / llms.txt | Missing. Every unknown URL returns **HTTP 200 + SPA shell** (soft 404) — `try_files ... /index.html` in `Dockerfile.frontend:52` |
| Rendering | 100% client-side. Google/Bing render JS with delay; **no AI crawler (GPTBot, ClaudeBot, PerplexityBot…) executes JS** → site is blank to them |
| Meta | One static title/description in `apps/frontend/index.html` for all routes. No canonical, no JSON-LD, no twitter card |
| og:image | Relative SVG (`/brand/logo-mark.svg`) — unsupported by LinkedIn/X/Slack/WhatsApp |
| noindex on app/API routes | None |
| Public indexable pages | Only `/`, `/login`, `/register`. No pricing/features/glossary/blog/tools |
| Bundle | Landing page shares bundle with the app (only ThreatGraphPage is lazy); Google Fonts render-blocking |
| Search Console / Bing WMT / IndexNow | Not set up |

## 2. Market research summary

**What wins organic traffic in threat intel** (robots/sitemaps of 15 vendors inspected):
1. **Programmatic entity pages** — Feedly `/cve/` (~41 sub-sitemaps), SOCRadar (500+ actor profiles, 12 free-tool sitemaps), AbuseIPDB/Pulsedive/GreyNoise per-indicator pages.
2. **Free lookup tools** — SOCRadar IOC Radar, AbuseIPDB check. SERPs for "IP reputation check", "EPSS score lookup" are held by thin, low-authority micro-tools → **best wedge for a new domain**.
3. **Glossary / knowledge hub** separate from blog (Cyble `/knowledge-hub/`). "What is IOC" page 1 = formulaic vendor glossaries; sub-variants (IOC vs IOA, EPSS vs CVSS) are winnable.
4. **High-cadence research blog** (Cyble) — not realistic solo; replace with one weekly auto-assisted threat brief.
5. **Comparison listicles** own "best threat intelligence tools" SERP (Cyble, Cyware blogs) — reachable. Head term "threat intelligence platform" is not (Recorded Future/CrowdStrike/Anomali).

**Open lanes for IntelWatch:** transparent INR pricing (neither Cyble nor CloudSEK shows any); self-serve free tier; India content (CERT-In advisories, DPDP, RBI) — CERT-In's own site is poorly optimized; fresh CVE pages with live EPSS+KEV (data already in pipeline).

**Risks to design around:**
- Publishing live malicious URLs/domains → Google Safe Browsing flag on intelwatch.in. **Always defang (`hxxp://`, `[.]`) on public pages; never hyperlink IOCs; raw export stays behind auth.**
- Scaled-content-abuse policy: templated pages with no unique data get demoted. Needs quality gates (§5).
- Cloudflare "managed robots.txt / AI bot blocking" silently prepends Disallow rules — check dashboard before launch.
- FAQ rich results discontinued (May 2026); `priority`/`changefreq` ignored by Google; Google Indexing API is JobPosting-only; Google does not support IndexNow (Bing/Yandex/Naver do). llms.txt has no measured citation effect — 10-minute task, not a priority.

## 3. Strategy decisions

| Decision | Choice | Why |
|---|---|---|
| Rendering for marketing pages | **Build-time prerender** of a fixed public route list (Playwright script post-`vite build`, writes `dist/<route>/index.html`) | No framework migration, no runtime dep. Playwright already usable in CI. Dynamic rendering rejected (Google deprecated it). Separate Astro site rejected for now (second pipeline) |
| Per-route meta | Tiny `usePageMeta()` hook (sets title, description, canonical, OG, JSON-LD in `document.head`); prerender snapshots it | React 18 has no native metadata hoisting; a ~30-line hook avoids adding react-helmet |
| Programmatic pages (CVE, later actors) | **Server-rendered HTML from Fastify** (template strings) at `/cve/:id`, plus dynamic sitemap XML | Data is server-side already; works for non-JS AI crawlers; no SSR framework |
| Private routes | `X-Robots-Tag: noindex` header (NOT robots Disallow) on app routes; `Disallow: /api/` only | Disallow + noindex conflict — blocked pages can still be URL-indexed |
| AI crawlers | **Owner decision (S146): block all AI crawlers** — training, search and assistant fetchers — in robots.txt. No llms.txt. | Owner's call; costs AI-search citations, revisit if that channel starts to matter |
| Canonical host | `https://intelwatch.in` apex; www→apex + http→https as Cloudflare redirect rule | TLS terminates at Cloudflare |

## 4. Target site architecture (public)

```
/                       Home (prerendered)
/pricing                INR only, plan matrix             [SoftwareApplication + Offers]
/features/{ioc-intelligence, vulnerability-intel, threat-actors, threat-graph,
           digital-risk-protection, threat-hunting, integrations, api}
/solutions/{mssp, soc-teams, smb}
/tools/{ip-reputation, epss-lookup, hash-lookup, typosquat-check, cve-lookup}
/cve/                   hub: latest, KEV, top-EPSS        (server-rendered)
/cve/CVE-YYYY-NNNNN     programmatic page                 (server-rendered)
/glossary/{term}        15–20 terms                       [DefinedTerm]
/compare/{recorded-future-alternative, socradar-alternative, best-free-threat-intelligence-tools, ...}
/blog/  /blog/weekly-threat-brief-YYYY-WW                 [BlogPosting]
/india/cert-in-advisories/{id}                            (phase 3)
/docs  /changelog  /about  /contact  /privacy  /terms  /security
```
Internal linking: glossary ↔ feature pages ↔ tools; every CVE page links to `/tools/epss-lookup`, its vendor/CWE hub, and signup CTA. Breadcrumbs + `BreadcrumbList` everywhere.

## 5. Quality gates for programmatic pages

- Index a CVE page only if it has **≥3 of:** CVSS, EPSS score+percentile, KEV status/date, affected products (CPE), exploit/IOC sightings from our feeds, linked actors/malware, first-seen-in-IntelWatch date. Otherwise render with `noindex` and leave out of sitemap.
- Launch with **recent + high-signal only** (last 90 days, all KEV, EPSS ≥ 0.1) — a few thousand pages, not the 250k backlog. Expand by Search Console "indexed vs discovered" ratio.
- `lastmod` = real data-change timestamp (EPSS delta > threshold, KEV added, new sighting). Never blanket "today".
- Sitemap index: `sitemap-pages.xml` (static), `sitemap-cve-recent.xml`, `sitemap-cve-kev.xml`, `sitemap-cve-YYYY.xml`, later `sitemap-glossary/blog`. ≤50k URLs each.
- All IOCs defanged, no outbound links to malicious hosts, `rel="nofollow noopener"` on reference links.
- Rate-limit + cache (1h, Redis via existing caching pattern) public server-rendered routes; they are unauthenticated.

## 6. Implementation roadmap

Each row is one session / one module (CLAUDE.md scope rule). P = priority.

### Phase 1 — Technical foundation (week 1–2)
| # | Task | Module / files | Size |
|---|---|---|---|
| 1.1 | Real `robots.txt`, `sitemap.xml` (static pages), `llms.txt`, 1200×630 PNG OG image, absolute OG/twitter tags, canonical, Organization+WebSite+SoftwareApplication JSON-LD in `index.html` | frontend: `public/`, `index.html` | S |
| 1.2 | nginx in `Dockerfile.frontend`: move inline conf to a file; exact-match locations for txt/xml; **true 404** (map of known SPA prefixes → index.html, else 404 status with SPA not-found body); `X-Robots-Tag: noindex` on app prefixes + `/login` `/register` `/auth` `/onboard`; `no-cache` on index.html. In `docker/nginx/conf.d/default.conf`: `X-Robots-Tag: noindex` on `/api/`, `/grafana/`, `/health` | frontend Dockerfile + docker/nginx | S–M · RCA check: healthcheck still uses `/` |
| 1.3 | Lazy-load all authenticated pages in `App.tsx` so `/` ships only landing code; self-host Inter/JetBrains Mono woff2 | frontend | S |
| 1.4 | Off-repo: Cloudflare www→apex rule, check AI-bot/managed-robots settings; verify Google Search Console (DNS TXT) + Bing WMT; submit sitemap; IndexNow key file in `public/` | ops | S |

Acceptance: `curl -I /robots.txt` → `text/plain`; `/nonexistent` → 404; `/dashboard` → `X-Robots-Tag: noindex`; Lighthouse SEO ≥ 95, LCP < 2.5s on `/`.

### Phase 2 — Crawlable marketing site (week 2–5)
| # | Task | Module | Size |
|---|---|---|---|
| 2.1 | `usePageMeta` hook + `scripts/prerender.mjs` (Playwright over route list → `dist/<route>/index.html`), wired into frontend build stage; `hydrateRoot` when prerendered markup present | frontend + Dockerfile.frontend | M · verify `make docker-test` (Chromium in `node:20-slim` build stage — if too heavy, run prerender in CI and COPY artifacts) |
| 2.2 | Pages: `/pricing`, 8 `/features/*`, 3 `/solutions/*`, about/contact/privacy/terms/security. Follow ui-design-workflow skill; 375px-first | frontend | L → 2 sessions |
| 2.3 | Glossary: 15–20 terms as MD/TS content → `/glossary/*` with DefinedTerm schema | frontend | M |
| 2.4 | Sitemap generation from the prerender route list (one source of truth) | frontend | S |

### Phase 3 — Programmatic + tools (week 5–10) — the growth engine
| # | Task | Module | Size |
|---|---|---|---|
| 3.1 | Public CVE pages: `GET /cve`, `/cve/:id` server-rendered HTML + `/sitemaps/cve-*.xml` + quality gates (§5); nginx routes `/cve` and `/sitemaps/` to gateway. **Security-adjacent (new unauthenticated surface) → adversarial review before push.** Reads via vulnerability-intel service API (no cross-module DB) | api-gateway (Tier 1 — additive routes only; needs explicit approval) | L → 2 sessions |
| 3.2 | Free tools: `/tools/epss-lookup`, `/tools/cve-lookup` first (pure data we own), then `/tools/ip-reputation`, `/tools/hash-lookup`, `/tools/typosquat-check` (reuse enrichment + DRP engines). Public endpoints with strict per-IP rate limit + result cache; results pages `noindex` (only tool landing pages indexed) | api-gateway + frontend | L → 3 sessions |
| 3.3 | IndexNow ping on new/changed CVE page (Bing/Yandex) from the existing EPSS/KEV refresh cron | vulnerability-intel | S |

### Phase 4 — Content & authority (week 8+ ongoing)
- 5–6 comparison pages (`/compare/*`) — factual tables, pricing transparency angle. Use seo-competitor-pages skill.
- Weekly threat brief (India + global) drafted from pipeline data, human-edited, `BlogPosting` schema, RSS feed.
- India cluster: CERT-In advisory summaries, DPDP/RBI threat-intel guides.
- Link building: list feeds/tools on awesome-threat-intelligence, MISP communities, r/blueteamsec, Product Hunt; publish one original data report per quarter (e.g. "KEV time-to-exploit in India-hosted infra").
- Threat-actor / malware programmatic pages only after CVE pages prove the quality-gate model.

## 7. KPIs

| Metric | Baseline | 3 mo | 6 mo | 12 mo |
|---|---|---|---|---|
| Indexed pages (GSC) | ~1 | 60+ | 2,000+ | 10,000+ |
| Indexed / submitted ratio | — | >80% | >60% | >60% |
| Organic clicks / month | ~0 | 300 | 3,000 | 15,000 |
| Keywords in top 10 | 0 | 10 (long-tail) | 100 | 500 |
| Organic signups / month | 0 | 5 | 40 | 150 |
| CWV (landing, field) | unknown | all "good" | good | good |
Targets are planning estimates, not forecasts; recalibrate after first 8 weeks of GSC data.

## 8. Prerequisites & owner decisions (answered 2026-09-22)

1. **VPS stability first** — done in S146 (ES/Neo4j healthy). Port hardening is on the same branch as Phase 1. Phase 3 (public unauthenticated routes) still needs an adversarial review before push.
2. api-gateway (Tier 1 frozen) **may take additive public routes** for Phase 3.1/3.2 — approved.
3. UI-frozen frontend **may take new marketing pages** (additive) — approved. LandingPage.tsx itself stays design-locked.
4. AI crawlers — **block all** (see §3).
5. Pricing page — **INR only**. Note: plan prices differ between docs (₹9,999/18,999/49,999) and `PlanCards.tsx` (₹7,999/14,999/39,999); settle the real numbers before building `/pricing` or adding priced Offers to JSON-LD (today only the free tier is in JSON-LD).
