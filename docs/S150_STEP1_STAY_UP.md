# S150 — Step 1 Stay Up (2026-09-26)

**Type:** hardening (not yet deployed) · **Branch:** `claude/step1-stay-up` · **Spec:** `docs/roadmap/STEP_01_STAY_UP.md` · **Result:** implemented, pending merge + deploy

## 1. Why

S148: the site was down ~46 h (2026-09-23 06:53 → 2026-09-25 ~05:10 IST) and nobody noticed. Root cause was an SSH drop mid-deploy leaving `etip_nginx` in `Created` state, and the safety net (`health-recovery.sh`, cron every 5 min) never ran because the script was committed with mode `100644` — cron failed silently with `Permission denied` ~20,000 times. The SSH-drop failure class itself has recurred at least 6 times (RCA #6, #43, S78, S141b, S147c, S148). Step 1 closes both gaps: an outside alert so a future outage is noticed within 5 minutes, and a deploy/cron design that can't silently fail the same way again.

## 2. What changed

### `scripts/deploy-vps.sh` (new, 100755, 275 lines)
The former `DEPLOY_SCRIPT` SSH heredoc, moved into a standalone script invoked as `deploy-vps.sh <sha>`, run **detached** on the VPS (`setsid nohup ... &`, GitHub Actions job polls a status file instead of holding the SSH session open for the whole deploy).

- `flock -n /var/lock/etip-deploy.lock` — refuses to run if another deploy holds the lock; writes `fail` and exits if so.
- `trap cleanup EXIT` writes `/var/log/etip-deploy/<sha>.status` = `ok` or `fail` on every exit path, and always removes `.deploy.env` + logs out of GHCR.
- Pulls pre-built images from GHCR, tags them locally.
- Pre-cleanup of stale orphan containers (RCA #41 pattern), then infra services up with no recreate.
- **Schema push, before app restart:** hashes `prisma/schema.prisma`; if unchanged, skips the push entirely. If changed: checks free disk on `/var/backups` (needs 2x the last dump size, or 5 GB if no prior dump), takes a `pg_dump -Fc` pre-deploy backup (`predeploy-<sha12>.dump`, mode 600, keeps newest 3), then runs `prisma db push` (retried up to 3 times). If the push output mentions data loss / `--accept-data-loss`, the deploy aborts immediately rather than forcing it. `--accept-data-loss` is never passed.
- Force-recreates all app containers, restarts Caddy, runs health checks for every service in parallel (critical services block the deploy on failure; non-critical are logged as pending).
- **Second pass:** `docker compose ... up -d` (no `--force-recreate`) to start anything still `Created`, then asserts `docker ps -a --filter status=created --filter status=exited` is empty for `etip_*` — fails the deploy if not, instead of the old silent gap.
- End-of-deploy cleanup now removes only hash-prefixed orphan containers (`^[0-9a-f]{12}_etip_`) and dangling `etip` images — no longer `docker rm -f` on every exited container.
- Reinstalls cron from git every deploy (`bash scripts/install-cron.sh`, non-fatal if it fails).

### `.github/workflows/deploy.yml`
Replaced the single long-lived SSH heredoc with 4 short SSH steps (fetch/reset, write `.deploy.env`, launch detached, poll). Added `ServerAliveInterval 15`, `ServerAliveCountMax 4`, `ConnectTimeout 30` to the SSH config, and an `ssh_retry` helper that retries only on SSH exit 255 (the `websocket: bad handshake` / broken-pipe class). Job `timeout-minutes` tightened per step (launch step 14 min poll budget) instead of one 10-minute window for the whole deploy. Unused `workflow_dispatch` inputs (`action`, `command` — never read by the old script) removed.

### `.github/workflows/vps-cmd.yml`
Same SSH keepalive + `ssh_retry` wiring as `deploy.yml`, for consistency on manual VPS commands.

### `scripts/etip-cron` (new, 100644, cron.d format)
```
*/5 * * * * root ionice -c3 bash /opt/intelwatch/scripts/health-recovery.sh >> /var/log/etip-health-recovery.log 2>&1
30 2 * * * root bash /opt/intelwatch/scripts/etip-backup.sh >> /var/log/etip-backup.log 2>&1
17 3 * * * root bash /opt/intelwatch/scripts/docker-cleanup.sh >> /var/log/etip-docker-cleanup.log 2>&1
```
Every job is invoked via `bash <path>`, not by executing the file directly — the S148 "wrong exec bit" failure mode can't recur here regardless of the file's own mode.

### `scripts/install-cron.sh` (new, 100755)
Idempotent. `install -m 0644 -o root -g root scripts/etip-cron /etc/cron.d/etip`. Backs up the pre-Step-1 root crontab once to `/root/crontab.before-step1` (only if that file doesn't already exist). Strips any old `health-recovery`/`etip-backup`/`docker-cleanup` lines from the root crontab so jobs never run twice. Writes `/etc/logrotate.d/etip` (weekly, keep 8, compressed) for the three log files. Called automatically at the end of every `deploy-vps.sh` run, so the VPS cron always matches git.

### `scripts/health-recovery.sh`
Now also restarts containers reported `unhealthy` by Docker (not just `created`/`exited`), with a grace period before acting (20 min for `etip_elasticsearch`/`etip_neo4j`, 10 min for everything else, tracked per-container in `/var/lib/etip-health/*.since`). Caps at 3 restarts per container per rolling hour, then gives up and alerts once (re-alerts after another hour if still unhealthy). Sends a Telegram message via `TI_ALERT_TELEGRAM_BOT_TOKEN`/`TI_ALERT_TELEGRAM_CHAT_ID` from `.env` on any action taken (recovery, still-down, unhealthy restart, give-up); silently skips if either var is unset. Skips its whole run if a deploy currently holds `/var/lock/etip-deploy.lock` (non-blocking check — never waits on the lock, so it can't make a deploy fail its own `flock -n`).

### `scripts/docker-cleanup.sh`
Rewritten to be ETIP-only: matches image repository names containing `etip`, skips anything currently in use by a container (any project's), removes ETIP images older than 48 h and dangling ETIP images. No longer runs `docker builder prune` or any global/system-wide prune — the VPS is shared with another project, so a global prune risked deleting that project's cache/images.

### `scripts/etip-backup.sh`
Log-line timestamp bug fixed (S149 follow-up #1): the log prefix is now computed per log call instead of once at script start, so each line shows its own timestamp instead of the run's start time.

### 6 scripts chmod +x
`activate-global-processing.sh`, `generate-sdk.sh`, `seed-feeds.sh`, `seed-free-tier-feeds.sh`, `session81-vps-activate.sh`, `setup-cloudflare-tunnel.sh` — set to 100755 in git so a `git reset --hard` (which every deploy does) can never silently strip the exec bit again (the S148 root cause pattern).

### `.gitignore`
Added `backups/`, `*.PRIVATE.md`, `.deploy.env` — the deploy's per-run secrets file and any local private notes/dumps never get committed.

## 3. Owner-side work done

- UptimeRobot: 3 monitors created (see `docs/runbooks/UPTIME_ALERTS.md` §1–2).
- GitHub: Settings → Notifications → Actions → GitHub + Email, failed workflows only.
- Telegram: owner opted in; bot not created yet — tracked as a follow-up (§6).

## 4. How to verify

```bash
# Cron installed correctly (after first deploy on this branch)
cat /etc/cron.d/etip                              # 3 job lines
crontab -l | grep -c 'intelwatch/scripts'          # 0 — nothing left in root crontab

# Schema-hash gate exists (after first deploy)
ls -l /var/lib/etip/schema.sha256

# Pre-deploy backups taken when schema changed
ls /var/backups/etip/predeploy-*.dump
```

Also see `docs/roadmap/STEP_01_STAY_UP.md` §8 for the full acceptance-check list (dev-machine curl checks + VPS checks), and `docs/runbooks/UPTIME_ALERTS.md` for the alert playbook.

## 5. Rollback

```bash
git revert <merge-sha>                              # reverts to the SSH-heredoc deploy
# on the VPS:
rm /etc/cron.d/etip
crontab /root/crontab.before-step1
```

Restore point tagged before starting: `git tag safe-point-2026-09-26-step1-stay-up`.

## 6. Follow-ups (not done here)

1. **Healthchecks.io for cron heartbeats** — discussed, deferred. Would catch a cron job that stops running entirely (as opposed to running and failing, which the current logs + alerts already cover).
2. **Off-site backup automation (rclone)** — `docs/roadmap/STEP_01_STAY_UP.md` §13. The VPS→owner's-machine copy is still manual.
3. **`ProtectedRoute` demo-session finding** — frontend seeds a fake demo session on any non-2xx from `/api/v1/health` (which 404s by design). Belongs to Step 5, logged here so it isn't lost.
4. **First deploy after merge will take longer than usual** — `/var/lib/etip/schema.sha256` doesn't exist yet, so the schema-changed branch runs unconditionally on the first deploy: a pre-deploy `pg_dump` + `prisma db push` even if the schema didn't actually change. Expect +2–5 min versus a normal deploy.

## 7. Follow-ups done the same day (S150b)

**Restore drill (§13 item) — PASS.** First monthly Postgres restore drill run: 2.16 GB dump, `pg_restore -j 2` rc 0, 6m18s, all row counts matched (or grew as expected). One gotcha found and fixed: `docker rm -f` without `-v` left a 14 GB anonymous volume behind. Procedure now a runbook: `docs/runbooks/RESTORE_DRILL.md`.

**Login email-collision fix — PR #37 (`77e5953`).** The `findFirst`-by-email login bug (open since S149, `apps/user-service/src/repository.ts`) is fixed: a new `findLoginCandidatesByEmail` returns all non-break-glass rows for an email (oldest first, capped at 10), and login tries each until a bcrypt match. Sonnet adversarial review caught a candidate-eviction issue in the first pass (fixed with oldest-first ordering + cap 10). 176 → 184 user-service tests, CI green.

**Tooling/doc fixes.** `/review` now diffs `origin/master...HEAD` (was `main..HEAD`); `/session-end` pushes the current branch and opens a PR when not on master; roadmap §4 renumbered (Step 2 = S151–S157); Step 0 marked partial; Step 1/Step 8 Redis eviction items marked resolved.
