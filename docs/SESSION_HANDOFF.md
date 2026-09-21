# SESSION HANDOFF DOCUMENT
**Date:** 2026-09-22
**Session:** 146
**Session Summary:** Project review + SEO research/plan. VPS stabilised (ES/Neo4j memory fix deployed, 32/32 healthy). Found and fixed the test that kept CI red since June. VPS hardening + SEO Phase 1 are committed on a feature branch and NOT yet deployed.

## ✅ Changes Made
| Commit | Branch | Files | Description |
|--------|--------|-------|-------------|
| a22aa9e | master (pushed, **live on VPS**) | 2 | ES 1G→2G, Neo4j 768M→2G + heap 512m/768m + pagecache 512m, Neo4j tmpfs /tmp, dhanradar Prometheus job brought into git |
| 0a210fb | feat/vps-hardening-seo-phase1 | 1 | Pin clock in offboarding purge-countdown test — **this is what unblocks CI** |
| 2ac97a5 | feat/vps-hardening-seo-phase1 | 2 | All 33 published ports → `127.0.0.1:`; outer nginx security headers + `X-Robots-Tag: noindex` on api/grafana/health/ready/ws |
| cfce906 | feat/vps-hardening-seo-phase1 | 7 | SEO Phase 1: robots.txt, sitemap.xml, og-image.png, index.html meta + JSON-LD, apps/frontend/nginx.conf (true 404 + noindex), Dockerfile.frontend COPY, App.tsx lazy routes |
| (this commit) | feat/vps-hardening-seo-phase1 | docs | SEO_PLAN.md + session-end docs |

## 📁 Files / Documents Affected
**New:** `docs/SEO_PLAN.md`, `apps/frontend/nginx.conf`, `apps/frontend/public/robots.txt`, `apps/frontend/public/sitemap.xml`, `apps/frontend/public/brand/og-image.png`

**Modified:** `docker-compose.etip.yml`, `docker/prometheus/prometheus.yml`, `docker/nginx/conf.d/default.conf`, `Dockerfile.frontend`, `apps/frontend/index.html`, `apps/frontend/src/App.tsx`, `apps/frontend/src/__tests__/offboarding-panel.test.tsx`, `docs/PROJECT_STATE.md`, `docs/DEPLOYMENT_RCA.md`, `docs/ETIP_Project_Stats.html`

**Outside the repo (global Claude skills):** installed `~/.claude/skills/full-output-enforcement`; added section 5 "Marketing and landing pages" to `~/.claude/skills/ui-design-workflow/SKILL.md` (adapted from leonxlnx/taste-skill, MIT).

**Untracked, deliberately not committed:** 6 strategy/test `.docx` files in docs/, `scripts/generate-ioc-test-plan.py`, `setup-breakglass.sh` (check for secrets first), `.claude/settings.json` local edits.

## 🔧 Decisions & Rationale
No DECISION-NNN entry. Owner decisions recorded for the SEO work (see docs/SEO_PLAN.md §8):
- api-gateway (Tier 1) may take **additive public routes** for CVE pages / free tools.
- UI-frozen frontend may take **new marketing pages** (additive).
- **All AI crawlers blocked** in robots.txt (training, search and assistant fetchers). llms.txt therefore skipped.
- Pricing page: **INR only**.
- Rendering strategy: build-time prerender of public routes + server-rendered HTML from Fastify for programmatic pages; no framework migration.
- Hardening: loopback port binding instead of ufw — Docker bypasses ufw for published ports, and with loopback binding only sshd:22 (key-only) listens publicly.

