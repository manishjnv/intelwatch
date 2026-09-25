# S149 Part 3 — Step 0B urgent-fixes deploy (2026-09-25)

**Type:** planned hardening deploy · **Result:** deployed clean, 32/32 healthy · **Spec:** `docs/roadmap/STEP_00B_URGENT_FIXES.md` · **Runbook:** `docs/roadmap/VPS_DEPLOY_0B_PROMPT.md`

## 1. Why

`docs/VPS_BASELINE_2026-09-25.md` (Part 2 of this session) found several live, unfixed issues: at least one non-production-grade secret, an exposed Grafana health endpoint, a Redis cache that was already evicting keys, and no backups at all for ETIP data. Step 0B ("urgent fixes") is the fix batch for the items that couldn't wait for the fuller Step 1–4 roadmap.

## 2. What changed

### Code (PR #35 → `d3d4c01`)
| Area | Change |
|---|---|
| Tenant isolation (U1–U3) | Cross-tenant requests on alerts/reports/search now return 403 instead of leaking data |
| Secrets (U4) | integration-service refuses to start in production with the dev encryption key; compose passes `TI_INTEGRATION_ENCRYPTION_KEY`; integration secrets masked (`********`) in API responses, and a masked value sent back on update keeps the stored secret |
| Billing payment gate (U5) | Razorpay payment routes (webhooks, checkout, subscription create/cancel) return 503 `PAYMENTS_DISABLED` in production while payments are deferred (DECISION-031). Gate hardened during review — see §3 |
| Grafana (U6) | `/grafana/api/health` returns 404 at nginx (was leaking the version anonymously) |
| Redis (U7) | Compose command now `--maxmemory 1gb --maxmemory-policy noeviction`, container limit 300M → 1280M (applied when the deploy recreated `etip_redis`) |
| Backups (U8) | New `scripts/etip-backup.sh` (Postgres `pg_dump -Fc` + Redis data copy, 7-day retention); cron installed after deploy |
| Deploy workflow (U10) | `concurrency` group (no overlapping deploys) + `paths-ignore` for docs/markdown-only pushes |
| Global feeds (U11) | REST and MISP workers share one queue, so the connector is now picked from the feed's type (stops REST feeds failing through the MISP connector and auto-disabling) |
| MFA (U12) | MFA setup no longer falls back to a demo secret/QR when the API fails |
| Not in this deploy | U9 (schema push before restart) → Step 1 |

### Infra (live on VPS, not via git)
- `.env`: login JWT secret, service JWT secret rotated to new strong random values; integration encryption key added. Backed up first as `.env.bak-2026-09-25-pre0B`.
- Cron: `30 2 * * * /opt/intelwatch/scripts/etip-backup.sh >> /var/log/etip-backup.log 2>&1`.

## 3. Adversarial review finding (fixed before deploy)

Codex was quota-limited until 2026-09-29, so the fallback ladder routed the review to a Sonnet takeover (self-contained adversarial prompt, no plugin dependency). Verdict: **REVISE**.

- **Blocker:** the billing payment gate matched against the raw `req.url`. A percent-encoded path (e.g. `che%63kout` for `checkout`) bypassed the gate because Fastify's router decodes the path before routing, so the gate's string match never fired for the encoded form while the route still matched. **Fix (`5c33b36`):** match against `req.routeOptions.url` (the resolved route pattern) instead of the raw request URL, plus new tests covering the encoded-path case.
- **Non-blocker (deferred):** the tenant guard on the bulk reindex route only validates the top-level `tenantId`, not `tenantId` on each nested item in the request body. This route is super-admin-only, so the risk is low; tracked as a follow-up rather than blocking this deploy.

## 4. Deploy order and why

