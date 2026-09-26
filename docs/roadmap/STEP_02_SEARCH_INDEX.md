# Step 2 — Search works (IOC index at normalization + backfill)

**Written:** 2026-09-25 · **Status:** spec, not built · **Roadmap:** docs/ROADMAP_S149_PLUS.md §3 step 2, §4 Phase 0 (S150–S153) · **Source:** docs/S147_APP_WIRING_FOLLOWUPS.md Follow-up A
**Rules:** one module per session (CLAUDE.md scope lock). S = 1–2 files, M = 3–5 files (plan mode). 🔒 = security-adjacent, needs an adversarial review before push.

All file paths and line numbers below were checked against the code on 2026-09-25. Production numbers (0 ES docs, 5,934 IOCs) come from the S147 notes (2026-09-23). They were not measured again for this spec.

---

## 1. Goal

A logged-in user types an IOC value in ⌘K or on `/search` and sees their IOCs within seconds of normalization. Search must work even when AI enrichment is off. Enrichment only *adds* fields to a doc that already exists. For each tenant, the ES doc count equals the DB row count.

## 2. Why now

- W3 in the roadmap: ⌘K is empty. It is the core product promise, and it is visible in every demo.
- Steps 10–13 (copilot, detection rules, retro-hunt) need a correct index.
- Once IOCs are in ES, the two security holes in §3.4 (cross-tenant read) become real. **They must be fixed in the same step, before the backfill runs.**

## 3. Current state (verified)

### 3.1 Why ES has 0 docs while the DB has ~5,934 IOCs
1. **Only one producer, and it sits behind AI.** The only code that adds jobs to `QUEUES.IOC_INDEX` (`'etip-ioc-indexed'`, `packages/shared-utils/src/queues.ts:28`) is `apps/ai-enrichment/src/workers/enrich-worker.ts:94-108`. It runs only after an IOC is enriched, and enrichment is idle ("Enriched today 0"). Normalization never adds index jobs (`apps/normalization/src/service.ts:588-601` adds only the enrich job).
2. **The job it sends would fail anyway.** The enrichment job is `{action:'index', iocId, tenantId, iocType, normalizedValue, externalRiskScore, enrichmentQuality, severity, confidence, enrichedAt}` with **no `payload`**. The es-indexing worker (`apps/elasticsearch-indexing-service/src/worker.ts:52-57`) calls `indexIOC(tenantId, iocId, payload)` with `payload = undefined`. `ioc-indexer.ts:20` then reads `payload.type` and throws a TypeError.
3. **The deterministic jobId blocks later jobs.** Enrichment uses `jobId: ioc-index-<iocId>` (`enrich-worker.ts:107`), and its queue has no `removeOnComplete` (`apps/ai-enrichment/src/queue.ts:43`). BullMQ ignores an `add` whose jobId already exists, including completed and failed jobs that it keeps. So each IOC could be indexed **once, ever**. Any later change is silently dropped.
4. **Nothing has backfilled the existing rows.** `POST /api/v1/search/reindex` exists (`routes/reindex.ts`, super-admin only in nginx since S147 at `docker/nginx/conf.d/default.conf:455`), but nothing calls it.

### 3.2 Where IOCs are written (the paths that must produce index jobs)
| Writer | File:line | Table | Produces IOC_INDEX today? |
|---|---|---|---|
| Tenant normalize (feed → IOC) | `apps/normalization/src/service.ts:550` → `repository.ts:8-60` (`ioc.upsert` by `dedupeHash`) | `iocs` | No |
| Global normalize, existing IOC | `apps/normalization/src/workers/global-normalize-worker.ts:252` (`globalIoc.update`) | `global_iocs` | No |
| Global normalize, new IOC | `global-normalize-worker.ts:299` (`globalIoc.create`), then `ENRICH_GLOBAL` at `:318` | `global_iocs` | No |
| Batch normalizer | `apps/normalization/src/services/batch-normalizer.ts:168,204` | `global_iocs` | No. **Not wired anywhere** (dead code today) |
| AI enrichment | `apps/ai-enrichment/src/repository.ts:22,45` (enrichmentData, confidence) | `iocs` | Yes, but broken (§3.1) |
| Analyst create / update / soft-delete / bulk / lifecycle | `apps/ioc-intelligence/src/service.ts:112,154,216,344,425`; soft delete = `lifecycle:'revoked'` at `repository.ts:99-106` | `iocs` | No |
| Retention archive | `apps/user-management-service/src/services/retention-service.ts:115`, `apps/user-service/src/retention-service.ts:86` (`updateMany` sets `archivedAt`) | `iocs` | No |
| Offboarding purge | `apps/user-management-service/src/services/offboarding-purge-worker.ts:78` (`ioc.deleteMany`), then `external-purge.ts:119-124` deletes indices `etip_<t>_iocs_*` | `iocs` | Deletes the ES indices directly |

