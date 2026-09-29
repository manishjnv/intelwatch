# S175 — Step 3 ops prerequisite (row 154-0)

**Date:** 2026-09-29 · **Session:** 175 · Branch `s175/step3-deploy-ordering` · safe-point tag `safe-point-2026-09-29-s175-pre-deploy-ordering`

## Summary

Step 3 (persistence) row `154-0` is the ops prerequisite, plus owner decisions D1 and D4 (DECISION-049). Re-verifying spec §3 against current code found two of the four items already done by earlier work: deploy ordering and D1 (Redis `noeviction`). Only D4 (archive off) and the CI guard needed new work this session.

## What changed

### Deploy ordering — already done, no change

`scripts/deploy-vps.sh` (Step 1 stay-up, S150) already starts infra first (lines 86–88), then syncs the schema (lines 90–157), then recreates app containers (lines 159–161). The schema push only runs when the `prisma/schema.prisma` hash changes, takes a pre-deploy `pg_dump` first, retries 3 times, aborts on a data-loss warning, and exits 1 (fails the deploy) if all tries fail. No `--accept-data-loss` flag. The spec's `deploy.yml:186–206` reference is stale — the deploy logic moved into `scripts/deploy-vps.sh` at some point after the spec was written. No change made.

### D1 (Redis noeviction) — already done, no change

`docker-compose.etip.yml:47–48` already sets `--maxmemory 1gb --maxmemory-policy noeviction` (from STEP_00B U7), with a 1280M container limit. Live VPS check on 2026-09-29 (VPS HEAD `e240372`):

- `maxmemory-policy` = `noeviction`
- `maxmemory` = `1073741824`
- `used_memory_human` = `137.30M`
- `evicted_keys` = `0`

The spec asked for 512 MB; 1 GB is already live and is kept as-is. No change made.

### D4 — caching-service archive turned off (new)

`apps/caching-service/src/config.ts` adds `TI_ARCHIVE_ENABLED` (default `false`).

`ArchiveEngine.startCron()` logs `Archive disabled (TI_ARCHIVE_ENABLED=false) — cron not started` and returns without scheduling. `runOnce()` returns `null` as its first action. Together these stop both the nightly cron (`0 2 * * *`) and `POST /api/v1/archive/run` from writing sample records to MinIO. The route already answers 200 `Archive cycle completed with no records to archive` when `runOnce()` returns `null`, so no route change was needed.

Existing sample objects already in the MinIO bucket `etip-archive` are **not** deleted by this change — deleting them and rebuilding the index from real MinIO data is row S159b, not this session.

The env var is not passed in `docker-compose.etip.yml` today, so turning the archive back on later needs a compose line (see Rollback).

### CI guard (new)

`scripts/check-memory-stores.sh` + `scripts/memory-store-baseline.txt` implement spec §7's ratchet guard.

The script greps class fields in `apps/*/src/**/*.ts` matching `new Map` / `new Set` / `[]` that don't carry a same-line `// memory-ok: <why>` tag, and fails when one of those lines is not already in the baseline.

Baseline: **158 entries** (spec had estimated 156 on 2026-09-25). No existing caches were tagged this session — everything found today is in the baseline as-is. Each future Step 3 session removes the lines it persists from the baseline (the ratchet). `--baseline` prints the current baseline list.

Baseline entries per app:

| App | Count |
|---|---|
| integration-service | 22 |
| customization | 20 |
| ingestion | 18 |
| user-management-service | 12 |
| drp-service | 12 |
| alerting-service | 11 |
| admin-service | 11 |
| onboarding | 9 |
| hunting-service | 8 |
| correlation-engine | 8 |
| billing-service | 7 |
| ai-enrichment | 5 |
| threat-graph | 4 |
| reporting-service | 4 |
| normalization | 2 |
| caching-service | 2 |
| analytics-service | 2 |
| api-gateway | 1 |

Wired into `.github/workflows/deploy.yml` test job (step after "Generate Prisma client") and the `Makefile` `check` target.

**Guard probes run locally:**
1. An untagged `new Map` in a new file → exit 1, the offending line printed.
2. The same line tagged `// memory-ok: cache — probe` → exit 0.
3. Baseline file converted to CRLF line endings → still exit 0 (no false fail from line-ending mismatch).

## Files touched

- `apps/caching-service/src/config.ts` — `TI_ARCHIVE_ENABLED` (default `false`).
- `apps/caching-service/src/index.ts` — passes `enabled: config.TI_ARCHIVE_ENABLED` to `ArchiveEngine`.
- `apps/caching-service/src/services/archive-engine.ts` — `runOnce()` returns `null` first; `startCron()` logs and returns when disabled.
- `apps/caching-service/tests/archive-engine.test.ts` — +4 tests.
- `scripts/check-memory-stores.sh` (new) — CI guard.
- `scripts/memory-store-baseline.txt` (new) — 158-line baseline.
- `.github/workflows/deploy.yml` — guard step in the test job.
- `Makefile` — guard wired into `check` target.

## Tests

caching-service 108 → 112 (7 files): 2 config tests (default `false`, `'true'` string parses to enabled) + 2 disabled-engine tests (`runOnce()` returns `null` with no MinIO `putObject` call and `totalRuns` stays 0; `startCron()` leaves `cronRunning` `false`).

## How to verify

```bash
docker logs etip_caching 2>&1 | grep "Archive disabled"   # shows the disabled line
```

CI test job output shows `memory-store guard: OK`.

## Rollback

`git revert` the merge commit — no schema change, no data migration, safe to revert cleanly.

To re-enable the archive only (without a full revert): add `TI_ARCHIVE_ENABLED: "true"` to the `etip_caching` environment block in `docker-compose.etip.yml`.

## Follow-ups

- Next Step 3 row is **S154** (alerting-service): models + rules/channels/escalations/maintenance → Postgres.
- Tag real caches with `// memory-ok: ...` inside each module's own migration session, not here — this session only baselined what already exists.
- Delete the existing sample archive objects in MinIO and rebuild the index from real data in **S159b**.
