# Step 1 — Stay up: outside alert, safer deploy, cron jobs

**Roadmap:** docs/ROADMAP_S149_PLUS.md §3 step 1, §4 S149 · **Module:** ops (`.github/workflows/`, `scripts/`) · **Size:** M (1 session + owner setup)
**Status:** implemented on branch `claude/step1-stay-up` 2026-09-26 (S150), pending deploy. Written 2026-09-25. All claims checked against the repo on that date. VPS state (crontab, file modes) cannot be read from the repo — those items say "verify on VPS".
**Deploy doc:** `docs/S150_STEP1_STAY_UP.md` — what changed per file, how to verify, rollback.

---

## 1. Goal

1. The owner gets an **email/Telegram alert within 5 minutes** when intelwatch.in or its API is down.
2. A dropped SSH connection during deploy **cannot leave containers half-started**.
3. The known Cloudflare-tunnel SSH flake (`websocket: bad handshake`) is **retried automatically**.
4. The **health-recovery** (every 5 min) and **docker-cleanup** (daily) cron jobs are installed from git and actually run.

## 2. Why now

- S148: the site was down **~46 h** and nobody noticed (docs/S148_NGINX_OUTAGE.md §2–3).
- The cause class (SSH drop mid-deploy) has happened at least 5 times: RCA #6, #43, S78, S141b, S147c, S148 (docs/DEPLOYMENT_RCA.md lines 46, 664, 662, 727, 733, 734).
- Nothing else in the roadmap matters while the site can silently stay down.

## 3. Current state (verified)

| Area | Today | File / line |
|---|---|---|
| Outside uptime alert | **None.** No UptimeRobot/Cloudflare check in repo or docs. Failed CI runs only show red in GitHub | S148 doc §3 point 3 |
| Public health URL | `https://intelwatch.in/health` → nginx `location /health` → `etip_api:3001/health` → `{"status":"ok",...}` | `docker/nginx/conf.d/default.conf` line 124; `apps/api-gateway/src/routes/health.ts` line 8 |
| `/api/v1/health` | **Does not exist.** The gateway registers `/health` and `/ready` with no prefix (`app.ts` line 123). `/api/v1/health` falls to nginx `location /api/` → gateway → 404 `NOT_FOUND` (error-handler line 36). **Monitor `/health`, not `/api/v1/health`** | `apps/api-gateway/src/app.ts` 123; `apps/api-gateway/src/plugins/error-handler.ts` 35–36 |
| Side finding | The frontend calls `fetch('/api/v1/health')` and on a non-2xx result **seeds a fake demo session** (`demo-token`, `analyst@demo.local`). Since that route 404s, this path may fire for every logged-out visit to a protected page. Belongs to Step 5 (honest UI) — logged here so it is not lost | `apps/frontend/src/components/layout/ProtectedRoute.tsx` lines 18–33 |
| Deploy SSH | `ssh vps << 'DEPLOY_SCRIPT'` — whole deploy runs as a heredoc in one SSH session. If SSH drops, the remote shell gets SIGHUP and dies mid-`compose up` | `.github/workflows/deploy.yml` lines 143–307 |
| SSH keepalive | **None.** `~/.ssh/config` has HostName, User, IdentityFile, StrictHostKeyChecking, ProxyCommand only | `deploy.yml` lines 134–141 |
| Retry | **None.** Timeout 10 min, one attempt. Past fix was a manual `gh run rerun --failed` | `deploy.yml` line 144; RCA S141b, S147c |
| Final compose check | **None.** After health checks there is no second `up -d` and no check for `Created`/`Exited` containers | `deploy.yml` lines 264–303 |
| Why nginx is the victim | `etip_nginx` `depends_on` **25 services with `condition: service_healthy`**, so it is always started last | `docker-compose.etip.yml` lines 1265–1318 |
| nginx healthcheck | `nginx -t` (config test only, not "is it serving") | `docker-compose.etip.yml` line 1319 |
| End-of-deploy cleanup | `docker ps -a --filter status=created --filter status=exited ... | xargs docker rm -f` — **deletes** any exited etip container. A deleted container is invisible to health-recovery (it only looks at `docker ps -a`) | `deploy.yml` lines 301–302; `scripts/health-recovery.sh` line 19 |
| workflow_dispatch inputs | `action` (deploy/status/migrate/command) and `command` are **never read**. Any manual dispatch does a full deploy | `deploy.yml` lines 15–29; `grep inputs. deploy.yml` → nothing |
| Concurrency | No `concurrency:` key (fixed in Step 0) | — |
| health-recovery.sh | Exists, restarts `created`/`exited` `etip_*` containers, nginx last. Git mode now **100755** | `scripts/health-recovery.sh`; `git ls-files -s` → 100755 |
| Its cron line | Only in the script header comment. **Not installed from git.** The live crontab uses `ionice` (from the S148 error text) — exact line unknown. Verify on VPS | `health-recovery.sh` line 6 |
| health-recovery gaps | Does not catch `unhealthy` or `restarting` containers, only `created`/`exited`. No alert when it acts | `health-recovery.sh` lines 19, 58–64 |
| docker-cleanup.sh | Exists, mode 100755. Prunes build cache + images older than 48 h. Install hint: copy to `/etc/cron.daily/`. **Not installed on the KVM4 VPS** (S148 doc §7 item 3) | `scripts/docker-cleanup.sh` lines 1–20 |
| Other scripts | Still 100644: `activate-global-processing.sh`, `generate-sdk.sh`, `seed-feeds.sh`, `seed-free-tier-feeds.sh`, `session81-vps-activate.sh`, `setup-cloudflare-tunnel.sh` (run via `bash`, harmless) | `git ls-files -s scripts/*.sh` |
| Session access to VPS | Claude sessions cannot SSH (`validate-command.mjs` blocks `ssh root@` and `scp`). VPS checks go through `gh workflow run vps-cmd.yml -f cmd="..."` or the owner | `.claude/hooks/validate-command.mjs`; `.github/workflows/vps-cmd.yml` |