Global processing is **off by default**: `TI_GLOBAL_PROCESSING_ENABLED: ${…:-false}` (`docker-compose.etip.yml:314,360,1161`) and `apps/normalization/src/index.ts:92`. So the ~5,934 IOCs are most likely tenant `iocs` rows. **Check before S151** with the SQL in §8.

### 3.3 The es-indexing service today (`apps/elasticsearch-indexing-service/src`)
- The job schema is loose: `IocIndexJobSchema = {iocId, tenantId, action: index|update|delete, payload?: record}` (`schemas.ts:54-58`). The payload is **not** checked against `IocDocumentSchema` (`schemas.ts:5-20`).
- Indices are per tenant and per type: `etip_<tenant>_iocs_<ip|domain|hash|email|cve|other>` (`index-naming.ts:47-50`). Search uses the wildcard `etip_<t>_iocs_*`.
- **Type-name mismatch:** `TYPE_TO_CATEGORY` (`index-naming.ts:12-27`) has keys `md5, sha1, sha256, sha512`, but Prisma `IocType` uses `hash_md5, hash_sha1, hash_sha256, hash_sha512` (`prisma/schema.prisma:330-347`). As a result, every hash would land in `_other`.
- **Update and delete go to the wrong index.** `worker.ts:58-62` never passes the IOC type. `updateIOC` falls back to `payload.type ?? 'other'`, and `deleteIOC` always uses `'other'` (`ioc-indexer.ts:36,52`). A delete of an IP IOC therefore targets `…_iocs_other`.
- **Update on a missing doc fails.** `es-client.ts:174-180` uses a plain `client.update`. ES returns 404 `document_missing_exception`, the code throws AppError 503, and the job fails. Delete on a missing doc also fails (`:183-189`).
- **Enum mismatches with Prisma:**
  - Severity: `IocDocumentSchema` allows `low…critical`, but Prisma also has `info`.
  - TLP: the schema expects `WHITE…RED`, but Prisma `TLP` is lowercase (`white…red`), and `GlobalIoc.tlp` is an uppercase string.
- Mappings (`mappings.ts:15-35`) already include `normalizedValue, lifecycle, mitreAttack, malwareFamilies, threatActors`. The document schema does not.
- The free-text query is `query_string` on `value, tags` (`es-client.ts:196-198`). Input like `http://x` or `a:b` causes a parse error, which returns 503.