1. **Pre-deploy backup first** (§5) — nothing before this touched the VPS, so a bad deploy could still be rolled back from a known-good dump.
2. **Secret rotation** — must happen before the code deploy: the new integration-service refuses to start in production without a real encryption key, and the deploy's container recreate is what loads the new `.env` values. Side effect: every logged-in user's session was invalidated (JWT secret changed), so everyone had to log in again.
3. **Code deploy (PR #35)** — after backup + rotation are both in place.
4. **Live verification** (§6) — before declaring done.
5. **Backup cron install** — last, since it depends on the (now-fixed) production config being stable.

## 5. Pre-deploy backup

```
VPS:      pg_dump → /var/backups/etip/pg-pre0B-2026-09-25.dump   (2.16 GB, 36 tables)
Off-box:  copied to E:\code\IntelWatch\backups\etip on the owner's machine
          excluded from git locally via .git/info/exclude (never commit dumps)
          checksum verified after copy
```

## 6. How to verify

These are the checks that ran on 2026-09-25. SSH goes through the Cloudflare tunnel (see CLAUDE.md). Nothing prints secret values.

```bash
SSH='ssh -o ProxyCommand="cloudflared access ssh --hostname ssh.intelwatch.in" root@ssh.intelwatch.in'

# Containers — expect "total 32 healthy 32"
eval $SSH "'echo total \$(docker ps -a --filter name=etip_ -q | wc -l) healthy \$(docker ps --filter name=etip_ --filter health=healthy -q | wc -l)'"

# nginx config — expect "syntax is ok" / "test is successful"
eval $SSH "'docker exec etip_nginx nginx -t'"

# Redis — expect noeviction / 1073741824 / evicted_keys:0. Password read from .env on the VPS, passed via REDISCLI_AUTH (not printed)
eval $SSH "'cd /opt/intelwatch; P=\$(grep ^TI_REDIS_PASSWORD= .env | cut -d= -f2-); for c in \"CONFIG GET maxmemory-policy\" \"CONFIG GET maxmemory\"; do docker exec -e REDISCLI_AUTH=\$P etip_redis redis-cli \$c; done; docker exec -e REDISCLI_AUTH=\$P etip_redis redis-cli INFO stats | grep evicted_keys'"

# Tenant guard — call the service directly with the headers nginx sets after login.
# expect: other-tenant 403, own-tenant 200 (ports 3023 alerts, 3021 reports, 3020 search)
eval $SSH "'A=<tenant-A-uuid>; B=<tenant-B-uuid>; for u in 3023/api/v1/alerts 3021/api/v1/reports 3020/api/v1/search/iocs; do echo \$u \$(curl -s -o /dev/null -w %{http_code} -H \"x-tenant-id: \$A\" -H \"x-user-role: analyst\" \"http://127.0.0.1:\$u?tenantId=\$B\"); done'"
# From a browser session as a NON-super_admin user: fetch('/api/v1/alerts?tenantId=<other>') → 403

# Billing gate — direct to billing (port 3019), including encoded paths. expect: 503 for all
eval $SSH "'for p in checkout che%63kout subscriptions/c%61ncel webhooks/r%61zorpay; do echo \$p \$(curl -s -o /dev/null -w %{http_code} -X POST http://127.0.0.1:3019/api/v1/billing/\$p); done'"
# Public webhook route: expect 503
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://intelwatch.in/api/v1/billing/webhooks/razorpay

# Grafana — expect 404, then 302
curl -s -o /dev/null -w '%{http_code}\n' https://intelwatch.in/grafana/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://intelwatch.in/grafana/

# Backup cron — expect the 02:30 line, and a "done" line after each nightly run
eval $SSH "'crontab -l | grep etip-backup; tail -3 /var/log/etip-backup.log; ls -l /var/backups/etip'"
```

## 7. Rollback

- **Code:** `git revert -m 1 d3d4c01` (the PR #35 merge) on master and push — the deploy runs again with the old code. No schema changes were in this PR.
- **Secrets:** restore `.env` from `.env.bak-2026-09-25-pre0B` on the VPS. Note this invalidates all sessions again (same as the forward rotation did).
- **Redis policy:** `redis-cli CONFIG SET maxmemory-policy allkeys-lru` and `CONFIG SET maxmemory 256mb` reverts to the pre-0B settings (not recommended — this is what was causing evictions).
- **Data:** if something goes badly wrong with data (not expected — no migrations ran), restore from `pg-pre0B-2026-09-25.dump` via `pg_restore`. This should not be needed for a code/config-only deploy.
- **Backup cron:** `crontab -e` and remove the `etip-backup.sh` line (not recommended — this closes the "no backups" gap found in Part 2).

## 8. Follow-ups (not done here)

1. **Backup log timestamp bug:** `scripts/etip-backup.sh` computes `LOG_PREFIX` once at the top of the script, so every log line for a run shows the same start timestamp instead of its own. Cosmetic (doesn't affect the backup itself) — fix by computing the prefix per log call.
2. **Off-box backup automation:** the VPS→owner's-machine copy in Step 1 (§5) was done by hand. Automating it is Step 1 work (`docs/roadmap/STEP_01_STAY_UP.md`).
3. **Tenant guard on nested `tenantId`:** the bulk reindex route (super-admin-only) validates only the top-level `tenantId`, not each item in the body. Low risk, deferred — see Step 3.
4. **Elasticsearch indexer crash:** still broken (`Cannot read properties of undefined (reading 'type')`, failing since 2026-07-11). Out of scope for Step 0B — tracked as Step 2.
5. **Login incident:** unrelated pre-existing bug surfaced right after this deploy because the JWT secret rotation logged everyone out. Root cause and workaround are recorded in `docs/SESSION_HANDOFF.md` ("Login incident after deploy"), not in this doc, since it isn't part of what Step 0B changed.
