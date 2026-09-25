# SESSION HANDOFF DOCUMENT
**Date:** 2026-09-25
**Session:** 148
**Session Summary:** Project review and a status check found intelwatch.in down for ~46 h. `etip_nginx` was stuck in `Created` after the #30 deploy's SSH drop, and the auto-recovery cron couldn't run because its script wasn't executable. Fixed live on the VPS; the permanent fix is in PR #31 (open, not merged).

## ✅ Changes Made
| Commit | Files | Description |
|---|---|---|
| `8c73723` (PR #31, branch `docs/rca-nginx-created-outage`) | 4 | `scripts/health-recovery.sh` + `scripts/docker-cleanup.sh` mode 100644 → 100755; RCA row "Session 148"; new `docs/S148_NGINX_OUTAGE.md` |
| session-end commit (same branch) | 4–5 | PROJECT_STATE (S148), this handoff, ETIP_Project_Stats.html, RCA |

**Live VPS changes (not via git):** `docker compose -f docker-compose.etip.yml up -d etip_nginx`; `chmod +x scripts/health-recovery.sh scripts/docker-cleanup.sh`; ran `health-recovery.sh` once (exit 0).

**Outside the repo:** global `~/.claude/CLAUDE.md` gained a "Pre-commit checklist" (save all → detailed doc in docs/ → RCA for bug fixes) and a "Reporting format" (grouped summary → next tasks → token/model line).

## 📁 Files / Documents Affected
**New**
| File | Purpose |
|---|---|
| docs/S148_NGINX_OUTAGE.md | Incident write-up: timeline, root cause, fix, verify commands, rollback, follow-ups |

**Modified**
| File | Change |
|---|---|
| scripts/health-recovery.sh, scripts/docker-cleanup.sh | exec bit only (content unchanged) |
| docs/DEPLOYMENT_RCA.md | "Session 148" row |
| docs/PROJECT_STATE.md | S148 counter, WIP rewrite, deployment log row 148 |
| docs/SESSION_HANDOFF.md | this file |
| docs/ETIP_Project_Stats.html | session 148 header/footer + card |

## 🔧 Decisions & Rationale
None (no DECISION entries). The exec-bit fix is ops hygiene, not architecture.

## 🧪 E2E / Deploy Verification Results
```
before:  https://intelwatch.in/ → 502 (Server: cloudflare)
VPS:     etip_nginx  Created      (31 other etip_* Up, cloudflared active)
log:     ionice: failed to execute /opt/intelwatch/scripts/health-recovery.sh: Permission denied   (×20,361)
after:   etip_nginx  Up (healthy); nginx -t → syntax is ok / test is successful
         /index.html 200 · /pricing 200 · /login 200 · /api/v1/iocs 401 (nginx auth_request)
         spoofed x-tenant-id / x-user-role without token → 401 on iocs, actors, graph, archive
         /api/v1/billing/webhooks/razorpay → 401 WEBHOOK_SIGNATURE_MISSING (reaches billing, correct)
         health-recovery.sh manual run → exit 0
```
Tests: not run. No source code changed (file modes + docs only).

## ⚠️ Open Items / Next Steps
**Immediate**
1. **Merge PR #31 before any other deploy.** Until it lands, a deploy's `git reset --hard` resets the script to non-executable. After the merge, verify `ls -l /opt/intelwatch/scripts/health-recovery.sh` shows `-rwx`.
2. **External uptime alert**, e.g. UptimeRobot or a Cloudflare health check on `/` that emails the owner. This is the gap that let the outage run 46 h.
3. **Deploy resilience:** run the VPS side of deploy.yml under `setsid`/`nohup` and add `ServerAliveInterval` to the SSH step.
4. Owner click-through of the logged-in app (carried from S147).

**Deferred**
- Install the Docker cleanup cron on KVM4. It's missing, but disk is at 22 %, so it isn't urgent.
- Offboarding purge TODOs (`apps/user-management-service/src/services/offboarding-purge-worker.ts:118-126`): graph, ES and cache data aren't deleted.
- S147 follow-ups in docs/S147_APP_WIRING_FOLLOWUPS.md (search index, demo-fallback UX, missing endpoints, least-privilege DB role).
- 20 source files over 400 lines (largest: ingestion `connectors/misp.ts` 859, `AdminOpsPage.tsx` 809, `BillingPage.tsx` 759).

**Process note:** two Claude sessions (`intelwatch-9c`, `intelwatch-e2`) ran on the same working tree in S148. Use `git worktree add` per session, and let only one session deploy at a time.

## 🔁 How to Resume
```
/session-start
Working on: ops (PR #31 merge + uptime alert). Do not modify: frozen shared-* packages, api-gateway structure.
First: env -u GH_TOKEN gh pr view 31 → merge if green → watch deploy → verify health-recovery.sh is -rwx on the VPS.
Then: uptime alert, then deploy.yml resilience (setsid + ServerAliveInterval).
```
Phase: 13 (production hardening + SEO). Plan docs: docs/SEO_PLAN.md, docs/S147_APP_WIRING_FOLLOWUPS.md, docs/S148_NGINX_OUTAGE.md.
