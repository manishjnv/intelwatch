# S147 — P1: VPS Hardening + SEO Phase 1 + CI Unblock

**Date:** 2026-09-23 · **PR:** #20 (`feat/vps-hardening-seo-phase1` → `master`)
**Status:** ✅ **Deployed and verified 2026-09-23.** Merged as `9d7bf50`; CI/CD run 35779554466 green (test → images → deploy).
**Rollback tag:** `safe-point-2026-09-22-vps-seo` · VPS file backup: `/root/backup-20260922`

## 1. What ships

| Commit | Type | Files | Summary |
|---|---|---|---|
| `0a210fb` | fix (CI) | `apps/frontend/src/__tests__/offboarding-panel.test.tsx` | Pins the clock in the purge-countdown test. It had a hardcoded date and kept master CI red from June. **Merging this makes master deployable again.** |
| `2ac97a5` | fix (security) | `docker-compose.etip.yml`, `docker/nginx/conf.d/default.conf` | Binds all 33 published ports to `127.0.0.1` and adds security headers and `X-Robots-Tag` on non-page routes |
| `cfce906` | feat (SEO) | `apps/frontend/{index.html, nginx.conf, public/*, src/App.tsx}`, `Dockerfile.frontend` | robots.txt, sitemap.xml, true 404s, noindex on SPA routes, canonical/OG/Twitter/JSON-LD, lazy-loaded routes |
| `4529104` | docs | `docs/*` | S146 session-end docs |

### 1.1 Port binding (`docker-compose.etip.yml`)
Every `ports:` entry changes from `"HOST:CONTAINER"` to `"127.0.0.1:HOST:CONTAINER"`:

- Data stores: postgres 5433, redis 6380, elasticsearch 9201, neo4j 7475/7688, minio 9001/9002
- Observability: prometheus 9190, grafana 3101
- App services: 3001, 3005–3025 (all 22 backend services)
- Edge: etip_nginx 8080 (HTTP) and 8443 (HTTPS)

**Why it's safe:** public traffic reaches the host only through systemd `cloudflared` → `localhost:8080`. Loopback still reaches the nginx port. Services talk to each other over the Docker network by container name, not through published ports, so they are unaffected. The only service listening publicly after this change should be `sshd:22` (key-only).

**Why it matters:** before this change, Docker published these ports on `0.0.0.0` and bypassed the host firewall. That included the IPv6 address, which the Hostinger edge filter does not cover.

### 1.2 Outer nginx headers (`docker/nginx/conf.d/default.conf`)
- `map $request_uri $etip_robots_tag`: `/api`, `/grafana`, `/health`, `/ready`, `/ws` → `noindex, nofollow`
- Server-level `add_header … always`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Robots-Tag`
- Constraint: nginx only inherits `add_header` into a `location` block that has no `add_header` of its own. The config has none today. **If you ever add `add_header` inside a location, copy the security headers into it too.**

### 1.3 Frontend SEO (`apps/frontend`)
- `public/robots.txt`: disallows `/api/` and blocks every AI crawler (owner decision, S146). No `llms.txt`.
- `public/sitemap.xml`: static public pages only.
- `public/og-image.png` (1200×630). `index.html` now has absolute OG/Twitter tags, a canonical URL, and Organization, WebSite and SoftwareApplication JSON-LD. Only the free tier is in Offers until pricing is settled.
- `nginx.conf` (new file, replaces the inline conf in `Dockerfile.frontend`):
  - A `map` lists the known SPA prefixes. Those routes serve `index.html` with 200 and `X-Robots-Tag: noindex, nofollow`.
  - Any unknown path gets `return 404`, then `error_page 404 /index.html`. With no `=`, nginx keeps the **404 status** and serves the SPA shell as the body, so `NotFoundPage` still renders.
  - `index.html` is served with `no-cache`, and `/assets/` with a 1-year immutable cache.
  - **Maintenance rule:** the prefix list must match `App.tsx` routes. A new private route missing from the list will return 404.
- `App.tsx`: every non-landing route is lazy-loaded. The landing entry chunk is now 264 kB (84 kB gzip).

## 2. Review (S147, Opus)
| Item | Verdict | Notes |
|---|---|---|
| Port binding | ACCEPT | Uniform and mechanical. It hardens the setup, so it has no adversarial exposure. The functional risk is the tunnel path, which grid row 7 checks |
| Outer nginx headers | ACCEPT | See the `add_header` inheritance constraint in §1.2 |
| Frontend nginx.conf | ACCEPT | Traced `error_page` semantics. Unknown routes get 404 plus the shell; SPA routes get 200 plus noindex |
| CI | PASS | PR run 35648974471 green in 4m43s |
| Adversarial sign-off | Note only | This is a hardening-direction change and adds no new attack surface, so it was scaled down per the playbook. SEO Phase 3 (new unauthenticated routes) will need the full adversarial review |

**Verified at deploy (§4):** both nginx configs pass `nginx -t` on the VPS. They were first loaded there, because the local docker test was declined in S146.

## 3. Deploy and verify
1. Merge PR #20. The push to master triggers `deploy.yml`, which runs tests and then deploys to the VPS. Watch the run: `env -u GH_TOKEN gh run watch`.
2. On the VPS:
   ```bash
   docker exec etip_nginx nginx -t
   docker exec etip_frontend nginx -t
   docker ps --filter name=etip_ --format '{{.Names}} {{.Status}}' | grep -vc healthy   # expect 0
   ss -tlnp | grep -v 127.0.0.1                                                         # expect only sshd
   ```
3. Run the curl grid against `https://intelwatch.in`:

