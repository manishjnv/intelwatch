# Step 0B deploy — prompt for Claude Code in VS Code

Paste the block below into Claude Code **in VS Code** (it has VPS access). It deploys the Step 0B fixes from branch `claude/beautiful-allen-nd42lg` in a safe order. **Order matters:** the integration encryption key must be in the VPS `.env` before the merge, or `etip_integration` refuses to start.

```text
ETIP Step 0B deploy. Read docs/roadmap/STEP_00B_URGENT_FIXES.md (§0 + Progress) and your local docs/VPS_BASELINE_2026-09-25.PRIVATE.md first.
VPS: /opt/intelwatch, docker-compose.etip.yml (SSH per CLAUDE.md). RULES: never print secret values; ask me before each numbered step; stop and report if anything fails.

0. LOCAL CHECKS: git fetch && git checkout claude/beautiful-allen-nd42lg && git pull. Run `make pre-push` (the cloud session ran the module tests, the build and lint, but could not run docker-test or nginx -t). Read docs/DEPLOYMENT_RCA.md for anything matching these changes: compose Redis command/limit, new compose env var, nginx location, deploy.yml concurrency/paths-ignore, new scripts/etip-backup.sh.

1. BACKUP (VPS, before anything else):
   mkdir -p /var/backups/etip && chmod 700 /var/backups/etip
   docker exec etip_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /var/backups/etip/pg-pre0B-$(date +%F).dump
   Check the size is > 0, then scp it to my machine (off-box copy).

2. SECRETS in /opt/intelwatch/.env (no echo of values):
   cp .env .env.bak-$(date +%F) && chmod 600 .env.bak-*
   a) Add TI_INTEGRATION_ENCRYPTION_KEY=$(openssl rand -hex 32) if it's missing (required by the new code in production).
   b) Replace TI_JWT_SECRET with $(openssl rand -hex 48). Do the same for any other secret the private baseline marks weak/DEFAULT, except the Razorpay keys (deferred; the new code closes those routes in production).
   Don't restart anything yet; the deploy in step 3 recreates the containers with the new env. Tell me: all users will have to log in again.

3. DEPLOY: open a PR claude/beautiful-allen-nd42lg → master titled "fix: Step 0B urgent security + data-safety fixes" (body: list U1–U12 from STEP_00B Progress). Wait for the CI "Test" job to be green, then merge. Watch the deploy workflow until it finishes. If the SSH step drops (known flake), re-run the failed job once.

4. VERIFY on the VPS after deploy:
   - docker ps: 32/32 etip_* Up + healthy, especially etip_integration, etip_redis, etip_nginx.
   - docker exec etip_nginx nginx -t → ok.
   - Redis: CONFIG GET maxmemory-policy → noeviction; CONFIG GET maxmemory → 1073741824 (password from container env, not printed).
   - ls -l scripts/health-recovery.sh scripts/etip-backup.sh → both -rwx.
   - curl https://intelwatch.in/ → 200; /grafana/api/health → 404; /grafana/ → 302 login.
   - curl -X POST https://intelwatch.in/api/v1/billing/webhooks/razorpay → 503 PAYMENTS_DISABLED (401 is also fine if nginx answers first).
   - Log in to the app (new login needed). Dashboard, IOCs, Alerts and Reports pages load.
   - Cross-tenant check: with my logged-in access token (from the browser), curl "https://intelwatch.in/api/v1/alerts?tenantId=00000000-0000-0000-0000-000000000000" -H "Authorization: Bearer $TOKEN" → 403. Same for /api/v1/reports and /api/v1/search/iocs. Don't print the token.
   - docker logs etip_integration --tail 20 → no CONFIG_INVALID.

5. BACKUP CRON: add to root crontab:
   30 2 * * * /opt/intelwatch/scripts/etip-backup.sh >> /var/log/etip-backup.log 2>&1
   Run it once by hand, check /var/log/etip-backup.log and the files in /var/backups/etip. Ask me where off-box copies should go (my machine / S3 bucket / Hostinger backup).

6. DOCS (CLAUDE.md post-deploy checklist): update docs/PROJECT_STATE.md (deployment log row), docs/ETIP_Project_Stats.html, docs/DEPLOYMENT_RCA.md ("no new issues" or a new RCA), and add "0B-0 + 0B deploy done <date>" to docs/VPS_BASELINE_2026-09-25.md (no secret details, the repo is public). Update the private baseline file locally. Commit "docs: post-deploy stats update — session 149" to master.

ROLLBACK: git revert the merge commit on master and push (redeploys the old code). Restore .env from .env.bak-<date> and run docker compose -f docker-compose.etip.yml up -d. For Redis only: CONFIG SET maxmemory-policy allkeys-lru. DB restore: docker exec -i etip_postgres pg_restore -U <user> -d <db> --clean --if-exists < the pre0B dump.
```
