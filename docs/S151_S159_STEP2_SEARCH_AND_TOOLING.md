# S151–S159 — Step 2 "Search Works" + Step 0 Tooling + Frontend tsc Cleanup

**Date:** 2026-09-26 · **Sessions:** S151, S152, S153, S154, S155, S156, S157, S158, S159 · **PRs:** #38, #39, #40, #41, #42, #43 (all merged to master, all deployed, all green, 32/32 containers healthy each time)

This doc covers the whole day: the 7-session roadmap Step 2 rollout (`docs/roadmap/STEP_02_SEARCH_INDEX.md`), Step 0 dev-workflow tooling (S158, superseded same day by DECISION-034), and a frontend TypeScript cleanup (S159).

---

## 1. Why

Elasticsearch held 0 IOC documents while Postgres held ~12,010 `iocs` rows. ⌘K search returned nothing. The root causes (spec §3.1): the only producer sat behind idle AI enrichment and sent a job with no payload; a deterministic jobId silently blocked every later re-index; nothing had ever backfilled the existing rows; and the search route trusted a client-supplied `tenantId` instead of the JWT.

## 2. What changed, per PR

### PR #38 (`c04b813`) — S151 shared-utils, S152 elasticsearch-indexing-service
- **`packages/shared-utils/src/search-index.ts`** (new): `IocDocumentSchema` v2 (severity `info|low|medium|high|critical`, TLP uppercase, enriched/archived flags, MITRE/malware/actor arrays), `IocIndexJobSchema` (discriminated union on `action: index|update|delete`), `toIocDocument(ioc)` mapper, `iocIndexJobId(action, ioc)` — versioned and colon-free (`ioc-index-<id>-<updatedAtMs>`, `ioc-update-<id>-<enrichedAtMs>`, `ioc-delete-<id>`), `IOC_INDEX_JOB_OPTIONS` (3 attempts, exponential backoff, capped `removeOnComplete`/`removeOnFail`). DECISION-033 recorded: tenant-rows-only index now (option A), a shared global index later (option B) when `TI_GLOBAL_PROCESSING_ENABLED` goes live.
- **`apps/elasticsearch-indexing-service`**: `src/schemas.ts` re-exports the shared contract instead of its own loose schema. `src/index-naming.ts` adds `hash_md5/sha1/sha256/sha512 → hash` and `unknown → other` (previously every hash silently fell into `_other`). `src/worker.ts` validates every job against the shared schema and drops (logs, doesn't throw) anything invalid or where the payload's tenant/iocId don't match the job envelope. `src/es-client.ts`: `updateDoc` on a 404 now indexes the doc if the payload is a full valid document, else warns and completes (previously threw AppError 503 and failed the job); `deleteDoc`/a new `deleteByIds` (used across the whole tenant wildcard, so an IOC's category doesn't need to be known) treat 404 as success. Search moved from `query_string` (which 503'd on inputs like `a:b`) to `simple_query_string` on `value`/`normalizedValue`/`tags` plus an exact-match boost on `normalizedValue`; `revoked`/`false_positive` IOCs are hidden unless `?includeInactive=true`. `assertSafeTenantId()` runs before any index name is built. `src/routes/reindex.ts` forces the document's own `tenantId` rather than trusting the request body. **No new JWT plugin was added** — tenant isolation for `/api/v1/search/*` was already closed by Step 0B's nginx `auth_request` + verified `x-tenant-id` header + `tenant-guard.ts`.
- Tests: shared-utils 148→172 (+24), elasticsearch-indexing-service 116→166 (+50).

### PR #39 (`30ec9ae`) — S153 normalization
- After every tenant `ioc.upsert` (`src/service.ts`), fire-and-forget enqueue of an `index` job built with the shared `toIocDocument()`, gated by `TI_IOC_INDEX_ENABLED` (enum+transform pattern, default `true`, not `z.coerce.boolean()`). Sent even when the enrich job itself is skipped (bloom-filter hit), so search stays populated even with AI enrichment off.
- Tests: 322→328 (+6).