## 4. Flow

### 4a. Outside alert

```
UptimeRobot (every 5 min, from outside)
   ├── GET https://intelwatch.in/          expect 200
   ├── GET https://intelwatch.in/health    expect 200 + keyword "ok"
   └── GET https://intelwatch.in/login     expect 200
          │ 2 failures in a row
          ▼
   email to owner  +  Telegram bot message
```

### 4b. New deploy (VPS side detached)

```
GitHub runner                                   VPS (/opt/intelwatch)
─────────────                                   ─────────────────────
ssh_retry: git fetch + reset --hard  ─────────▶ code updated (short SSH, retried)
ssh_retry: write /opt/intelwatch/.deploy.env ─▶ GHCR token, owner, sha (mode 600)
ssh_retry: launch  ───────────────────────────▶ setsid nohup flock -n /var/lock/etip-deploy.lock
                                                   bash scripts/deploy-vps.sh <sha>
                                                   > /var/log/etip-deploy/<sha>.log 2>&1 &
  (SSH closes at once — nothing to kill)          │ pull images → infra up → app up
                                                  │ db push → caddy restart → health checks
                                                  │ compose up -d  (2nd pass, no recreate)
                                                  │ assert: no etip_* Created/Exited
                                                  └ writes /var/log/etip-deploy/<sha>.status = ok|fail
loop every 15 s (max 12 min):
ssh_retry: cat <sha>.status + tail log  ◀─────────
   ok   → job green
   fail → print log, job red
```

## 5. Changes

### Backend
None.

### Infra

