# Runbook: Postgres Restore Drill

**Purpose:** prove the nightly `pg_dump` (`/var/backups/etip/pg-<date>.dump`, `scripts/etip-backup.sh`, cron 02:30 UTC) can actually be restored. A backup that was never restored is not a backup.

**Frequency:** monthly. Log every run in `docs/DEPLOYMENT_RCA.md` (resolution-summary table).

**Where:** on the VPS, via `gh workflow run vps-cmd.yml -f cmd="..."` or an owner SSH session. Never touches prod Postgres.

## 1. Pre-checks

```bash
ls -lh /var/backups/etip/pg-*.dump | tail -3      # latest dump exists, note size + mtime
df -h /                                            # confirm free disk > 2x dump size
docker ps --filter name=etip_postgres --format '{{.Status}}'   # prod untouched, just for reference
```

## 2. Start the throwaway container

Same Postgres image as prod, isolated from the network, memory/CPU capped, dumps mounted read-only:

```bash
docker run -d --name drill-pgrestore \
  --memory 2g --cpus 1.5 --network none \
  -e POSTGRES_PASSWORD=drill \
  -v /var/backups/etip:/dumps:ro \
  postgres:16-alpine
```

`drill-pgrestore` is deliberately **not** prefixed `etip_` so `health-recovery.sh` (which only matches `etip_*`) ignores it.

## 3. Restore, detached (a 2 GB+ dump can run past an SSH session)

```bash
docker exec drill-pgrestore sh -c \
  'pg_restore --no-owner --no-privileges -j 2 -d postgres -U postgres /dumps/pg-<date>.dump' \
  > /tmp/restore.log 2>&1 &
echo $! > /tmp/restore.pid
```

Poll until done:

```bash
until ! kill -0 "$(cat /tmp/restore.pid)" 2>/dev/null; do sleep 15; done
echo "rc: exit code not captured by kill -0 — check /tmp/restore.log for errors"
grep -ci error /tmp/restore.log   # expect 0
```

## 4. Compare row counts, prod vs restored

Run the same query against both. Tables to check (prisma/schema.prisma): `tenants`, `users`, `iocs`, `global_iocs`, `tenant_subscriptions`, `feed_sources`, `audit_logs`, `articles`, plus a total public-table count.

```bash
docker exec etip_postgres psql -U "$TI_POSTGRES_USER" -d etip -t -c \
  "select count(*) from information_schema.tables where table_schema='public';"
docker exec drill-pgrestore psql -U postgres -d postgres -t -c \
  "select count(*) from information_schema.tables where table_schema='public';"
```

Repeat per table above. Small growth in prod counts (iocs, articles) between dump time and drill time is expected and not a failure — only investigate if restored counts are *lower* than they should be given the dump's timestamp, or a table is empty/missing.

## 5. Cleanup — remove the container AND its anonymous volume

```bash
docker rm -f -v drill-pgrestore
df -h /   # confirm disk % returns to baseline
```

`-v` is required. Without it, `docker rm -f` leaves the image's anonymous data volume behind — it does not show up in `docker ps` and is easy to miss; over repeated drills these accumulate and quietly eat disk.

## 6. Record the result

Append a row to `docs/DEPLOYMENT_RCA.md`'s resolution-summary table: date, dump size/age, `pg_restore` outcome, duration, row-count match summary, any gotcha found.

## Expected durations

| Step | Typical |
|---|---|
| Container start | a few seconds |
| Restore (`-j 2`, ~2 GB dump) | 6–7 minutes |
| Row-count comparison | 1–2 minutes |
| Cleanup | a few seconds |
| **Total** | ~10 minutes |

## Last result

| Date | Dump | Restore | Duration | Row counts | Notes |
|---|---|---|---|---|---|
| 2026-09-26 | `pg-2026-09-26_0230.dump`, 2.16 GB, ~3h42m old | rc 0, 0 error lines | 6m18s | tenants 10/10, users 11/11, iocs 12,093/12,086 (prod grew after dump), global_iocs 168/168, tenant_subscriptions 0/0, feed_sources 20/20, audit_logs 204/204, articles 5,283,917/5,278,207 (~0.1% growth after dump), public tables 36/36 | PASS. Gotcha: `docker rm -f` without `-v` left a 14 GB anonymous volume (disk 27%→34%); removed manually, back to 27% (142 GB free). 32 etip containers healthy throughout, prod never written. RTO ≈ 6–7 min restore + container start; RPO ≤ 24 h (nightly dump); off-site copy still manual. |

**Run monthly. Log every result in `docs/DEPLOYMENT_RCA.md`.**