## 🧪 E2E / Deploy Verification Results
```
Before:  etip_elasticsearch unhealthy  restarts=353     oomkilled=true  limit=1G
         etip_neo4j         unhealthy  restarts=404378                  limit=768M
         etip_es_indexing   unhealthy
After:   etip_elasticsearch healthy    restarts=0   mem 1.25G / 2G
         etip_neo4j         healthy    restarts=0   mem 1.05G / 2G
         etip_es_indexing, etip_threat_graph restarted → healthy
         `docker ps | grep etip_ | grep -v healthy` → empty (32/32)
Host:    disk 60G/193G (32%), RAM 15G total, ~3G available after the change
VPS git: fd750ce → a22aa9e (fast-forward, by hand). Backup: /root/backup-20260922
External port scan (IPv4): only 22 open; 3001/5433/6380/9201/7475/7688/9001/9190/3101/8080 closed at provider edge
CI:      run 35647503124 on a22aa9e FAILED at "Run tests" — frontend offboarding-panel test (1 of 1,787). Fix is 0a210fb.
Local:   vite build OK — landing entry chunk 263.6 kB (84.3 kB gzip); tsc clean outside pre-existing test-file type errors
NOT verified: apps/frontend/nginx.conf and outer nginx edits have never been loaded by a real nginx.
```

## ⚠️ Open Items / Next Steps
**Immediate**
1. Push branch + PR → CI must go green on the branch (proves 0a210fb). Then merge to master → auto-deploy.
2. Right after deploy, on the VPS: `docker exec etip_nginx nginx -t`, `docker exec etip_frontend nginx -t`, then the curl grid:
   - `/robots.txt` → 200 `text/plain`; `/sitemap.xml` → 200 xml
   - `/definitely-not-a-page` → **404**; `/llms.txt` → 404
   - `/dashboard`, `/login` → 200 with `X-Robots-Tag: noindex, nofollow`
   - `/` → 200, no X-Robots-Tag, security headers present
   - `/api/v1/...` → `X-Robots-Tag: noindex, nofollow`
   - `ss -tlnp | grep -v 127.0.0.1` on VPS → only sshd
   - https://intelwatch.in loads through the tunnel (cloudflared → `localhost:8080`, now IPv4 loopback only)
3. Rollback if needed: local `git reset --hard safe-point-2026-09-22-vps-seo`; VPS `cp /root/backup-20260922/* ` back + `docker compose -p etip -f docker-compose.etip.yml up -d`.
4. Off-repo: Google Search Console + Bing Webmaster verification, submit sitemap, Cloudflare www→apex redirect, check Cloudflare AI-bot / managed robots.txt settings.

**Deferred**
- Self-hosted fonts (SEO plan 1.3) — not done; Google Fonts still render-blocking.
- ufw — skipped on purpose (see decisions). Disk-usage alert — needs a notification channel.
- Compose Grafana password default fallback; GitHub Actions v4→v5 bump; 26 test files with literal dates.
- SEO Phases 2–4 (docs/SEO_PLAN.md). Phase 3 adds unauthenticated routes → adversarial review before push.

## 🔁 How to Resume
```
/session-start
Working on: infra + frontend (SEO Phase 1 deploy). Branch feat/vps-hardening-seo-phase1.
Do not modify: backend services, shared-* packages.
Task: get CI green on the branch, merge to master, watch deploy, run the verification grid
in docs/SESSION_HANDOFF.md, then start SEO Phase 2 per docs/SEO_PLAN.md.
Note: use `env -u GH_TOKEN gh ...` and `env -u GH_TOKEN git push` — the GH_TOKEN env var in this shell is invalid.
```

## Agent utilization
- Opus (main, Fable 5.1): review, SEO plan, VPS diagnosis + manual deploy, all code edits (small, hot-cache), session docs.
- Sonnet: 4 research/analysis subagents — competitor SEO scan · keyword research · SPA technical SEO · taste-skill gap inventory — reworked: N (all four).
- Haiku: n/a — no bulk sweeps needed.
- codex:rescue: n/a — not run. 2ac97a5 is security-adjacent (port binding, headers); it is a restriction-only change, but get a Sonnet/codex adversarial pass before merging to master.