| File | Change |
|---|---|
| `scripts/deploy-vps.sh` (new, 100755) | The body of today's `DEPLOY_SCRIPT` heredoc (deploy.yml lines 147–306), moved to a file. Reads `GHCR_TOKEN`, `GHCR_OWNER`, `ANTHROPIC_KEY`, `AI_ENABLED` from `/opt/intelwatch/.deploy.env` (then deletes it). `set -euo pipefail`. Writes `.status` file on exit via `trap`. **Adds at the end:** (1) `docker compose -p etip -f docker-compose.etip.yml up -d` — second pass, no `--force-recreate`, starts anything left `Created`; (2) check `docker ps -a --filter name=etip_ --filter status=created --filter status=exited` is empty, else `fail`; (3) `curl -sf http://127.0.0.1:8080/health` once more. **Changes:** the end-of-deploy cleanup keeps removing only hash-prefixed orphans (`grep '_etip_'`, RCA #41), not every exited container |
| `.github/workflows/deploy.yml` | (1) SSH config: add `ServerAliveInterval 15`, `ServerAliveCountMax 4`, `ConnectTimeout 30`. (2) Add a shell function `ssh_retry` (3 tries, 10/20/30 s backoff; retries only on exit 255, which covers `websocket: bad handshake` and `Broken pipe`). (3) Replace the big heredoc with 4 short SSH steps from §4b. (4) `timeout-minutes: 15`. (5) Pass secrets as env, not inline `${{ }}` inside the remote script. (6) Either wire `inputs.action` (status/migrate/command) or delete the unused inputs — recommend delete; `vps-cmd.yml` already covers "command" |
| `.github/workflows/vps-cmd.yml` | Same SSH keepalive options + `ssh_retry` |
| `scripts/etip-cron` (new, 0644, cron.d format) | `*/5 * * * * root ionice -c3 bash /opt/intelwatch/scripts/health-recovery.sh >> /var/log/etip-health-recovery.log 2>&1` and `17 3 * * * root bash /opt/intelwatch/scripts/docker-cleanup.sh >> /var/log/etip-docker-cleanup.log 2>&1`. Calling via `bash` means a lost exec bit can never break it again |
| `scripts/install-cron.sh` (new, 100755) | Idempotent: `install -m 0644 -o root scripts/etip-cron /etc/cron.d/etip`; remove the old `health-recovery` line from root's crontab if present (avoid double runs); add `/etc/logrotate.d/etip` for the two logs. `deploy-vps.sh` calls it every deploy, so the VPS always matches git |
| `scripts/health-recovery.sh` | Also treat `unhealthy` containers older than 10 min as down (`docker ps --filter health=unhealthy`) → `docker restart`. Optional: send a Telegram message when it acts (env `TI_ALERT_TELEGRAM_BOT_TOKEN`, `TI_ALERT_TELEGRAM_CHAT_ID` from `.env`; skip silently if unset) |
| `scripts/*.sh` (6 files at 100644) | `git update-index --chmod=+x` for consistency (S148 follow-up 4) |
| `docs/runbooks/UPTIME_ALERTS.md` (new) | Owner setup steps below + what to do when an alert fires |

### Frontend
None. (The `ProtectedRoute` demo-session finding goes to Step 5.)

### Owner setup (not code — 20 minutes)

1. **Telegram:** open @BotFather → `/newbot` → save token. Send the bot a message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `chat.id`.
2. **UptimeRobot (free plan):** create 3 HTTP(s) monitors, 5-min interval: `https://intelwatch.in/`, `https://intelwatch.in/health` (keyword monitor, keyword `"ok"`), `https://intelwatch.in/login`. Alert contacts: your email; add Telegram if your plan offers it (check at signup — if not, email only, or use the GitHub fallback below).
3. **Cloudflare health checks** are an alternative. Standalone Health Checks need a paid Cloudflare plan — check your plan before choosing it.
4. **GitHub:** Settings → Notifications → Actions → "Send notifications for failed workflows only" → email on. A red deploy is then an email, not just a red dot.
5. Optional fallback (free, no third party): a `.github/workflows/uptime.yml` on `schedule: '*/10 * * * *'` that curls the 3 URLs and posts to Telegram on failure. GitHub cron can be delayed by several minutes, so use it only as a second line.

## 6. Data model

None.

## 7. Tests

| Test | How | Expected |
|---|---|---|
| Script syntax | `bash -n scripts/deploy-vps.sh scripts/install-cron.sh scripts/health-recovery.sh` | exit 0 |
| Lint | `shellcheck scripts/deploy-vps.sh scripts/install-cron.sh scripts/health-recovery.sh` (if installed) | no errors |
| Exec bits | `git ls-files -s scripts/*.sh` | all `100755` |
| Workflow YAML | `actionlint .github/workflows/*.yml` (if installed) or push to a branch and see the PR test run parse it | no errors |
| SSH drop drill | During a manual `gh workflow run deploy.yml`, cancel the run after the "launch" step | VPS deploy still finishes; `.status` = ok; all containers `Up` |
| Retry | Temporarily point `HostName` at a wrong host on a branch run | 3 attempts logged, then fail |
| Recovery drill | Owner: `docker stop etip_nginx` | back within 5 min; line in `/var/log/etip-health-recovery.log` |
| Alert drill | UptimeRobot "pause/resume" or stop `etip_nginx` for 12 min | email (+ Telegram) within ~10 min, "up" message after recovery |

