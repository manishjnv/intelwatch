# S176 — Step 3 alerting persistence (row S154)

**Date:** 2026-09-30 · **Session:** 176 · Branch `s176/alerting-persistence-s154` · safe-point tag `safe-point-2026-09-29-s176-alerting-s154`

Spec: `docs/roadmap/STEP_03_PERSISTENCE.md` §5.1/§6.1. Code commit `a653895`.

## What changed and why

Alerting-service rules, notification channels, escalation policies and maintenance windows now live in Postgres, so they survive a container restart. Before: in-process Maps, lost on every restart/deploy.

New Prisma models in `prisma/schema.prisma` (additive, no relation to `Tenant`; offboarding purge by `tenant_id` is a separate row, S159e):

- `AlertRule` → `alert_rules`
- `AlertChannel` → `alert_channels`
- `AlertEscalationPolicy` → `alert_escalation_policies`
- `AlertMaintenanceWindow` → `alert_maintenance_windows`

`tenant_id` is `uuid`. Tables are created by `prisma db push` in `scripts/deploy-vps.sh` before app containers are recreated.

## Files touched

New:
- `apps/alerting-service/src/repository.ts` — `Repo<T>` interface, `MemoryRepo` for dev/tests, `dbCall` (wraps DB errors as `AppError` 503 `DB_UNAVAILABLE`), `isUuid`.
- `apps/alerting-service/src/repository-prisma.ts` — 4 Prisma-backed repos with Date↔ISO mappers.
- `apps/alerting-service/src/services/channel-crypto.ts` — `ChannelCrypto` (AES-256-GCM, format `'v1:' + base64(iv‖ciphertext‖tag)`), `maskChannelConfig`, `maskUrl`.

Changed:
- `apps/alerting-service/src/services/{rule,channel,escalation,maintenance}-store.ts` — now take a repo in the constructor, methods are async.
- `apps/alerting-service/src/routes/{rules,channels,escalations,maintenance,templates,stats}.ts` — await the stores.
- `apps/alerting-service/src/workers/alert-worker.ts`, `src/services/escalation-dispatcher.ts` — await the stores.
- `apps/alerting-service/src/plugins/tenant-guard.ts` — adds `requestTenant()`.
- `apps/alerting-service/src/config.ts`, `src/index.ts` — wire the DB URL, encryption key, and repo construction.
- `apps/alerting-service/src/services/notifier.ts` — webhook log line shows only the URL origin, not the full URL.

## New env vars + owner action

| Var | Requirement | Notes |
|---|---|---|
| `TI_DATABASE_URL` | Required when `TI_NODE_ENV=production` | Same value format as billing-service |
| `TI_ALERTING_ENCRYPTION_KEY` | Required whenever `TI_DATABASE_URL` is set | 32 random bytes as base64, generate with `openssl rand -base64 32` |

The key was added to the VPS `/opt/intelwatch/.env` on 2026-09-30 (value never printed).

**Owner action:** store a copy of `TI_ALERTING_ENCRYPTION_KEY` in the password manager. Losing the key means existing channel configs can't be decrypted and must be re-entered.

Compose (`etip_alerting`): `TI_DATABASE_URL`, `TI_ALERTING_ENCRYPTION_KEY` (`${…:?}` — compose refuses to start without it), `depends_on etip_postgres` (`service_healthy`), memory limit raised 256M → 384M for the Prisma engine.

## Behaviour

- **DB error → HTTP 503 `DB_UNAVAILABLE`**, never a silent fallback to memory (decision D3).
- **Channel config is encrypted at rest.** API responses (create/list/update) return a masked config: Slack webhook URL and webhook URL → `https://host/****`, webhook secret and header values → `****`, email recipients unchanged. The `/channels/:id/test` route uses the real config internally.
- **Tenant scoping.** By-id reads/updates/deletes filter by the caller's tenant (spec §8, "tenant filter on every query"). A notification channel or escalation policy referenced by a rule is only used if it belongs to the same tenant.
- **Non-UUID ids.** Ids or tenant ids that are not UUIDs (legacy `'default'`) are answered as not-found (reads) or 400 (writes) without querying Postgres.

