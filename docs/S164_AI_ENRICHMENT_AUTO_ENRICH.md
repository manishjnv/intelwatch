# S164 — AI Enrichment: per-IOC endpoint, severity-gated auto-enrichment, tenant AI budget

**Date:** 2026-09-27 · **Branch:** `s164/ai-enrichment-auto-enrich` · **Module:** ai-enrichment + frontend

## Summary
The frontend already called a per-IOC enrichment endpoint that returned 404 (no such route existed).
This session adds it, and uses the opportunity to gate auto-enrichment by IOC severity and add a
per-tenant AI budget on top of the existing global in-memory USD check. AI stays OFF by default
(`TI_AI_ENABLED=false` unchanged) — this session widens what happens when it's off (free lookups can
still run) and adds guardrails for when it's turned on.

## Backend (`apps/ai-enrichment`)

### New route
`GET /api/v1/enrichment/ioc/:iocId` — JWT auth, tenant-scoped `repo.findById`, `uuid` Zod param, same
404 for a missing IOC or one belonging to another tenant (no information leak about existence).
Returns the stored `enrichmentData` when present, or a null-shaped result with `enrichmentStatus`:
`'pending'` when the IOC's severity is in the auto-enrich list (a job will run eventually), or
`'not_selected'` (new status value, added to the backend schema and the frontend `EnrichmentResult`
type) when it isn't and no manual trigger has been requested.

### Gating, in `apps/ai-enrichment/src/service.ts`, applied in order
1. **Severity gate** — auto (queue-triggered) jobs only run for IOCs whose severity is in
   `TI_ENRICHMENT_AUTO_SEVERITIES` (default `critical,high`). Manual jobs bypass this: `POST
   /enrichment/trigger` sets `manual:true` server-side and a client cannot set that flag itself. This
   gate runs before cache/provider-API/DB work, so a low/info IOC that isn't manually triggered does
   no work at all and returns `skipped 'severity-not-eligible'`.
2. **All-gates-off short circuit** — if lookups are off AND AI is off, skip immediately (`skipped
   'all-gates-off'`) rather than doing pointless bookkeeping.
3. **Lookups gate** — `TI_ENRICHMENT_LOOKUPS_ENABLED` (default `true`) gates the free external
   providers: VirusTotal, AbuseIPDB, IPinfo, Google Safe Browsing. Each provider's own existing rate
   limiter still applies underneath this (`TI_VT_RATE_LIMIT_PER_MIN`, `TI_ABUSEIPDB_RATE_LIMIT_PER_DAY`).
4. **AI gate** — `TI_AI_ENABLED` (default `false`) gates the Haiku call. When AI is on: the new
   per-tenant budget check runs first, then the existing in-memory global USD check as a second layer.

### New `apps/ai-enrichment/src/services/tenant-budget.ts`
Resolves a tenant's AI budget from `Tenant.plan` (the Prisma enum `free | starter | pro | enterprise`)
via a `PLAN_AI_DEFAULTS` table mirrored from customization-service's plan defaults — `free` gets no AI
budget at all, `starter` 10k tokens/day, `pro` 100k tokens/day, `enterprise` unlimited tokens. This
mirror is a point-in-time copy: **runtime edits to plan config in customization-service don't
propagate here** (follow-up: call the plan config service instead of hardcoding the mirror). A tenant
whose plan doesn't match any known value falls back to the existing global
`TI_ENRICHMENT_DAILY_BUDGET_USD` (default `$5`).

Plan lookups are cached 5 minutes per tenant to avoid a DB round-trip on every enrichment. Usage
counters live in Redis as `enrichment:budget:{tenantId}:{YYYY-MM-DD}:tokens` and
`...:{YYYY-MM-DD}:usd`, TTL 48h, incremented after each Haiku call completes (not reserved up front).
On any Redis error the service **fails closed** — it skips AI for that call rather than risk unbounded
spend. Known ceiling: because the check and the increment are two separate Redis calls, concurrent
enrichment jobs for the same tenant can overshoot the daily budget by up to the worker's concurrency
(not fixed this session — ponytail: acceptable at current traffic, revisit if concurrency or tenant
count grows enough to matter).

### Worker change
`enrich-worker.ts` — a `'skipped'` enrichment result no longer triggers the downstream graph-sync,
search-index, or correlate jobs (previously every result, including skips, fanned out downstream work
for nothing).

### Bugs found and fixed during this session's review
- **(a) Enrichment overwrite bug.** With lookups now actively running for more IOCs, an IOC where
  every provider returned nothing (e.g. an unset API key) used to be written back as `'enriched'` with
  every field `null`, overwriting any earlier good enrichment data already on that IOC. Now that case
  returns `skipped 'no-provider-results'` and writes nothing; more generally, the merge into stored
  `enrichmentData` now only overwrites fields that are non-null on the new result, while `status`,
  `enrichedAt`, and `failureReason` are still always updated.
