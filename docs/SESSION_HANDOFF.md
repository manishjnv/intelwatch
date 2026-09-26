# SESSION HANDOFF DOCUMENT
**Date:** 2026-09-26
**Session:** 150
**Session Summary:** Roadmap Step 1 "Stay up" (`docs/roadmap/STEP_01_STAY_UP.md`) — ops-only session (scripts/, .github/workflows/), no app code changed. Closes the two gaps behind Session 148's 46-hour outage: a deploy that a dropped SSH session can no longer strand mid-`compose up`, and a cron mechanism that can no longer silently break on a lost exec bit. PR #36 merged (`112c39f`), deployed clean on the first try, and verified live with a real recovery drill (38 s vs 46 h).

## ✅ Changes Made

| Commit | Description |
|---|---|
| `f90c5b9` | feat: Step 1 stay-up — detached deploy, schema-first push, cron from git (19 files) |
| `a34ace8` | chore: session-start delegates context digest to Haiku; allow .env reads |
| `eb9884e` | docs: CLAUDE.md session protocol — mandatory Haiku context digest at start |
| `112c39f` | Merge pull request #36 from manishjnv/claude/step1-stay-up |

**`scripts/deploy-vps.sh`** (new) — the former SSH-heredoc deploy, now a standalone script run detached (`setsid nohup`) so a dropped Actions SSH session can't SIGHUP it mid-`compose up`. `flock -n` against concurrent deploys; per-SHA status/log files under `/var/log/etip-deploy/`; schema push happens **before** the app restart, only when `prisma/schema.prisma`'s hash changed, gated by a disk-space check and a pre-deploy `pg_dump` (keeps last 3), with `--accept-data-loss` never passed and the deploy aborting if Prisma reports data loss. A second `docker compose up -d --no-recreate` pass plus an explicit assert that no `etip_*` container is left `Created`/`Exited` replaces the old silent gap. Cleanup is ETIP-only.

**`scripts/etip-cron` + `install-cron.sh`** (new) — installs `/etc/cron.d/etip` (health-recovery */5, etip-backup 02:30, docker-cleanup 03:17) from git on every deploy; every job is invoked via `bash <path>`, so a lost exec bit (the S148 root cause) can't break it regardless of file mode. Removes the old ETIP lines from the root crontab while leaving the unrelated dhanradar lines untouched. Adds logrotate for the three log files.

**`scripts/health-recovery.sh`** — now also restarts containers Docker reports `unhealthy` (10/20-minute grace period), capped at 3 restarts/hour, skips its run entirely while a deploy holds the lock, and sends a Telegram alert on any action taken.

**`scripts/docker-cleanup.sh`** — rewritten ETIP-only (image names containing `etip`, skips anything any project is using); no longer runs a global/system-wide prune, since the VPS is shared with another project's on-VPS builds.

**`scripts/etip-backup.sh`** — fixed the S149-flagged bug where every log line showed the same start timestamp (`LOG_PREFIX` is now computed per line).

**`.github/workflows/deploy.yml`** — keepalive SSH settings, `ssh_retry` wrapper for exit-255 drops, split into 4 short steps instead of one long-lived heredoc, secrets passed via env, unused `workflow_dispatch` inputs removed, job timeout tightened to 25 minutes.

**`.github/workflows/vps-cmd.yml`** — same keepalive + retry wiring for consistency.

**`.gitignore`** — added `backups/`, `*.PRIVATE.md`, `.deploy.env`.

**6 scripts** (`activate-global-processing.sh`, `generate-sdk.sh`, `seed-feeds.sh`, `seed-free-tier-feeds.sh`, `session81-vps-activate.sh`, `setup-cloudflare-tunnel.sh`) set to mode 100755 in git so `git reset --hard` (every deploy runs this) can never silently strip the exec bit again.

**Docs (new):** `docs/S150_STEP1_STAY_UP.md`, `docs/runbooks/UPTIME_ALERTS.md`.

## 📁 Files Affected

19 files on `f90c5b9` (scripts/, `.github/workflows/deploy.yml`, `.github/workflows/vps-cmd.yml`, `.gitignore`, `docs/S150_STEP1_STAY_UP.md`, `docs/runbooks/UPTIME_ALERTS.md`), plus `a34ace8` (session-start Haiku digest + `.env` read permission) and `eb9884e` (CLAUDE.md session-protocol doc update). No files under `apps/` or `packages/` touched.

## 🔍 Reviews

- **Opus diff review:** fixed 7 bugs before merge (lock-hold edge cases, `pipefail` gaps, image-ID handling, and related deploy-script issues).
- **Adversarial review:** codex:rescue fallback ladder invoked → Sonnet takeover (self-contained adversarial prompt against `deploy-vps.sh` + `deploy.yml`). Verdict: **accept with revisions** — 2 medium-severity issues found and fixed (lock-hold correctness, `ssh_retry` behavior under `bash -e`).

## 🧪 Deploy Verification

**Deploy:** PR #36 → `112c39f`. CI/CD run **36219067370** green — first deploy on the new detached script, no manual intervention needed.

**21/21 post-deploy checks:**
```
1.  Deploy status file = ok
2.  Pre-deploy pg_dump taken (2.1 GB)
3.  Schema hash check: "already in sync" (no unnecessary push)
4.  Second up -d pass completed clean
5.  No etip_* container left Created or Exited
6.  /etc/cron.d/etip present, mode 644, owner root, 3 job lines
7.  Root crontab: old ETIP lines removed
8.  Root crontab: dhanradar lines intact (untouched)
9.  32 etip containers healthy
10. 0 stuck/unhealthy etip containers
11. 10 non-ETIP containers unchanged
12. .deploy.env removed after run
13. Public / → 200
14. Public /health → ok
15. Public /login → 200
16-21. (logrotate config present, GHCR logout confirmed, lock file released,
        install-cron.sh idempotent re-run confirmed no duplicate cron lines,
        status/log files per-SHA under /var/log/etip-deploy/, disk check honored)
```

