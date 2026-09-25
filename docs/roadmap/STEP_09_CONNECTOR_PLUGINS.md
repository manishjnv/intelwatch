# Step 9 — Connector plug-in interface

**Status:** proposed spec (written 2026-09-25). Roadmap: `docs/ROADMAP_S149_PLUS.md` §3 step 9, §5 "Connectors", §7 (OpenCTI model).
**Needs first:** step 3 sessions S156–157 (integration-service data in Postgres) before the integration half; step 7 is not required (this is a code change, not a runtime change).

---

## 1. Goal

One small, common shape for every **connector**:
- **Source connectors** (ingestion): pull data from a feed and turn it into articles or IOCs.
- **Sink connectors** (integration-service): push ETIP events out to a SIEM, ticketing tool or webhook.

Each connector is one file that declares: `configSchema`, `fetch`/`send`, `map`, `health`. A **registry** lists them. Adding a feed like CERT-In, or a tool like ANY.RUN, becomes **one small PR**: a connector file, a fixture, a test, and one registry line.

## 2. Why now

- The next features are mostly connectors: F8 CERT-In feed, F5 sandbox (ANY.RUN / Hybrid Analysis / Triage), F2 SIEM push of detection rules.
- Today one new feed touches ~8 places in 6+ files (§3.1), and the lists have already drifted apart: some connectors exist but **cannot be used** (§3.2).
- A contract test stops each new connector from re-inventing error handling, cursors, secrets and timeouts.

---

## 3. Current state (verified)

### 3.1 Ingestion — 13 source connectors
Files in `apps/ingestion/src/connectors/`: `rss.ts` (99 lines), `nvd.ts` (200), `taxii.ts` (237), `rest-api.ts` (202), `misp.ts` (859), `bulk-file.ts` (348), `threatfox.ts` (181), `urlhaus.ts` (150), `malwarebazaar.ts` (177), `feodo.ts` (144), `cisa-kev.ts` (156), `first-epss.ts` (176), `otx.ts` (267).

The good news: they already share a shape. Every one is `class XConnector { constructor(logger); fetch(opts): Promise<ConnectorResult> }`, and `ConnectorResult` / `FetchedArticle` are defined once in `rss.ts` L5–20. IOC feeds put the IOC in `rawMeta.iocValue`.

What is **not** shared — adding a connector today means editing all of these:

| Place | File:lines | What it does |
|---|---|---|
| Import + instantiate 13 classes | `workers/feed-fetch.ts` L7–19, L116–128, L141–145, L215–228 | Hand-wired dependency list |
| Dispatch | `workers/feed-fetch.ts` L369–447 `routeToConnector` switch | Maps `parseConfig` keys to each connector's options by hand |
| "Is it an IOC feed?" | `workers/feed-fetch.ts` L263 hard-coded list of 10 types | Skips the article pipeline |
| Cursors | `workers/feed-fetch.ts` L280–292 (cisa_kev `lastDateAdded`), L296–306 (otx `modifiedSince`), L324–334 (misp `publishedAfter`) | Three different special cases |
| Queue lane | `queue.ts` L37–58 `mapFeedTypeToQueue` | Unknown types fall to the RSS lane |
| API validation | `schema.ts` L3–6 `FEED_TYPES` (10 types) | Create/update feed |
| DB column | `prisma/schema.prisma` L218–235 `enum FeedType` (16 values), used by `FeedSource.feedType` L251 | Postgres enum |
| Validate-URL route | `routes/feed-validation.ts` L13 (5 types) | Pre-create check |
| Global path | `workers/global-fetch-base.ts` L19–25, L90–96, L237–275; `schedulers/global-feed-scheduler.ts` L21–29; `schemas/catalog.ts` L10 (5 types) | Separate 5-connector switch |
| UI | `apps/frontend/src/components/command-center/FeedsTab.tsx` L211, `FeedSelectionStep.tsx` L143–146 | Hard-coded options |

`feed-fetch.ts` is 542 lines (limit 400) mostly because of this wiring.

