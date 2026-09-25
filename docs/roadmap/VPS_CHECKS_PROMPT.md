# VPS baseline checks — prompt for Claude Code in VS Code

Cloud Claude sessions can't reach the VPS (no SSH, port 22 blocked). Paste the prompt below into Claude Code **in VS Code** (it has SSH access). It is **read-only**, and the results feed Steps 0B, 1, 2, 3, 4 and 7 of `docs/ROADMAP_S149_PLUS.md`.

---

```text
Read-only VPS baseline check for ETIP. First pull branch claude/beautiful-allen-nd42lg and read docs/roadmap/README.md and docs/roadmap/STEP_00B_URGENT_FIXES.md for context.

VPS: ssh root@187.127.138.93 (or via the tunnel ssh.intelwatch.in per CLAUDE.md), path /opt/intelwatch, compose docker-compose.etip.yml.

STRICT RULES
- READ-ONLY. Do not restart, stop, edit, chmod, deploy, run migrations or write anything on the VPS.
- NEVER print a secret value. For env vars, print only: set / MISSING / DEFAULT.
- If a command would change state, skip it and write "skipped".
- Save results to docs/VPS_BASELINE_2026-09-25.md (tables, no secrets), commit "docs: VPS baseline checks for roadmap" on branch claude/beautiful-allen-nd42lg, and push. Do not push to master.

CHECKS (label each A1, A2, … in the report)

A. Secrets and exposure (Step 0B)
A1. For each of TI_INTEGRATION_ENCRYPTION_KEY, TI_GRAFANA_PASSWORD, TI_JWT_SECRET, TI_SERVICE_JWT_SECRET, TI_RAZORPAY_WEBHOOK_SECRET in /opt/intelwatch/.env, print set / MISSING / DEFAULT, where DEFAULT means it contains placeholder|change-me|etip_grafana_admin|dev-jwt-secret. Also check whether TI_INTEGRATION_ENCRYPTION_KEY is passed into the etip_integration container: docker exec etip_integration printenv TI_INTEGRATION_ENCRYPTION_KEY | wc -c (a count only).
A2. From outside the VPS (run locally): curl -s -o /dev/null -w "%{http_code}\n" https://intelwatch.in/grafana/ and https://intelwatch.in/grafana/api/health. Is Grafana reachable without login?
A3. Cross-tenant read (U1): with no token, curl -s -o /dev/null -w "%{http_code}" "https://intelwatch.in/api/v1/search/iocs?tenantId=00000000-0000-0000-0000-000000000000" (expect 401). Just record the code. Do not try to use real tokens.
A4. Razorpay routes (deferred feature): curl -s -o /dev/null -w "%{http_code}" -X POST https://intelwatch.in/api/v1/billing/webhooks/razorpay. Record the code.

B. Uptime and deploy (Step 1)
B1. ls -l scripts/health-recovery.sh scripts/docker-cleanup.sh (is it -rwx?). crontab -l (which ETIP crons exist?). tail -5 of the health-recovery log, if any.
B2. docker ps -a --filter name=etip_ --format "{{.Names}} {{.Status}}" | sort. Count Up/healthy vs other states.
B3. df -h /, free -h, docker system df.
B4. Backups: is any pg_dump / neo4j dump / ES snapshot / MinIO backup cron or file present? ls -la /var/backups /opt/backups 2>/dev/null; check Hostinger snapshot settings, if you know how.
B5. curl -s -o /dev/null -w "%{http_code}" https://intelwatch.in/health and /api/v1/health.

C. Redis (Step 0B U7)
C1. docker exec etip_redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning INFO memory | grep -E "used_memory_human|maxmemory_human|maxmemory_policy"' (use whatever env var holds the password inside the container; don't print it). Also INFO stats | grep evicted_keys.

D. Search index (Step 2)
D1. Postgres: SELECT tenant_id, count(*) FROM iocs GROUP BY 1 ORDER BY 2 DESC LIMIT 20; plus count(*) from global_iocs if the table exists.
D2. Elasticsearch: _cat/indices?v&h=index,docs.count,store.size (etip_* only).
D3. Redis queue: LLEN bull:etip-ioc-indexed:wait and ZCARD bull:etip-ioc-indexed:failed.
D4. Is TI_GLOBAL_PROCESSING_ENABLED true or false in .env and in the running ingestion container?

E. Database roles and RLS (Step 4, from STEP_04_DB_ROLE_RLS.md section 9)
E1. SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'etip%';
E2. SELECT usename, count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1;
E3. Tenant tables without RLS or without a policy (the query in STEP_04 §9 check 4).
E4. SHOW max_connections; and the current connection count.

F. In-memory data still in use (Step 3)
F1. Row counts for: alert rules, integrations, reports, if such tables exist (\dt alert* integration* report* drp*). Record "no table" where none exists. This confirms the data is only in memory.

G. Capacity baseline (Step 7)
G1. docker stats --no-stream --format "{{.Name}} {{.MemUsage}} {{.CPUPerc}}" | sort -k2 -h, all etip_* containers.
G2. Total RAM used vs 16 GB.

H. Summary
At the top of the report, list: anything that is a live security problem (A1 DEFAULT / A2 open / A3 not 401), any container not healthy, backup status, Redis policy, the ES-vs-DB count gap, and the RLS status. Then a one-line recommendation for each item that maps to STEP_00B U-numbers.
```

---

**After it runs:** the results land in `docs/VPS_BASELINE_2026-09-25.md`. A cloud session can read that file and adjust the specs.