## 8. Acceptance checks

From a dev machine (no SSH needed):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://intelwatch.in/          # 200
curl -s https://intelwatch.in/health | grep -q '"status":"ok"' && echo ok
curl -s -o /dev/null -w '%{http_code}\n' https://intelwatch.in/api/v1/health   # 404 (expected; do not monitor this)
grep -n "ServerAliveInterval" .github/workflows/deploy.yml .github/workflows/vps-cmd.yml
grep -n "ssh_retry" .github/workflows/deploy.yml | head
grep -n "up -d$\|status=created" scripts/deploy-vps.sh
git ls-files -s scripts/*.sh                                              # all 100755
```

On the VPS (owner via SSH, or `gh workflow run vps-cmd.yml -f cmd="..."`):

```bash
ls -l /opt/intelwatch/scripts/health-recovery.sh     # -rwxr-xr-x
cat /etc/cron.d/etip                                 # 2 lines
crontab -l | grep -c health-recovery                 # 0 (moved to /etc/cron.d)
tail -3 /var/log/etip-health-recovery.log            # no "Permission denied"
ls -lt /var/log/etip-deploy/ | head -3               # latest <sha>.log + .status
docker ps -a --filter name=etip_ --filter status=created --filter status=exited   # empty
df -h /                                              # note disk %; re-check after first cleanup run
```

In UptimeRobot: 3 monitors green. In Telegram: test message received.

## 9. Rollback

- Tag first: `git tag safe-point-2026-09-xx-step1-stay-up`.
- Deploy flow: `git revert <sha>` restores the heredoc deploy. `scripts/deploy-vps.sh` can stay unused.
- Cron: `rm /etc/cron.d/etip` on the VPS and restore the old root crontab line (save it first: `crontab -l > /root/crontab.before-step1`).
- UptimeRobot: pause monitors. No effect on the app.

## 10. Session breakdown

| Session | Module | Work | Size |
|---|---|---|---|
| S149a | ops: `scripts/` | `deploy-vps.sh`, `etip-cron`, `install-cron.sh`, health-recovery unhealthy check, chmod the 6 scripts, runbook | M |
| S149b | ops: `.github/workflows/` | keepalive, `ssh_retry`, detached launch + poll, second-pass check, remove unused dispatch inputs | M |
| owner | — | UptimeRobot + Telegram + GitHub failed-run email (§5 owner setup). Can be done **today**, before any code | — |

S149a and S149b are the same "ops" area but different files. Merge S149a first (the workflow in S149b calls the script). If the owner prefers one PR, it is 6–7 files — use plan mode.

## 11. Owner decisions needed

1. UptimeRobot (free, outside) or Cloudflare health check (may need a paid plan) — recommend UptimeRobot.
2. Telegram bot, email, or both.
3. OK that manual `workflow_dispatch` options `status/migrate/command` are removed (they do nothing today)?
4. Should health-recovery also **restart unhealthy** containers (not just start stopped ones)? Recommend yes, with a 10-min grace.
5. Keep the post-deploy `docker rm -f` of all exited etip containers, or limit it to hash-prefixed orphans? Recommend limit.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Detached deploy hides errors | The poll step prints the log tail and fails the job on `fail` or timeout |
| Two deploys at once on the VPS | `flock -n /var/lock/etip-deploy.lock` + GitHub `concurrency` (Step 0) |
| Retry re-runs a non-idempotent step | Only the short steps are retried; each is safe to repeat. The launch step checks the lock and the `<sha>.status` file first |
| GHCR token written to disk | File mode 600, deleted by the script right after `docker login` |
| `GITHUB_TOKEN` expires when the job ends | The job keeps polling until the deploy finishes, so the pull happens while it is valid. Prefer the `GHCR_TOKEN` secret (already supported, line 171) |
| `docker image prune -a --filter until=48h` removes old images | No rollback image exists today anyway (only `:latest`). Rollback = revert + redeploy. See "later" below |

---

## 13. Later (after step 1 is green) — backups and failover

### What exists today (verified)

| Store | Backup today | Evidence |
|---|---|---|
| Postgres (`etip_postgres_data`) | **None found.** No `pg_dump` in any script, workflow or cron file in the repo | `grep -r pg_dump` → no hits |
| Neo4j (`etip_neo4j_data`) | **None found** | `grep -r neo4j-admin` → no hits |
| Elasticsearch (`etip_elasticsearch_data`) | **None.** No `path.repo`, no snapshot repo | `docker-compose.etip.yml` lines 69–100 |
| MinIO (`etip_minio_data`) | **None** | — |
| Redis (`etip_redis_data`) | AOF on (`--appendonly yes`), only on the same disk | compose lines 43–49 |
| admin-service "backups" | **UI only.** `BackupStore` is an in-memory `Map` of records; it never runs a dump | `apps/admin-service/src/services/backup-store.ts` lines 53–57 |
| VPS | `/root/backup-20260922` = copies of pre-change files from S146, not data | PROJECT_STATE.md line 278 |
| Hostinger snapshots | Unknown — owner to check hPanel | — |

**Everything lives on one NVMe disk in one VPS. A disk loss or a bad `prisma db push --accept-data-loss` (deploy.yml line 197) is not recoverable today.**

### Plan

| Store | Method | Schedule | Keep |
|---|---|---|---|
| Postgres | `docker exec etip_postgres pg_dump -U $TI_POSTGRES_USER -Fc etip > /var/backups/etip/pg-<date>.dump` | nightly 02:30 + **before every `prisma db push`** in `deploy-vps.sh` | 7 daily, 4 weekly |
| Redis | copy `appendonlydir` after `BGREWRITEAOF` | nightly | 7 |
| MinIO | `mc mirror` to off-site bucket | nightly | versioned bucket |
| Neo4j (Community) | `neo4j-admin database dump` needs the DB **stopped** in Community edition → 1–2 min stop at 03:00, or decide Neo4j is rebuildable from Postgres | nightly / weekly | 4 |
| Elasticsearch | Do not back up. Rebuild from Postgres with the Step 2 backfill job | — | — |
| Off-site | `rclone` to Cloudflare R2 or Backblaze B2, encrypted (`rclone crypt` or `age`) | after each dump | 30 days |

Files: `scripts/backup.sh`, `scripts/restore-drill.sh`, a line in `scripts/etip-cron`, `docs/runbooks/BACKUP_RESTORE.md`.

**Restore drill (monthly, 20 min):** start a throwaway `postgres:16-alpine` container, `pg_restore` the latest dump, compare row counts of `Tenant`, `User`, `Ioc`, `GlobalIoc`, `TenantSubscription` (prisma/schema.prisma lines 14, 64, 398, 787, 610) with production. Log the result in DEPLOYMENT_RCA.md. A backup that was never restored is not a backup.

✅ **First run 2026-09-26 (S150b): PASS.** 2.16 GB dump, `pg_restore -j 2` rc 0, 6m18s, all row counts matched or grew as expected. Runbook: `docs/runbooks/RESTORE_DRILL.md`. Off-site copy (rclone, VPS → owner machine) is still open — see the plan below.

### Failover options (owner choice, no work yet)

| Option | Cost | Recovery time | Notes |
|---|---|---|---|
| A. Off-site backups only (above) | ~₹0–500/month | hours (new VPS + restore) | Minimum. Do this first |
| B. Cold standby VPS (small, same compose, restores nightly dump) | one more VPS | ~30 min (switch Cloudflare tunnel) | Also a staging box |
| C. Managed Postgres (e.g. a hosted Postgres 16 with PITR) | monthly fee, latency from Mumbai VPS | minutes for DB | Only Postgres; Neo4j/Redis/MinIO still local |

Recommendation: A now, B when the first paying customer signs.

### Related finding for later

✅ Resolved in Step 0B (S149, U7): `noeviction`, maxmemory 1 GB, verified live 2026-09-26. Remaining: alert on `used_memory` → Step 8. (Was: `etip_redis` ran `--maxmemory 256mb --maxmemory-policy allkeys-lru`, risking silent eviction of BullMQ jobs and DECISION-027 Redis-JSON config stores.)