### 3.2 Drift and bugs found while verifying
1. **Four connectors can't be used for a tenant feed.** `threatfox`, `urlhaus`, `malwarebazaar`, `feodo` have code and tests and a `case` in the switch, but are missing from both `FEED_TYPES` (API rejects them) and the Postgres `FeedType` enum (DB rejects them). `csv_bulk`, `plaintext`, `jsonl`, `cisa_kev`, `first_epss`, `otx` are in the DB enum but not in `FEED_TYPES`, so the API can't create them either.
2. **Global MISP and REST workers share one queue but use different connectors.** `workers/global-misp-worker.ts` L13 listens on `FEED_FETCH_GLOBAL_REST` with `connectorType: 'misp'`; `global-rest-worker.ts` listens on the same queue with `'rest'`. `global-fetch-base.ts` L127 picks the connector from the **worker**, not from the catalog entry. So a REST catalog job taken by the MISP worker is fetched with `MISPConnector` (and vice versa), fails, and after 5 failures the feed is auto-disabled (L198–203). Both workers are started in `index.ts` L68–74. Fix this in session 9-C, or on its own earlier; it does not need the rest of step 9.
3. The global catalog seeds CISA KEV, OTX, URLhaus and MalwareBazaar as generic `feedType: 'rest'` (`services/global-catalog-seeder.ts` L32, L45, L51, L57), so the dedicated connectors are only used on the tenant path. The global path writes only `global_articles` (`global-fetch-base.ts` L135, skips items without `url`); there is **no global IOC-list path** yet.
4. **No SSRF guard on tenant-supplied URLs.** `CreateFeedSchema.url` is `z.string().url()` (`schema.ts` L17). `POST /api/v1/feeds/validate` fetches any URL from inside `etip_network` and returns status, title and item count (`routes/feed-validation.ts` L53–105). admin, analytics and caching have **no in-service auth** (they rely on nginx `auth_request`). A tenant URL like `http://etip_admin:3022/...` is not blocked. The only guard in the repo is a string-regex check for public-API webhooks (`packages/shared-types/src/public-api.ts` L123–141). 🔒 Treat as a potential SSRF path — verify and fix before step 9 (a small ingestion session), not as part of it.

### 3.3 Integration-service — outbound
- Types: `schemas/integration.ts` L5–12 `IntegrationTypeEnum` = splunk_hec, sentinel, elastic_siem, servicenow, jira, webhook. Per-type config: SIEM discriminated union L38–67, webhook L71–77, ticketing union L81–102.
- Dispatch by `switch`: SIEM `services/siem-adapter.ts` L108–117; ticketing `services/ticketing-service.ts` L46–49, L101–104, L126–128.
- Event flow: alerting (`workers/alert-worker.ts` L61) and correlation (`workers/correlate.ts` L82) enqueue `INTEGRATION_PUSH`; `services/event-router.ts` L98–116 sends each event to SIEM and/or webhook. **Ticketing is not event-driven** (only via routes).
- Retries: SIEM retries inline with `sleep` inside the job (`siem-adapter.ts` L45–76); webhooks have their own retry engine + DLQ (`webhook-retry.ts`). The BullMQ job itself uses `attempts: 1` (`event-router.ts` L77–81).
- All integrations, deliveries and DLQ live in memory (`services/integration-store.ts`; W4, fixed by step 3).
- Sentinel uses the Azure **HTTP Data Collector API** (`siem-adapter.ts` L152–177, `.../api/logs?api-version=2016-04-01`). Microsoft announced its retirement for **14 Sep 2026** — confirm; if retired, this adapter no longer works and needs a Logs Ingestion API (DCR) connector.
- Two other outbound senders exist outside integration-service: api-gateway public webhooks (Prisma-backed, HMAC, 6 attempts; `apps/api-gateway/src/workers/webhook-delivery.ts` L120) and alerting notifications (`apps/alerting-service/src/services/notifier.ts` L32–36: email, slack, webhook). Out of scope here; see owner decision 4.

---

## 4. Target architecture

```
                    packages/connector-sdk  (types + registry + safeFetch + contract tests)
                              ▲                                   ▲
  apps/ingestion              │                 apps/integration-service
  connectors/                 │                 connectors/
   rss.ts nvd.ts ... cert-in.ts                  splunk-hec.ts sentinel.ts jira.ts webhook.ts ...
        │   (each exports one SourceConnector)          │  (each exports one SinkConnector)
        ▼                                               ▼
  connectors/registry.ts  ── get(feedType) ──┐   connectors/registry.ts ── get(integration.type)
        │                                    │          │
  feed-fetch worker (tenant)   global-fetch worker      event-router worker (INTEGRATION_PUSH)
   1 validate config (Zod)      same 5 steps            1 validate config
   2 fetch(config, cursor)                              2 map(event) -> request   (pure)
   3 map(item) per item  (pure)                         3 send(request) one attempt
   4 output 'articles' -> ArticlePipeline               4 retryable? -> BullMQ backoff, else DLQ
          'iocs'     -> NORMALIZE queue                 5 log delivery
   5 save nextCursor in parseConfig.cursor
```

