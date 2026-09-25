# S148 — intelwatch.in outage: etip_nginx left in `Created` (2026-09-23 → 2026-09-25)

**Type:** incident + fix · **Severity:** full outage (public site + API) · **Duration:** ~46 h
**RCA row:** docs/DEPLOYMENT_RCA.md → "Session 148"

## 1. What users saw
Every URL on https://intelwatch.in (landing, /pricing, /login, API) returned **502 Bad Gateway** from Cloudflare.

## 2. Timeline (UTC)
| Time | Event |
|---|---|
| 2026-09-23 06:43 | PR #30 (docs only) merged → CI/CD run 35828103888 |
| 2026-09-23 06:53 | "Deploy to VPS" step: `docker compose up -d` recreating all containers; SSH over the Cloudflare tunnel drops (`client_loop: send disconnect: Broken pipe`, exit 255). Compose is killed mid-run: 31 services started, `etip_nginx` created but never started |
| 2026-09-23 → 09-25 | Site 502. Run marked failed (red) but not noticed. Health-recovery cron fires every 5 min and fails with `Permission denied` |
| 2026-09-24 23:3x | Found during a status check (S148). `etip_nginx` started; site back (200 / API 401 unauthenticated) |

## 3. Root cause
1. **Trigger** — deploy SSH session drop mid-`compose up` (known class: RCA #6, S141b, S147c). nginx is last in dependency order, so it's the container most likely to be left un-started.
2. **Why it wasn't self-healed** — `scripts/health-recovery.sh` exists exactly for this (restarts `created`/`exited` etip containers, nginx last). It was committed with git mode **100644**. The deploy does `git reset --hard` on the VPS, so the file stays non-executable, and the crontab runs it directly → `ionice: failed to execute …: Permission denied`. ~20,000 failures in `/var/log/etip-health-recovery.log` ≈ broken for ~70 days (since the VPS migration).
3. **Why nobody noticed** — failed deploy runs only show red in GitHub Actions; there is no external uptime alert.

## 4. Fix applied
| Where | Change |
|---|---|
| VPS (manual, live) | `docker compose -f docker-compose.etip.yml up -d etip_nginx` → `nginx -t` ok, site 200 |
| VPS (manual, live) | `chmod +x scripts/health-recovery.sh scripts/docker-cleanup.sh`; ran recovery script once → exit 0 |
| git | `git update-index --chmod=+x` on both scripts → mode **100755**, so future `git reset --hard` deploys keep them executable |

## 5. How to verify
```bash
ssh intelwatch 'ls -l /opt/intelwatch/scripts/health-recovery.sh'      # -rwxr-xr-x
ssh intelwatch 'tail -3 /var/log/etip-health-recovery.log'             # no new "Permission denied"
ssh intelwatch 'docker ps -a --filter name=etip_ --filter status=created --filter status=exited'  # empty
curl -s -o /dev/null -w '%{http_code}\n' https://intelwatch.in/         # 200
```
Drill (optional): `docker stop etip_nginx` → within 5 min the cron should bring it back.

## 6. Rollback
Mode change only — `git update-index --chmod=-x scripts/health-recovery.sh scripts/docker-cleanup.sh` (not recommended).

## 7. Follow-ups (not done here)
1. **External uptime alert** (e.g. free UptimeRobot / Cloudflare health check on `/` → email). The single biggest gap: a 46 h outage went unseen.
2. **Deploy resilience** — run the VPS side of the deploy under `nohup`/`setsid` (or a script on the VPS) so an SSH drop can't kill `compose up` halfway; add `ServerAliveInterval` to the Actions SSH.
3. **Docker cleanup cron is not installed** on the KVM4 VPS (memory/docs claim a daily one). Disk at 22 % — low urgency.
4. Commit every `*.sh` with the exec bit; other scripts in `scripts/` are still 100644 (run via `bash …`, so harmless today).