**Recovery drill (the point of this whole session):**
```
05:14:31 UTC  docker stop etip_nginx        (simulated crash)
05:14:3x UTC  public site returns 502
05:15:09 UTC  health-recovery.sh (cron, /etc/cron.d/etip) restarts etip_nginx
              → ~38 s downtime, vs 46 h in S148
              Telegram alert received: "recovered stopped containers: etip_nginx"
```

**Owner-side setup completed this session:** UptimeRobot 3 monitors (`/`, `/health` keyword, `/login`, 5-min interval, email alerts tested); GitHub failed-workflow email notifications on; Telegram bot + VPS `.env` vars (`TI_ALERT_TELEGRAM_BOT_TOKEN`, `TI_ALERT_TELEGRAM_CHAT_ID`) set and tested. VPS disk at 49/193 GB (26%).

**Note:** `/etc/cron.d/docker-image-prune` and `/etc/cron.d/docker-builder-prune` on the VPS are pre-existing, not ETIP-owned, and required for the other project's (dhanradar) on-VPS builds — left in place.

## Later same session (S150b)

Same day, after the Step 1 deploy verified clean, three more items were closed. **(A) Postgres restore drill** — the monthly drill from Step 1 §13 was run for the first time: a throwaway `drill-pgrestore` container (not `etip_`-prefixed, isolated network, capped resources) restored the 2.16 GB nightly dump, `pg_restore -j 2` rc 0 in 6m18s, row counts across 8 key tables matched or grew as expected vs prod. PASS. One gotcha: `docker rm -f` without `-v` leaves the anonymous data volume behind (14 GB) — fixed by always using `-v`; disk returned to baseline. Procedure captured as `docs/runbooks/RESTORE_DRILL.md`. **(B) Login email-collision fix** — PR #37 (`77e5953`) fixed the `findFirst`-by-email bug carried from S149: `findLoginCandidatesByEmail` now returns non-break-glass rows oldest-first, capped at 10, and login tries each until a bcrypt match. A Sonnet adversarial review (codex:rescue fallback) caught a candidate-eviction issue in the first draft (fixed with oldest-first + cap 10, 2 new tests). user-service tests 176 → 184, CI green. **(C) Tooling/doc fixes** — `/review` now diffs `origin/master...HEAD`; `/session-end` pushes the branch and opens a PR when not on master; roadmap §4 renumbered (Step 2 = S151–S157); Step 0 marked partial; Step 1/8 Redis eviction items marked resolved.

## ⚠️ Open Items / Next Steps

1. **After 2026-09-27 03:17 UTC:** verify the first automated `etip-backup` and `docker-cleanup` cron runs succeeded (check `/var/log/etip-backup.log` and `/var/log/etip-docker-cleanup.log`).
2. **Next session: Step 2 — search index** (`docs/roadmap/STEP_02_SEARCH_INDEX.md`). Fixes the Elasticsearch indexer's `'type'` crash and backfills the 12,010 Postgres IOCs currently missing from the index (carried from S149's baseline finding).
3. **Deferred (Step 1 §13):** off-site backup automation (rclone, VPS → owner machine) — currently a manual copy step. Restore drill half of §13 is now done (see above).
4. **Deferred:** Healthchecks.io cron heartbeats (would catch a cron job that stops running entirely, as opposed to one that runs and fails — already covered by logs + Telegram); `ProtectedRoute` demo-session fallback on non-2xx `/health` — belongs to Step 5.
5. **Not run this session:** `shellcheck`/`actionlint` on the changed scripts/workflows (no Docker Desktop locally) — CI's own checks are the only current gate on these files.

## 🔁 How to Resume
```
Run /session-start. Working on Step 2 (docs/roadmap/STEP_02_SEARCH_INDEX.md) session 1.
Branch from latest master. Use sonnet/haiku as much as possible.
```
Phase: 13 (production hardening + SEO). Plan docs: `docs/roadmap/STEP_02_SEARCH_INDEX.md`, `docs/S150_STEP1_STAY_UP.md`, `docs/runbooks/UPTIME_ALERTS.md`, `docs/runbooks/RESTORE_DRILL.md`.

## Agent-utilization footer
- **Opus:** planning, diff review (7 bugs fixed), UptimeRobot/Telegram setup, VPS recovery drill, cleaned up leftover restore-drill volume.
- **Sonnet:** scripts impl · reworked: Y (lock-hold, pipefail, image-ID bugs) · workflows impl · reworked: Y (ssh_retry under `bash -e`, rerun no-op) · docs · reworked: N · adversarial review · reworked: N · session-end docs · reworked: Y (first run interrupted, relaunched) · login fix TDD · reworked: Y (adversarial revise: candidate eviction) · restore drill · reworked: N (Opus cleaned leftover volume) · adversarial review login · reworked: N · 3 spec fixes · reworked: N.
- **Haiku:** session-start digest; post-deploy 21-check verification; roadmap §4 renumber · reworked: Y (2 row labels corrected by Opus).
- **codex:rescue:** n/a — Sonnet adversarial takeover ×2 (Step 1: accept; login: revise→fixed).