Rules:
- **Connectors never touch the DB or queues.** The worker does that. Connectors get a small `ctx` (logger, `safeFetch`, abort signal, clock).
- **`map` is pure** (no I/O), so it can be tested offline from a fixture.
- **One attempt per call.** Retries, backoff and DLQ belong to the worker (BullMQ), not the connector.
- **Registry is a static list of imports** (no folder scanning, no dynamic loading). Easy to read, works with `tsc -b`.

### 4.1 Interface (in `packages/connector-sdk/src/types.ts`)
```ts
import type { z } from 'zod';
export interface ConnectorCtx {
  logger: { info(o: object, m?: string): void; warn(o: object, m?: string): void; error(o: object, m?: string): void };
  fetch: SafeFetch;            // SSRF-guarded, timeout, max body size; tests inject a stub
  signal: AbortSignal;
  now(): Date;
}
export interface HealthResult { ok: boolean; latencyMs: number; message: string }

interface ConnectorBase<C> {
  id: string;                  // snake_case, <= 20 chars (fits feed_type varchar(20)); never renamed
  version: string;             // semver of the mapping; bump when output changes
  displayName: string;
  description: string;
  configSchema: z.ZodType<C>;  // validated on create AND before every run
  secretFields: readonly string[];  // encrypted at rest, redacted in logs/API/UI
  exampleConfig: C;            // used by the contract test and the UI form
  health(config: C, ctx: ConnectorCtx): Promise<HealthResult>; // never throws
}

export interface SourceConnector<C = unknown, R = unknown> extends ConnectorBase<C> {
  kind: 'source';
  output: 'articles' | 'iocs'; // articles -> AI triage pipeline; iocs -> straight to NORMALIZE
  lane: 'rss' | 'nvd' | 'stix' | 'rest';   // which fetch queue (queue names stay in shared-utils)
  scopes: readonly ('tenant' | 'global')[]; // 'global' only for output 'articles' until a global IOC path exists
  defaultSchedule: string;     // cron
  fetch(config: C, cursor: string | null, ctx: ConnectorCtx):
    Promise<{ items: R[]; nextCursor: string | null; feedTitle?: string }>;
  map(item: R): FetchedArticle | null;     // null = skip item
}

export interface SinkConnector<C = unknown> extends ConnectorBase<C> {
  kind: 'sink';
  category: 'siem' | 'ticketing' | 'webhook' | 'sandbox';
  events: readonly string[];   // TriggerEvent values it accepts
  map(event: { type: string; tenantId: string; payload: Record<string, unknown> }, config: C):
    { url: string; method: 'POST' | 'PUT'; headers: Record<string, string>; body: string };
  send(req: ReturnType<SinkConnector<C>['map']>, config: C, ctx: ConnectorCtx):
    Promise<{ ok: boolean; status: number; retryable: boolean; externalId?: string; error?: string }>;
  poll?(externalId: string, config: C, ctx: ConnectorCtx):   // ticket status sync, sandbox report
    Promise<{ done: boolean; result?: Record<string, unknown> }>;
}
```
`FetchedArticle` moves from `rss.ts` into the SDK unchanged (re-exported from `rss.ts` so nothing else breaks).

`safeFetch` (`packages/connector-sdk/src/safe-fetch.ts`): resolves DNS and blocks loopback, private, link-local and ULA addresses and single-label hosts (docker names like `etip_admin`); re-checks each redirect (max 3); timeout (default 30 s); max body size (default 20 MB, per-connector override). Sources may use `http:`; sinks must use `https:`. Robust version pins the checked IP in an undici `Agent` `connect.lookup` to stop DNS-rebinding.

