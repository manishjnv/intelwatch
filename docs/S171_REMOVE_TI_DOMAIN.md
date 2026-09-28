# S171 — Remove decommissioned `ti.intelwatch.in` configuration

**Date:** 2026-09-28 · **Session:** 171 · **Owner request:** "ti.intelwatch.in is decommissioned, remove config related to it everywhere — only ti.intelwatch.in"

ETIP moved from `ti.intelwatch.in` to `intelwatch.in` (Cloudflare Tunnel → `etip_nginx`). Leftover references pointed tooling and scripts at a dead host, and the sign-up CAPTCHA widget was still bound only to the old hostname.

## Changes
| Where | Change |
|---|---|
| Cloudflare Turnstile widget "ETIP Widget" | Hostnames `["ti.intelwatch.in"]` → `["intelwatch.in"]` (this was the root cause of the sign-up CAPTCHA error 110200 — see RCA #50 follow-up) |
| `infrastructure/nginx/ti.intelwatch.in` | Deleted — legacy host-nginx server block; the VPS has no host nginx |
| `infrastructure/scripts/vps-setup.sh` | Removed the host-nginx step for `ti`; next-steps now verify `https://intelwatch.in/health` via the tunnel (TLS at Cloudflare, no certbot) |
| `Makefile` | `PROD_URL` → `https://intelwatch.in` |
| `scripts/activate-global-processing.sh`, `scripts/generate-sdk.sh`, `scripts/session81-vps-activate.sh` | URLs → `intelwatch.in` |
| `CLAUDE.md` | Dropped the "migrated from ti.intelwatch.in" note |

## Verified already clean (no change needed)
Cloudflare DNS (0 records for `ti.intelwatch.in`), Cloudflare Tunnel ingress (no `ti` hostnames), VPS `/opt/intelwatch/.env`, `/etc/cloudflared/config.yml`, host nginx / certbot (none), UptimeRobot monitors (intelwatch.in only), `docs/` (0 mentions).

## Verify
- `grep -rn "ti\.intelwatch\.in" .` (excluding `node_modules`) → no matches.
- `/register` in a fresh browser: the CAPTCHA widget loads and completes (no 110200).

## Rollback
`git revert <commit>`; re-adding a Turnstile hostname is a dashboard/API change.