| # | Request | Expected |
|---|---|---|
| 1 | `/robots.txt` | 200, `text/plain` |
| 2 | `/sitemap.xml` | 200, xml |
| 3 | `/definitely-not-a-page` | **404** (SPA body) |
| 4 | `/llms.txt` | 404 |
| 5 | `/dashboard`, `/login` | 200 with `X-Robots-Tag: noindex, nofollow` |
| 6 | `/` | 200, no X-Robots-Tag, security headers present |
| 7 | `/api/v1/health` (or any `/api/` path) | `X-Robots-Tag: noindex, nofollow` |
| 8 | Browser load of the site | Loads through the tunnel, login works |

4. **Rollback:** on the VPS, `git reset --hard safe-point-2026-09-22-vps-seo`, restore from `/root/backup-20260922`, then `docker compose -p etip -f docker-compose.etip.yml up -d`. For the repo, revert the merge commit.

## 4. Results (2026-09-23)
**Deploy:** PR #20 merged (`9d7bf50`), triggering run 35779554466: Test/Type-check/Lint/Audit ✅, Build & Push Images ✅, Deploy to VPS ✅. Master CI is green again for the first time since June. The VPS is on `9d7bf50`.

**VPS (read-only, via Cloudflare tunnel):**
| Check | Result |
|---|---|
| `docker exec etip_nginx nginx -t` | ✅ syntax ok, test successful. First real load of the new headers config |
| `docker exec etip_frontend nginx -t` | ✅ syntax ok, test successful. First real load of `apps/frontend/nginx.conf` |
| etip containers | ✅ **32/32 healthy**, 0 other |
| Non-loopback TCP listeners | ✅ only `sshd :22` (IPv4 + IPv6). `127.0.0.54:53` is the systemd-resolved stub on loopback. The 33 service ports are no longer reachable from outside |

**Live grid (`https://intelwatch.in`):**
| # | Request | Result |
|---|---|---|
| 1 | `/robots.txt` | ✅ 200 `text/plain` |
| 2 | `/sitemap.xml` | ✅ 200 `text/xml` |
| 3 | `/definitely-not-a-page` | ✅ **404** `text/html` |
| 4 | `/llms.txt` | ✅ 404 |
| 5 | `/dashboard`, `/login` | ✅ 200 + `X-Robots-Tag: noindex, nofollow` |
| 6 | `/` | ✅ 200, no X-Robots-Tag. `nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`, `HSTS max-age=31536000` and `Permissions-Policy` all present |
| 7 | `/health`, `/api/v1/health` | ✅ `noindex, nofollow` (the second is a 404 JSON; no such route, but the header applies) |

**New issues:** none. The rollback tag `safe-point-2026-09-22-vps-seo` is kept until (a) is verified.