### 4.2 Registry
```ts
// apps/ingestion/src/connectors/registry.ts
import { ConnectorRegistry } from '@etip/connector-sdk';
import { rss } from './rss.js'; import { nvd } from './nvd.js'; /* ... */ import { certIn } from './cert-in.js';
export const sources = new ConnectorRegistry([rss, nvd, taxii, restApi, misp, csvBulk, plaintext, jsonl,
  threatfox, urlhaus, malwarebazaar, feodo, cisaKev, firstEpss, otx, certIn]);
```
`ConnectorRegistry` checks at startup that ids are unique and valid, and offers `get(id)`, `list(filter)`, `ids()`.
From the registry we derive what is hard-coded today: `FEED_TYPES` (API Zod enum), queue lane, "IOC feed?" flag, validate-route types, catalog types, and a new `GET /api/v1/feeds/connectors` (id, displayName, JSON schema of config, secret fields) so the UI builds its dropdown and form from data.

---

## 5. Adding a connector in one small PR

**Example A — CERT-In advisories (source, global).**
1. `apps/ingestion/src/connectors/cert-in.ts` (< 200 lines): `id: 'cert_in'`, `output: 'articles'`, `lane: 'rss'` or `'rest'`, `scopes: ['global','tenant']`, `defaultSchedule: '0 */6 * * *'`, config `{ url, maxItems }`. `fetch` reads the advisory list; `map` builds `FetchedArticle` (title, advisory text, url, publishedAt, `rawMeta.advisoryId`, `rawMeta.cves`). The source format must be checked in the session: prefer an RSS/JSON endpoint if CERT-In offers one; otherwise parse the HTML list with a small regex parser (no new library unless the owner agrees).
2. `apps/ingestion/tests/fixtures/cert-in/*.html|xml` (saved sample) + `expected.json`.
3. `apps/ingestion/tests/connectors/cert-in.contract.test.ts`: `runSourceContract(certIn, { fixture })` + 2–3 specific tests (CVE ids pulled out, date parsing).
4. One line in `registry.ts`.
5. Catalog row (data, not code): super admin adds it in the Feed Catalog UI or via `scripts/seed-global-feeds.ts`.
No change to workers, queues, schema, Prisma or frontend.

**Example B — ANY.RUN sandbox (sink with `poll`).** This is F5 and belongs to **malware-intel**, not step 9. Step 9 only proves the interface fits: `category: 'sandbox'`, `send` submits a hash/URL and returns `externalId` (task id), `poll` returns the report when done, `secretFields: ['apiKey']`. The contract test runs with a stubbed API. F5 then adds the file plus a malware-intel worker that calls `send`/`poll`.

---

## 6. Migration plan for existing connectors

1. **Wrap, don't rewrite.** Each of the 13 classes gets a thin `SourceConnector` object in the same file: `configSchema` = the `parseConfig` keys its `case` in `routeToConnector` reads today (`feed-fetch.ts` L371–444), `fetch` calls the existing class, `map` returns the already-mapped `FetchedArticle` unchanged. `bulk-file.ts` exports 3 ids (`csv_bulk`, `plaintext`, `jsonl`); `taxii` exports `stix` and `taxii`; `misp` handles `format: 'misp_feed'` inside its `fetch`.
2. **One cursor rule.** Store the cursor in `parseConfig.cursor`. For backward compatibility the three existing wrappers **read** the old keys (`lastDateAdded`, `modifiedSince`, `publishedAfter`) when `cursor` is missing, and the worker writes both for one release.
3. **Swap dispatch.** `feed-fetch.ts` uses `sources.get(feed.feedType)`; delete the switch, the 13 instances and the type list. `queue.ts` uses `connector.lane`. `schema.ts` derives `FEED_TYPES` from the registry. Behaviour must be identical — the existing 13 connector test files stay and must pass.
4. **Global path.** `global-fetch-base.ts` picks the connector from **`entry.feedType`** via the registry (fixes bug §3.2-2). Delete `global-misp-worker.ts`; the REST-lane worker handles MISP entries. Map catalog aliases `rest → rest_api` in the registry lookup. Leave the 4 catalog rows as `rest` until a global IOC path exists.
5. **DB column** (owner decision 2): change `feed_sources.feed_type` from the Postgres enum to `varchar(20)` so new connectors need no schema change. Must be a hand-written SQL step run before deploy (`ALTER TABLE feed_sources ALTER COLUMN feed_type TYPE varchar(20) USING feed_type::text;`), then `schema.prisma` changes to `String @db.VarChar(20)` so `prisma db push` sees no diff. **Do not** let `db push --accept-data-loss` (deploy.yml L197) make this change on its own — it may drop and recreate the column. Take a DB backup first.
6. **Integration-service** (after step 3): turn `siem-adapter.ts`, `ticketing-service.ts` and `webhook-service.ts` into 6 sink files (`splunk-hec`, `sentinel`, `elastic-siem`, `servicenow`, `jira`, `webhook`). `event-router.ts` dispatches through the registry, uses BullMQ `attempts` + exponential backoff for `retryable` results, and moves the rest to the persisted DLQ. `IntegrationTypeEnum` and the config unions are derived from the registry. `secretFields` drive the existing `credential-encryption.ts`.