### PR #40 (`7a58a4f`) — S154 ai-enrichment, S155 api-gateway
- **ai-enrichment** `src/workers/enrich-worker.ts`: sends `action:'update'` with `iocType` and a partial payload (`enriched`, `enrichedAt`, `externalRiskScore`, `enrichmentQuality`, `confidence`, `severity`), jobId now versioned by `enrichedAt` (`ioc-update-<id>-<enrichedAtMs>`). The **previous fixed jobId** (`ioc-index-<iocId>`) had been silently colliding with itself since the first enrichment of each IOC — BullMQ ignores an `add()` whose jobId already exists (including failed jobs it retains), so **every re-enrichment after the first was dropped without error**; 6,118 jobs sit in the failed set from this bug going back to 2026-07-11. `src/queue.ts` gets `removeOnComplete`/`removeOnFail` job options. `src/config.ts`: every `z.coerce.boolean()` flag is replaced with the enum+transform pattern, because `z.coerce.boolean("false")` evaluates to `true` (a non-empty string is truthy) — this bug affected more than just the index-enabled flag. VPS already sets `TI_AI_ENABLED=true` explicitly, so this is a latent-bug fix, not a production behavior change.
- **api-gateway** `src/routes/search-backfill.ts` (new): `POST /api/v1/gateway/search/backfill`, `super_admin` only (403 otherwise). Body `{tenantId?, dryRun?}`. Pages `prisma.ioc.findMany` per tenant (excluding offboarded tenants) in batches of 500, `queue.addBulk`s `index` jobs built with `toIocDocument()`. Returns `[{tenantId, dbCount, enqueued}]` per tenant. Writes an audit log entry (`search.backfill`). Idempotent: running it twice produces the same jobIds (versioned by `updatedAt`), so nothing double-enqueues.
- Tests: ai-enrichment 314→329 (+15), api-gateway 296→307 (+11).