- **(b) Batch service AI-flag check.** The Anthropic batch service was previously constructed
  unconditionally, with no check of `TI_AI_ENABLED` at all. It's now only constructed when
  `TI_AI_ENABLED` is true. It still has **no tenant-budget check** — batch path lacks tenant-budget
  check; now gated by `TI_AI_ENABLED`; follow-up before `TI_BATCH_ENABLED` is turned on for any tenant.
- **(c) Hardcoded budget constant.** `TI_ENRICHMENT_DAILY_BUDGET_USD` was read into config but never
  actually passed to the budget-check call site — the literal `5.00` was always used regardless of the
  env var. Now wired through.

## Compose (`docker-compose.etip.yml`, `etip_enrichment` block)
`TI_AI_ENABLED` stays `false` by default (unchanged). Added:
- `TI_ENRICHMENT_AUTO_SEVERITIES=critical,high`
- `TI_ENRICHMENT_LOOKUPS_ENABLED=true`
- `TI_ENRICHMENT_DAILY_BUDGET_USD=5`

## Production behavior change on deploy
Free external lookups (VT/AbuseIPDB/IPinfo/GSB) now run automatically for **critical and high**
severity IOCs, and for any manually-triggered IOC, even with AI off — this is new; previously nothing
ran automatically at all. Each provider's existing rate limiter still applies, so this doesn't remove
the existing ceiling on provider call volume. **Low/medium/info severity IOCs are no longer
auto-enriched**, including by the re-enrichment scheduler, which now respects the same severity gate.

## Frontend (`apps/frontend`)
`EnrichmentDetailPanel` renders real enrichment data when present, or one of two empty states: "Not
enriched yet." (severity-eligible, status `pending`) or a not-selected message with an "Enrich now"
button that calls `POST /enrichment/trigger` (manual path, bypasses the severity gate).
`'not_selected'` was added to the `EnrichmentResult` type.

## Tests
New: `enrichment-ioc-route.test.ts` (7), `service-gating.test.ts` (9), `tenant-budget.test.ts` (13),
`EnrichmentDetailPanel.test.tsx` (5). Updated: `service.test.ts` (+2, covering the no-overwrite fix),
`config.test.ts`, `enrich-downstream.test.ts`, `enrichment-ui.test.tsx`. ai-enrichment: 366 tests
passing. Frontend: ~1,939 tests passing. `tsc`/eslint: 0 errors.

## Security review
`codex-companion` MCP was stale this session (same pre-flight liveness check as prior sessions) — used
the Sonnet adversarial-takeover fallback. **Verdict: ACCEPT.** Findings from that pass are the three
bugs fixed above (a, b, c). Remaining follow-ups, not blockers:
1. Batch path still has no tenant-budget check (only the `TI_AI_ENABLED` gate) — needed before
   `TI_BATCH_ENABLED` is turned on for any tenant.
2. No per-IOC `/trigger` cooldown — only the existing global 100 req/min per-user rate limit applies
   today, so a user could manually trigger the same IOC repeatedly within that limit.
3. Tenant-budget plan resolution is a hardcoded mirror of customization-service's plan defaults, not a
   live call to that service.

## How to verify after deploy (owner, FRESH browser tab)
- Open a **critical** IOC's detail view → enrichment panel shows real data (or "Not enriched yet." if
  the worker hasn't caught up).
- Open a **low** severity IOC → "not selected" message + "Enrich now" button; click it → status moves
  to queued then enriched.
- Check both at 375px width (`feedback_mobile_first.md`).

## Rollback
`git revert` the merge commit. Or, without a code revert: set `TI_ENRICHMENT_LOOKUPS_ENABLED=false` in
the VPS `.env` and recreate `etip_enrichment` — this restores the old "nothing runs automatically"
behavior immediately.

## Files touched
```
M  apps/ai-enrichment/src/app.ts
M  apps/ai-enrichment/src/config.ts
M  apps/ai-enrichment/src/index.ts
M  apps/ai-enrichment/src/routes/enrichment.ts
M  apps/ai-enrichment/src/schema.ts
M  apps/ai-enrichment/src/service.ts
M  apps/ai-enrichment/src/workers/enrich-worker.ts
M  apps/ai-enrichment/src/workers/re-enrich-scheduler.ts
M  apps/ai-enrichment/tests/config.test.ts
M  apps/ai-enrichment/tests/enrich-downstream.test.ts
M  apps/ai-enrichment/tests/service.test.ts
M  apps/frontend/src/__tests__/enrichment-ui.test.tsx
M  apps/frontend/src/components/viz/EnrichmentDetailPanel.tsx
M  apps/frontend/src/hooks/use-enrichment-data.ts
M  docker-compose.etip.yml
?? apps/ai-enrichment/src/services/
?? apps/ai-enrichment/tests/enrichment-ioc-route.test.ts
?? apps/ai-enrichment/tests/service-gating.test.ts
?? apps/ai-enrichment/tests/tenant-budget.test.ts
?? apps/frontend/src/tests/EnrichmentDetailPanel.test.tsx
```