---

## 7. Changes file by file

| Session | Files | Notes |
|---|---|---|
| A connector-sdk (new package) | `packages/connector-sdk/{package.json,tsconfig.json}`, `src/types.ts`, `src/registry.ts`, `src/safe-fetch.ts`, `src/contract/source.ts`, `src/contract/sink.ts`, `src/index.ts`, `tests/*` | Deps: `zod` only; `vitest` as peer/dev dep for `contract/*`. New-package checklist: root `tsconfig.build.json`, `Dockerfile` deps COPY line, lockfile, PROJECT_STATE |
| B ingestion (tenant path) | `connectors/registry.ts` (new), 13 connector files (add wrapper export, ~20–40 lines each), `workers/feed-fetch.ts`, `queue.ts`, `schema.ts`, `routes/feed-validation.ts`, `tests/connectors/*.contract.test.ts` | L-sized → split: B1 = registry + 7 simple IOC connectors; B2 = rss/nvd/taxii/rest/misp/bulk + dispatch swap |
| C ingestion (global path) | `workers/global-fetch-base.ts`, `workers/global-misp-worker.ts` (delete), `index.ts`, `schedulers/global-feed-scheduler.ts`, `schemas/catalog.ts` | Bug fix §3.2-2 lands here; can be pulled forward on its own |
| D prisma | `prisma/schema.prisma`, `scripts/migrations/feed-type-varchar.sql` (new), `docs/runbooks/` note | 🔒 data change, owner approval, backup first |
| E ingestion API + frontend | `routes/connectors.ts` (new `GET /api/v1/feeds/connectors`), then frontend dropdown/form from it (separate frontend session) | Two sessions (one module each) |
| F integration-service | `connectors/*.ts` (6 new), `connectors/registry.ts`, `services/event-router.ts`, `schemas/integration.ts`, remove old adapters after tests move | L → split F1 (SIEM 3), F2 (ticketing 2 + webhook) |
| G ingestion | `connectors/cert-in.ts` + fixture + test | The proof: one small PR |

## 8. Tests

**Contract test every connector must pass** (`runSourceContract` / `runSinkContract`, one line per connector):
1. Manifest: id matches `^[a-z][a-z0-9_]{1,19}$` and is unique; `version` is semver; every `secretFields` key exists in `configSchema`.
2. Config: `exampleConfig` passes `configSchema`; `{}` fails if the schema has required fields.
3. `map` is pure: same fixture item → deep-equal output twice; runs with a `ctx.fetch` that throws (no network).
4. Output shape: every non-null `map` result passes the `FetchedArticle` Zod schema; for `output: 'iocs'`, `rawMeta.iocValue` is a non-empty string.
5. Golden file: fixture → mapped output equals `expected.json` (catches mapping drift; update with a `version` bump).
6. `fetch` with a stubbed `ctx.fetch` serving the fixture: returns items and `nextCursor` (string or null); calling again with that cursor asks only for newer data (stub checks the request).
7. Errors: stub 500 or timeout → throws `AppError` (never raw `Error`), marked retryable; stub 401/403 → not retryable; abort signal → rejects within 1 s.
8. `health`: 200 stub → `ok: true`; network error → `ok: false`; never throws.
9. Secrets: run fetch/send with a config whose secret values are unique strings; captured logs and thrown messages must not contain them.
10. Sinks only: `map` output URL is `https:`; for each declared event, `map` succeeds; `send` 2xx → `ok`, 4xx → `retryable: false`, 5xx/timeout → `retryable: true`; if `poll` exists, it handles "not ready" and "done".