### 3.4 🔒 Security gaps that must be closed in this step
- **Cross-tenant read.** `GET /api/v1/search/iocs` and `/iocs/stats` take `tenantId` from the **query string** (`routes/search.ts:30-31,40-44`). nginx checks that the user is logged in and sets `x-tenant-id` (`docker/nginx/conf.d/service-auth.inc`, `default.conf:528`). But the service never reads that header, and it never verifies the JWT (`index.ts:14` loads JWT config, and no route uses it). Any logged-in user could read another tenant's IOCs by changing `tenantId=`. Today this is harmless only because the indices are empty.
- **Reindex:** `/api/v1/search/reindex` also trusts `tenantId` from the body. It is already super-admin only in nginx (S147 #29). Keep it that way.

### 3.5 Frontend call paths (verified)
| UI | Code | Call | Expects | Works after indexing? |
|---|---|---|---|---|
| ⌘K GlobalSearch | `apps/frontend/src/components/layout/DashboardLayout.tsx:113-124` | raw `fetch('/api/v1/search?q=…&limit=20')` | a bare `SearchResult[]` = `{id, type, value, label?, severity?, category:'iocs'…}` (`packages/shared-ui/src/components/GlobalSearch.tsx:8-11`) | **No, for 3 reasons.** (1) Raw `fetch` sends no `Authorization` header, so nginx `auth_request` returns 401. (2) `/api/v1/search` (no `/iocs`) has no route, so it returns 404. (3) The service returns `{data:{total,page,limit,data,aggregations}}`, not an array. `if (!res.ok) return []` hides all three. |
| `/search` page | `apps/frontend/src/hooks/use-es-search.ts:218-240` | `api('/search/iocs?tenantId=…&q=&type=&severity=&tlp=&enriched=&page=&limit=')` (Bearer token, `.data` unwrapped) | `{total, page, limit, data: IocDocument[], aggregations:{by_type,by_severity,by_tlp}}` | Yes. The shape matches `IocSearchResult` (`schemas.ts:75-81`). It sends single-value filters only; multi-value filters are applied on the client. |

Also: GlobalSearch result rows have no click or Enter handler, so choosing a result does nothing (UI only). This is a separate, later shared-ui change and is not part of this step.

### 3.6 Global IOCs today
Tenants see global IOCs through `GET /api/v1/normalization/global-iocs` → `TenantOverlayService.getIocsForTenant` (`apps/normalization/src/services/tenant-overlay-service.ts:63-110`). The overlay (custom severity, confidence, lifecycle, tags) is merged at read time. **Surprise:** that query does **not** filter by `TenantFeedSubscription`. Every tenant sees every global IOC (`:74-82`).

---

## 4. Decision needed first: global vs tenant index (write it as DECISION-033)

| Option | How search sees a global IOC | Cost | Overlay handling | Verdict |
|---|---|---|---|---|
| **A. Tenant rows only (now)** | It doesn't, until global processing is turned on | 1 doc per tenant IOC | n/a | ✅ **Do this in step 2.** Global is off in compose, and the backlog is tenant rows |
| **B. One shared global index + subscription filter (later)** | One set of indices `etip_global_iocs_<cat>`. Docs carry `feedIds` (= `sightingSources`). A tenant query searches `etip_<t>_iocs_*,etip_global_iocs_*` with, for global docs only, `terms feedIds: <tenant's enabled subscriptions>` | 1 doc per global IOC, regardless of tenant count | Overlay applied to the result page after the query (read from `tenant_ioc_overlays`). Facets and filters use the global severity (a known limitation) | ✅ **Recommended when global goes live.** Matches DECISION-029 ("store once") |
| C. Fan out a copy to each subscribed tenant | Copy each global IOC into every subscribed tenant's index, with the overlay merged in | N tenants × global IOCs. Subscribe and unsubscribe need bulk index/remove | Exact | ❌ Repeats the N× cost that DECISION-029 removed |

**Recommendation:** accept **A** now. Add **B** as a follow-up session (normalization global worker + es-indexing search) at the time `TI_GLOBAL_PROCESSING_ENABLED` is turned on in production. B also needs the subscription filter that §3.6 shows is missing today.

---

## 5. Flow

**Before**
```
feed → ingestion → NORMALIZE → normalization ── ioc.upsert ──► Postgres iocs (5,934)
                                    └─► ENRICH_REALTIME → ai-enrichment (idle)
                                                              └─► IOC_INDEX {action:'index', no payload}
                                                                     └─► es-indexing: TypeError → job failed
ES: 0 docs.  ⌘K: fetch('/api/v1/search') → 401/404 → [] (silent)
```
**After**
```
feed → NORMALIZE → normalization ── ioc.upsert ──► Postgres iocs
                        ├─► IOC_INDEX {action:'index', payload: IocDocument, jobId ioc-index-<id>-<updatedAtMs>}
                        └─► ENRICH_REALTIME → ai-enrichment ──► IOC_INDEX {action:'update', iocType, payload:{enriched,…}}
ioc-intelligence edits  ──► IOC_INDEX {'update' lifecycle/severity/tags}   (hard delete → 'delete')
super-admin backfill    ──► IOC_INDEX {'index'} for every row, paged per tenant
                                  ▼
es-indexing worker → etip_<tenant>_iocs_<cat>   (update on missing doc: skip, or index if the payload is a full doc)
⌘K + /search → GET /api/v1/search/iocs (JWT) → tenant taken from the token, never from the query
offboarding purge → delete indices etip_<t>_iocs_* and etip_<t>_iocs
```

---

## 6. Changes per module

| Session | Module | File | Change |
|---|---|---|---|
| S151 | packages/shared-utils (**shared, owner OK needed**) | `src/search-index.ts` (new), `src/index.ts` | `IocDocumentSchema` v2, `IocIndexJobSchema`, `toIocDocument(ioc)`, `iocIndexJobId()`, `IOC_INDEX_JOB_OPTIONS`. Moved here because 3 modules need them: normalization, api-gateway, ioc-intelligence (the CLAUDE.md "3 copies" rule) |
| S151 | docs | `docs/DECISIONS_LOG.md` | DECISION-033: option A now, B later |
| S152 🔒 | elasticsearch-indexing-service | `src/schemas.ts` | Re-export the shared schemas. Search params keep `tenantId` optional and ignored |
| | | `src/index-naming.ts` | Add `hash_md5/sha1/sha256/sha512` → `hash`, `unknown` → `other` (keep old keys) |
| | | `src/worker.ts` | Validate with the shared schema. Pass `iocType` to update. Delete by id across the tenant wildcard (`deleteByQuery {ids}` on `etip_<t>_iocs_*`), so the type doesn't matter. Log invalid jobs and drop them |
| | | `src/es-client.ts` | `updateDoc`: on 404, index the doc if the payload passes the full `IocDocumentSchema`; otherwise log a `warn` and return (the job completes). `deleteDoc`/`deleteByIds`: treat 404 as success. Search: `simple_query_string` on `value, normalizedValue, tags` plus a `term` boost on `normalizedValue`. Filter out `lifecycle: revoked, false_positive` unless `includeInactive=true` |
| | | `src/routes/search.ts` (+ small `src/plugins/auth.ts` copied from normalization) | Verify the Bearer JWT. `tenantId = user.tenantId`. Ignore `?tenantId=` |
| | | `src/mappings.ts` | Add `enrichedAt` date, `externalRiskScore` and `enrichmentQuality` integer, `updatedAt` date |
| S153 | normalization | `src/queue.ts` | `createIocIndexQueue()` / `getIocIndexQueue()` (same pattern as the enrich queue), `IOC_INDEX_JOB_OPTIONS` |
| | | `src/config.ts` | `TI_IOC_INDEX_ENABLED` as `enum('true','false')` with a transform (the `TI_BLOOM_ENABLED` pattern at `:24`), default `true` |
| | | `src/service.ts` (after `:568`) | After `repo.upsert`: `add('ioc-index', {action:'index', iocId, tenantId, payload: toIocDocument(upserted)}, {jobId: iocIndexJobId('index', upserted)})`. Fire and forget with `.catch(warn)`, like the enrich job. Send it even when the enrich job is skipped (bloom hit) |
| | | `src/index.ts` | Create and close the queue |
| S154 | ai-enrichment | `src/workers/enrich-worker.ts:94-108` | `action:'update'`, `iocType`, `payload:{enriched:true, enrichedAt, externalRiskScore, enrichmentQuality, confidence, severity}`, jobId `ioc-update-<iocId>-<enrichedAtMs>` |
| | | `src/queue.ts:43` | Add `defaultJobOptions` (removeOnComplete/Fail) |
| | | `src/config.ts:57` | `z.coerce.boolean()` turns `"false"` into `true` (the flag can't be turned off). Use the enum+transform pattern |
| S155 🔒 | api-gateway | `src/routes/search-backfill.ts` (new), `src/app.ts` | `POST /api/v1/gateway/search/backfill` (routed by the nginx `/api/` catch-all, `default.conf:618`; no nginx change needed). `authenticate`, then `role === 'super_admin'` or 403. Body `{tenantId?: uuid, dryRun?: boolean}`. For each tenant with `offboardedAt = null`: page through `prisma.ioc.findMany({where:{tenantId}, orderBy:{id}, cursor, take:500})`, then `queue.addBulk` of `index` jobs. Returns `[{tenantId, dbCount, enqueued}]`. Write an audit log entry |
| S156 | frontend | `src/components/layout/DashboardLayout.tsx:113-124` (⛔ LOCKED block, **owner OK needed**) | Use `api('/search/iocs?q=…&limit=20')` and map `data[]` → `{id: iocId, type, value, severity, category:'iocs'}`. On error, show the error (no silent `[]`). Drop `tenantId` from `use-es-search.ts:220` (the server ignores it) |
| S157 | ioc-intelligence | `src/service.ts`, `src/queue.ts` (new or existing) | After create, update, soft-delete (revoke), bulk, and lifecycle changes: `index` (full doc from the returned row). For `updateMany` bulk operations: re-read the ids, then `addBulk` |
| later | user-management-service | `src/services/external-purge.ts:119` | Also delete the legacy `etip_<t>_iocs` index (the `_*` pattern misses it) |
| later | normalization + es-indexing | option B | The global index |

Direct Prisma reads in api-gateway have a precedent (`src/routes/public/iocs.ts:74`). A super admin can't page other tenants through the normalization API, because it is scoped by JWT tenant.

---

## 7. Data shapes

### 7.1 `IocDocument` v2 (`packages/shared-utils/src/search-index.ts`)
```ts
export const IocDocumentSchema = z.object({
  iocId: z.string().min(1),
  tenantId: z.string().min(1),                 // 'global' reserved for option B
  value: z.string().min(1),
  normalizedValue: z.string().min(1),
  type: z.string().min(1),                     // Prisma IocType, e.g. 'ip', 'hash_sha256'
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  confidence: z.number().int().min(0).max(100),
  lifecycle: z.string().min(1),                // new|active|aging|expired|archived|false_positive|revoked|reactivated
  tlp: z.enum(['WHITE', 'GREEN', 'AMBER', 'RED']),
  tags: z.array(z.string()).default([]),
  mitreAttack: z.array(z.string()).default([]),
  malwareFamilies: z.array(z.string()).default([]),
  threatActors: z.array(z.string()).default([]),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sourceId: z.string().optional(),             // feedSourceId
  enriched: z.boolean().default(false),
  enrichedAt: z.string().datetime().optional(),
  externalRiskScore: z.number().int().min(0).max(100).optional(),
  enrichmentQuality: z.number().int().min(0).max(100).optional(),
  archived: z.boolean().default(false),        // archivedAt != null
  campaignIds: z.array(z.string()).optional(),
  actorIds: z.array(z.string()).optional(),
});

export function toIocDocument(ioc: Ioc): IocDocument   // tlp.toUpperCase(), dates .toISOString(),
                                                        // enriched = enrichedAt != null, sourceId = feedSourceId ?? undefined
```
The frontend fields `id, iocType, value, severity, confidence, tags, firstSeen, lastSeen, enriched, tlp, sourceId` (`use-es-search.ts:58-72`) all still map. The frontend lowercases nothing, so TLP stays uppercase as it does today.

### 7.2 Job payload
```ts
const Base = { iocId: z.string().min(1), tenantId: z.string().min(1) };
export const IocIndexJobSchema = z.discriminatedUnion('action', [
  z.object({ ...Base, action: z.literal('index'),  payload: IocDocumentSchema }),
  z.object({ ...Base, action: z.literal('update'), iocType: z.string().min(1),
             payload: IocDocumentSchema.partial() }),
  z.object({ ...Base, action: z.literal('delete'), iocType: z.string().optional() }),
]);
```
**Job IDs** (deterministic per version. No `:` in ids, following the queue-name convention from RCA #42):
- `index`: `ioc-index-<iocId>-<updatedAtMs>`. Retries of the same write are deduped. A newer version goes through. The backfill and normalization produce the same id for the same row version.
- `update`: `ioc-update-<iocId>-<enrichedAtMs>`
- `delete`: `ioc-delete-<iocId>`

**Job options** (`IOC_INDEX_JOB_OPTIONS`): `attempts: 3`, `backoff: {type:'exponential', delay: 5000}`, `removeOnComplete: {count: 1000}`, `removeOnFail: {count: 5000}`.

---

## 8. Tests (write them first)

| Module | Tests |
|---|---|
| shared-utils | `toIocDocument`: lowercase TLP → upper; `info` severity kept; enriched follows enrichedAt; dates are ISO. Schema rejects `index` without payload and `update` without iocType. `iocIndexJobId` is stable for the same `updatedAt` and changes when it changes. |
| es-indexing (`tests/worker.test.ts`, `ioc-indexer.test.ts`, `search.routes.test.ts`, `per-type-indices.test.ts`) | `hash_sha256` → `_iocs_hash`. Update on a missing doc with a partial payload: no throw, warn logged, no doc created. Update on a missing doc with a full payload: doc indexed. Delete of a missing doc: resolves. Delete removes the doc from any category. Invalid job dropped. **Search ignores `?tenantId=other` and uses the JWT tenant.** No token → 401. `q='http://a:b/c'` → 200, not 503. Revoked hidden by default. |
| normalization (`tests/service.test.ts`) | After an upsert, `IOC_INDEX.add` is called once with `action:'index'`, a full valid payload, and the versioned jobId. It is also called when enrichment is skipped. With the flag set to `'false'`, it is not called. An error from the queue does not fail the batch. |
| ai-enrichment (`tests/enrich-downstream.test.ts:159`, `queue-producers.test.ts`, `tests/e2e/pipeline-downstream-flow.test.ts:88`) | Send `action:'update'` with `iocType` and the payload fields. JobId includes `enrichedAt`. `TI_IOC_INDEX_ENABLED='false'` → no queue. |
| api-gateway (new `tests/search-backfill.test.ts`) | Non-super-admin → 403. Pages across more than 500 rows. Skips offboarded tenants. `dryRun` enqueues nothing. Running it twice produces the same jobIds. Counts are returned per tenant. |
| frontend (`__tests__/use-es-search.test.ts` + new layout search test) | ⌘K calls `/search/iocs` through `api()`. Maps to `SearchResult` with `category:'iocs'`. An error is shown, not a silent `[]`. |
| ioc-intelligence | Create, update, revoke, and bulk each add index jobs with the versioned id. |

## 9. Acceptance checks (run on the VPS, `cd /opt/intelwatch && set -a && . ./.env && set +a`)

```bash
# 0. Baseline — which table holds the 5,934? (run before S151)
docker exec etip_postgres psql -U "${TI_POSTGRES_USER:-etip_user}" -d "${TI_POSTGRES_DB:-etip}" -c \
 "SELECT tenant_id, count(*) FROM iocs GROUP BY 1 ORDER BY 2 DESC;" -c "SELECT count(*) FROM global_iocs;"

# 1. ES doc count per tenant (after the backfill; must equal the SQL count above)
docker exec etip_elasticsearch curl -s -u "elastic:$TI_ELASTICSEARCH_PASSWORD" \
  "localhost:9200/etip_<TENANT_ID>_iocs_*/_count?ignore_unavailable=true"
docker exec etip_elasticsearch curl -s -u "elastic:$TI_ELASTICSEARCH_PASSWORD" \
  "localhost:9200/_cat/indices/etip_*?v&h=index,docs.count"

# 2. Queue drained, few failures
docker exec etip_redis redis-cli -a "$TI_REDIS_PASSWORD" --no-auth-warning LLEN bull:etip-ioc-indexed:wait
docker exec etip_redis redis-cli -a "$TI_REDIS_PASSWORD" --no-auth-warning ZCARD bull:etip-ioc-indexed:failed

# 3. Backfill (super-admin token)
curl -s -X POST https://intelwatch.in/api/v1/gateway/search/backfill \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" -H 'content-type: application/json' -d '{"dryRun":true}'
curl -s -X POST https://intelwatch.in/api/v1/gateway/search/backfill \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" -H 'content-type: application/json' -d '{}'
#    Run it again: the counts stay the same (idempotent). Tenant-admin token → 403.

# 4. Search works, tenant-isolated
curl -s "https://intelwatch.in/api/v1/search/iocs?q=<known-ioc-value>&limit=5" -H "Authorization: Bearer $TENANT_TOKEN"
#    → data.total >= 1
curl -s "https://intelwatch.in/api/v1/search/iocs?tenantId=<OTHER_TENANT>&limit=1" -H "Authorization: Bearer $TENANT_TOKEN"
#    → only the caller's own docs (tenantId in hits == caller's)

# 5. Live path: a new feed IOC is searchable in < 60 s with enrichment OFF
#    (docker logs etip_es_indexing --since 5m | grep -c 'IOC index job failed'  → 0)
```
**UI:** type a known IP in ⌘K → it shows under "Indicators of Compromise". The `/search` page shows real facets and no demo banner.

## 10. Rollback

- Before each session: `git tag safe-point-2026-MM-DD-s15x-search`. Revert the PR, or `git reset --hard <tag>`, then redeploy.
- **Stop producing without a deploy:** set `TI_IOC_INDEX_ENABLED=false` for normalization (and ai-enrichment after S154 fixes the coercion bug). Then `docker compose -f docker-compose.etip.yml up -d etip_normalization etip_enrichment`.
- **Clear the queue:** `docker exec etip_redis redis-cli -a … DEL bull:etip-ioc-indexed:wait` (or drain it with a BullMQ `obliterate` script).
- **Throw away the index:** `curl -X DELETE …/etip_*_iocs_*` removes only derived data. Postgres stays the source of truth. Re-run the backfill to rebuild.
- The search auth change (S152) is the one change that must **not** be rolled back once ES has docs. If it is reverted, delete the indices too.

## 11. Session breakdown

Order: consumer first, then producers, then backfill, then UI. Don't start a session until the one before it is green in production.

| S | Module | Task | Size |
|---|---|---|---|
| 150 | shared-utils + DECISION-033 (owner OK for the shared change) | Shared schema, mapper, jobId helper, job options + tests. Write the decision | S |
| 151 🔒 | elasticsearch-indexing-service | Type map, update/delete robustness, JWT tenant in search, safe query, mappings | M |
| 152 | normalization | Enqueue `index` after the tenant upsert + flag | M |
| 153 | ai-enrichment | `update` action, job options, fix the flag coercion | S |
| 154 🔒 | api-gateway | Super-admin backfill route. Run it on production. Verify counts (§9) | M |
| 155 | frontend (owner OK for the LOCKED block) | ⌘K through `api()` + mapping + error state | S |
| 156 | ioc-intelligence | Index jobs on analyst writes | M |

This is 7 sessions where the roadmap planned 4 (S150–S153). S156 and S157 are what make ⌘K usable and keep edits in sync.

## 12. Owner decisions needed

1. **DECISION-033:** option A now, with B when global processing goes live (§4)?
2. Is it OK to add `search-index.ts` to **packages/shared-utils** (a shared package change)? The alternative is to copy the schema and mapper into 3 modules.
3. Is it OK to edit the **⛔ LOCKED** GlobalSearch data block in `DashboardLayout.tsx`? The shared-ui component itself does not change.
4. Is it OK for the api-gateway backfill to read `iocs` directly with Prisma (precedent: public API routes)? The alternative is a new super-admin paging endpoint in normalization.
5. Should revoked and false-positive IOCs be hidden from search by default (proposed: yes, with `includeInactive=true` to show them)? Should archived IOCs stay searchable (proposed: yes, flagged `archived`)?
6. Should the per-subscription filter for global IOCs (§3.6) also be fixed in `getIocsForTenant` as part of option B?

## 13. Risks

| Risk | Mitigation |
|---|---|
| Cross-tenant read once docs exist (§3.4) | S152 ships before S153 and S155. The acceptance check in §9 step 4 |
| Queued index jobs recreate a tenant's index after an offboarding purge (`ensureTypeIndex` creates indices on demand) | Backfill skips offboarded tenants. Normalization stops once `feedSource` rows are deleted. `update` never creates partial docs. After a purge, check `_cat/indices/etip_<t>_*` is empty. The purge scheduler isn't wired yet (docs/S148_OFFBOARDING_PURGE.md), so this is future-proofing |
| Legacy `etip_<t>_iocs` index (no suffix) is left behind by the purge pattern `etip_<t>_iocs_*` | Later fix in user-management-service (§6) |
| `refresh:'wait_for'` on every doc (`es-client.ts:167`) slows the backfill | 5,934 docs at concurrency 5 takes minutes, which is fine. If the volume grows, backfill through `bulkIndexMultiType` instead |
| Single-node ES with `number_of_replicas: 1` (`mappings.ts:112`) makes the cluster status yellow | Doesn't block search. Set replicas to 0 in a later ops session |
| Bulk `updateMany` writes (retention archive, ioc-intelligence bulk) don't emit per-row jobs | S157 re-reads the ids. For retention, the next backfill run corrects the `archived` flag. Log it as a known lag |
| ES down, so producers pile up jobs in Redis | Jobs are small. `removeOnComplete/Fail` caps them. BullMQ retries 3× with backoff, and the backfill repairs gaps |
| Global IOCs are invisible to search under option A | Stated in DECISION-033. Option B is scheduled for the day `TI_GLOBAL_PROCESSING_ENABLED=true` |