### PR #41 (`f7984bb`) — S156 frontend, S157 ioc-intelligence
- **Frontend**: new hook `apps/frontend/src/hooks/use-global-search-results.ts` wraps `api('/search/iocs')` with a Bearer token (the previous code was a raw, unauthenticated `fetch('/api/v1/search?q=...')` against a route that doesn't exist — every ⌘K search silently returned `[]` for three independent reasons: no auth header → 401, wrong path → 404, and a response-envelope mismatch). This is a **data-only edit inside the LOCKED `DashboardLayout.tsx` block** — owner-approved on 2026-09-26 — the shared-ui `GlobalSearch` component itself is untouched. Errors now surface as a toast instead of being swallowed into an empty result list.
- **ioc-intelligence** `src/service.ts` / `src/queue.ts`: create, update, soft-delete (revoke), bulk operations, and lifecycle transitions each send an `index` (or `delete`, on hard-delete paths) job so analyst edits stay in sync with search without waiting for the next normalization pass. Bulk `updateMany` re-reads the affected ids and uses `addBulk`.
- Tests: ioc-intelligence 140→148 (+8); frontend +4 (new hook test); CI: 118 test files pass (local frontend vitest can't start on Node 20.11 due to a jsdom ESM `require` error — CI's Node version is unaffected).

### PR #42 (`48ebc22`) — S158 Step 0 dev-workflow tooling
- Added `/session-start` workspace check, `/session-end` don't-merge rule, an `etip-reviewer` subagent, `scripts/new-worktree.sh`, and a CLAUDE.md one-deployer rule, built around a worktree-per-session design.
- **Same day**, another session found two Claude sessions had collided in the checkout and rewrote this PR (commits `b9bc62c`, `3581f0b`) to DECISION-034 instead: one folder (`E:\code\IntelWatch`), no git worktrees, one Claude session at a time, branch per task. `scripts/new-worktree.sh` was deleted. The worktree-per-session design in this PR never reached lasting use — describe the final state (DECISION-034), not the original PR description.

### PR #43 (`960fc23` + `e8874a8`) — S159 frontend tsc cleanup
- Frontend TypeScript errors: 122 → 0, across 50 files, with no `any` casts and no `ts-ignore` suppressions, and no UI behavior change. `deploy.yml`'s `'!@etip/frontend'` exclusion from the typecheck step was removed, so CI now actually gates on frontend types.
- Two **real bugs** were caught in the process, not just type noise: `SecurityPanel` referenced `Loader2` without importing it (a runtime `ReferenceError` the moment that code path rendered), and `GlobalCatalogPage` passed its Type/Plan filters to `FilterBar` in a shape the component ignores, so those dropdowns silently did nothing — now wired to `filterValues`/`onFilterChange`.
- Ingestion's typecheck came back at 0 errors too; the 2 errors previously logged against `feed-fetch.ts` turned out to be a stale local Prisma client, not real.
- First CI run of this PR failed: `feeds-tab.test.tsx` mocked `useMySubscriptions` with the old envelope shape, unrelated to the tsc fix. Fixed the mock; second run green.

## 3. Production backfill (2026-09-26)

```
dryRun:  12,093 rows across 10 tenants (only 2 tenants hold IOCs: e4e11c4c… 6,051, 10c895c3… 6,042); 0 skipped
real:    12,093 jobs enqueued
drain:   ~1 doc/s (es-indexing uses refresh:'wait_for' per doc) → full drain estimated ~3h
checked mid-drain: 598 docs in ES, 0 new errors, failed count unchanged at 6,118 (the pre-existing S154-bug legacy failures, not new)
NOT YET VERIFIED: ES doc count per tenant == Postgres iocs row count — this is S160's first task
```

## 4. How to verify (spec §9 has the exact commands)

```bash
# Queue drained
docker exec etip_redis redis-cli -a "$TI_REDIS_PASSWORD" --no-auth-warning LLEN bull:etip-ioc-indexed:wait

# ES count per tenant, compare to Postgres
docker exec etip_elasticsearch curl -s -u "elastic:$TI_ELASTICSEARCH_PASSWORD" \
  "localhost:9200/etip_<TENANT_ID>_iocs_*/_count?ignore_unavailable=true"
docker exec etip_postgres psql -U "${TI_POSTGRES_USER:-etip_user}" -d "${TI_POSTGRES_DB:-etip}" \
  -c "SELECT tenant_id, count(*) FROM iocs GROUP BY 1 ORDER BY 2 DESC;"

# Search works, tenant-isolated
curl -s "https://intelwatch.in/api/v1/search/iocs?q=<known-ioc-value>&limit=5" -H "Authorization: Bearer $TENANT_TOKEN"
```
UI check: type a known IOC value into ⌘K and confirm it appears under "Indicators of Compromise"; `/search` should show real facets with no demo banner.

## 5. Rollback

- Revert the relevant PR (#38–#41) and redeploy — each session's change is additive and independently revertible.
- Stop producing without a deploy: set `TI_IOC_INDEX_ENABLED=false` on normalization (and ai-enrichment, once S154's flag fix is live) and recreate those two containers.
- Clear the queue: `docker exec etip_redis redis-cli -a … DEL bull:etip-ioc-indexed:wait` (or obliterate it with a BullMQ script).
- Throw away the index: `DELETE /etip_*_iocs_*` on Elasticsearch removes only derived data — Postgres stays the source of truth. Re-run the backfill (`POST /api/v1/gateway/search/backfill`, super_admin token) to rebuild it.
- Do **not** revert S152's tenant-scoping fix on its own once the index has real documents in it — if it must be reverted, delete the indices in the same step.

## 6. Findings carried to future sessions

1. **S160 (next):** verify ES doc count == Postgres row count per tenant, once `bull:etip-ioc-indexed:wait` is 0.
2. Optional speed-up: the backfill uses `refresh:'wait_for'` per document (~1/s). Switch to `refresh:false` or `bulkIndexMultiType` if IOC volume grows past what a multi-hour drain can absorb.
3. ai-enrichment's downstream queues (`graphSync`, `correlate`, `cacheInvalidate`) still have no `removeOnComplete` — Redis (`noeviction`, 1 GB) grows unbounded over time. Not fixed this session; scope was the search-index path only.
4. The 6,118 legacy failed jobs in `bull:etip-ioc-indexed:failed` (all pre-dating S154's fix) can be purged once ES=DB is confirmed correct without them.
5. `tests/e2e/pipeline-downstream-flow.test.ts` still documents the pre-S154 enrichment job shape. It passes today (it doesn't assert against the new fields) but should be updated the next time that file is touched.
6. The legacy `etip_<t>_iocs` index (no category suffix) is not covered by the offboarding purge pattern (`etip_<t>_iocs_*`) — a follow-up for `user-management-service/src/services/external-purge.ts`.
7. Elasticsearch has `number_of_replicas: 1` on a single-node cluster, which keeps cluster status yellow. Doesn't block search; lower it to 0 in a later ops session.
8. Leftover folders under `E:/code/IntelWatch-wt` (Windows file-locked `node_modules`) from the now-abandoned worktree design — needs a manual delete by the owner.
9. The owner's local `.env` has a short-lived super-admin JWT under the key `token` — remove it after use; never printed its value in any doc.
10. "Enriched today 0" language that appears in some older docs is stale — enrichment is active in production (`TI_AI_ENABLED=true`); it just wasn't producing search-index jobs correctly before S154.
11. **Session-numbering:** S158 and S159 were consumed by unplanned tooling/tsc work instead of the roadmap's Phase 1 (persistence) sessions. Flagged in `docs/ROADMAP_S149_PLUS.md` §4 rather than force-renumbered, because that table's Phase 1 numbers already disagreed with `STEP_03_PERSISTENCE.md`'s own numbering before today. Next never-used number: **S160**.

## 7. Owner decisions confirmed this session

- DECISION-033 (tenant-rows-only search index now, shared global index later) — accepted.
- Editing the LOCKED `DashboardLayout.tsx` GlobalSearch data block for S156 — owner-approved, data-only.
- api-gateway reading `iocs` directly via Prisma for the backfill (precedent: `routes/public/iocs.ts`) — accepted.
- Revoked/false-positive IOCs hidden from search by default, `includeInactive=true` to show them; archived IOCs stay searchable — accepted.