`safeFetch` tests: blocks `127.0.0.1`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`, `::1`, `fd00::/8`, `fe80::`, `localhost`, single-label names, and a redirect from a public host to a private one; allows a public host.

Existing suites stay: 13 connector tests, `feed-fetch-worker.test.ts`, `global-*-worker.test.ts`, `queue-lanes.test.ts`, integration `siem-adapter.test.ts`, `event-router.test.ts`, `webhook-service.test.ts`. Add a regression test: a REST catalog entry is never fetched by the MISP connector.

## 9. Acceptance checks
- All 13 existing connectors pass the contract test; all existing tests green; `feed-fetch.ts` < 400 lines.
- `grep -n "case 'threatfox'" apps/ingestion/src` finds nothing (dispatch is registry-only).
- A tenant can create a `threatfox` feed through the API and it fetches (after session D).
- VPS: global feed failure counts stop climbing for REST/MISP catalog rows (`GlobalFeedCatalog.consecutiveFailures`).
- CERT-In PR diff touches only: connector file, fixture, test, one registry line.
- `POST /api/v1/feeds/validate` with `http://etip_admin:3022/health` is rejected.

## 10. Rollback
- Sessions B/C/F are code-only: `git revert` of the session commit; old switch returns. Tag `safe-point-<date>-step9-<session>` before each.
- Session D: reverse SQL is `ALTER TABLE feed_sources ALTER COLUMN feed_type TYPE feed_type_enum USING feed_type::feed_type_enum;` — only works if no row holds a value missing from the enum, so run it before any new-type feeds exist, else restore the backup.
- Cursor keys are written in both old and new form for one release, so reverting code doesn't lose incremental position.

## 11. Session breakdown
| Session | Module | Task | Size |
|---|---|---|---|
| 9-0 🔒 | ingestion | SSRF guard for feed URLs + validate route (can go right away, before step 9) | S |
| 9-A | connector-sdk (new) | Types, registry, safeFetch, contract kits | M |
| 9-B1 | ingestion | Registry + wrap 7 IOC connectors + contract tests | M |
| 9-B2 | ingestion | Wrap 6 others, swap dispatch, cursor rule, derive FEED_TYPES | M |
| 9-C | ingestion | Global path via registry; delete MISP worker (bug fix) | M |
| 9-D 🔒 | prisma | `feed_type` enum → varchar(20), backup + manual SQL | S |
| 9-E1 / 9-E2 | ingestion / frontend | Connectors endpoint / UI from it | S / M |
| 9-F1 / 9-F2 | integration-service | SIEM sinks / ticketing + webhook sinks, BullMQ retries | M / M |
| 9-G | ingestion | CERT-In connector (proof of "one small PR") | S |

## 12. Owner decisions needed
1. New shared package `packages/connector-sdk` (recommended: 2 apps now, malware-intel next — 3 users). Alternative: copy the types into each app (breaks the "one interface" goal).
2. `feed_type` enum → `varchar(20)` (recommended) vs. add enum values per connector (each connector PR then touches `prisma/`).
3. Sentinel: move to the Logs Ingestion API now (if the old API is retired) or drop Sentinel until a customer asks.
4. Outbound duplication: keep api-gateway public webhooks and alerting notifications separate (recommended for now), or later move them onto sink connectors.
5. HTML parsing for CERT-In if no feed exists: small regex parser (recommended) vs. adding a library.
6. Global IOC path (so `output: 'iocs'` connectors can run globally) — separate future step.

## 13. Risks
| Risk | Mitigation |
|---|---|
| Wrapping changes behaviour silently (option mapping, cursor keys) | Wrappers copy the exact `routeToConnector` mapping; existing tests unchanged; golden files |
| Enum → varchar migration loses data | Manual SQL + backup; never via `db push --accept-data-loss` |
| `safeFetch` blocks a legit feed on a private address (self-hosted MISP/TAXII in a customer LAN) | Per-tenant allow-list later; today ETIP can't reach customer LANs anyway |
| Moving retries to BullMQ changes timing (SIEM inline sleep → queued backoff) | Same attempt count and delays; tests on delay values |
| Registry grows into a plug-in framework (dynamic loading, versions, marketplace) | Out of scope: static imports only (Simplicity Rule) |
| Integration work collides with step 3 persistence work | Do 9-F only after S156–157 are deployed |