## Deviations from spec (deliberate)

- Only 4 of the 7 §6.1 models added — `Alert`, `AlertHistoryEntry`, `AlertGroup` come with S155. The schema is additive-only, so adding an unused table now and reshaping it later isn't cheap.
- No `configMasked` or `keyVersion` columns — the mask is computed on read; both can be added later as additive columns.
- No separate `src/prisma.ts` — the `PrismaClient` is built in `index.ts`.
- Id arrays (`channel_ids`, `rule_ids`) are `text[]`, not `uuid[]`.

## Reviews

- **Opus diff review:** added tenant scoping of the escalation-policy lookup, plus a test for it.
- **codex:rescue adversarial review**, verdict "revise":
  1. Webhook URL was logged in full by `notifier.ts` → fixed (origin only).
  2. The alert worker catches DB errors inside its per-rule block, so the BullMQ job is not retried on a DB outage → deferred to S155, because re-running the job today double-counts the rule-engine buffer and can duplicate alerts. S155 moves alerts + dedup to Postgres, then `processJob` rethrows `DB_UNAVAILABLE` so BullMQ retries the whole job.

**Found while reviewing, not changed:** `notifier.ts` only logs Slack/webhook/email sends — no real HTTP/SMTP delivery is wired yet (code has "actual webhook call wired in production" comments). Listed as a follow-up below.

## Tests

alerting-service 329 → 377 passing; test files 25 → 29 (new: `channel-crypto.test.ts`, `repository.test.ts`, `persistence-restart.test.ts`, `config.test.ts`).

## CI guard

4 alerting lines removed from `scripts/memory-store-baseline.txt` (rule-store, channel-store, escalation-store, maintenance-store — the ratchet from S175). `MemoryRepo`'s `Map` carries a `memory-ok:` tag.

## How to verify (spec §9)

```bash
docker exec etip_postgres psql -U etip_user -d etip -c "\dt alert*"
# shows the 4 tables

# rule count is the same before and after a restart
docker restart etip_alerting

docker logs etip_alerting --since 1h 2>&1 | grep -ci "fall.*back\|in-memory"
# → 0

docker logs etip_alerting --since 1h 2>&1 | grep "Alerting persistence"
# shows "Alerting persistence: Postgres"
```

```sql
SELECT config_enc FROM alert_channels;
-- holds only 'v1:' ciphertext
```

## Rollback

`git revert` the PR merge commit and redeploy. The 4 tables stay in Postgres — additive, harmless. Restore point tag: `safe-point-2026-09-29-s176-alerting-s154`.

## Follow-ups

- S155: alert worker rethrows `DB_UNAVAILABLE` so BullMQ retries the job (needs alerts + dedup moved to Postgres first, to avoid double-counting).
- Notifier delivery (Slack/webhook/email) is not wired to a real send yet — currently log-only.
- S159e (offboarding purge) must include the 4 new tables.
- Step 4 (RLS) needs to cover the 4 new tables.

## Deploy result

PR #68: commits `a653895` (feat) + `973d897` (docs), merge `3e2a73f`. CI/CD run 36617017423: Test, Type-check, Lint & Audit success; Build & Push Docker Images success; Deploy to VPS success.

VPS verification (2026-09-30): HEAD `3e2a73f`, 32/32 containers healthy; the 4 tables exist; `etip_alerting` logs "Alerting persistence: Postgres", 0 "fall back"/"in-memory" lines; a disabled test rule + test Slack channel survived `docker restart etip_alerting` (read back 200), `alert_channels.config_enc` starts with `'v1:'` and holds no plaintext, the API returned the masked URL, and the channel test route worked; test rows deleted (204, 0 left); memory guard OK; `etip_alerting` 43.34 MiB / 384 MiB.
