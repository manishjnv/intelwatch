# Step 3 — No business data in memory (Phase 1, S154–S159)

**Written:** 2026-09-25. **Status:** spec, not started. **Parent:** docs/ROADMAP_S149_PLUS.md §3 step 3, §4 Phase 1. **Follows:** DECISION-027 (Postgres for business entities, Redis JSON for config, memory only for caches). It ends DECISION-013 for the modules below. DECISION-022 (correlation-engine in memory + Redis checkpoint) stays, but depends on decision D1.

---

## 1. Goal

Every restart or deploy of a service must keep what users created: alert rules, channels, alerts, integrations, webhook retries, tickets, DRP assets and findings, hunts. After this step, the only things held in process memory are caches, rate-limit counters and short buffers that can be rebuilt.

## 2. Why now

- Every deploy recreates all app containers (`.github/workflows/deploy.yml:192`, `--force-recreate`). So today every deploy **wipes** alerting, integration, DRP and hunting data.
- Step 7 (merge services into ~7 processes) is only safe when services hold no state.
- Step 4 (RLS) should cover the new tables from day one, so the tables must exist first.

## 3. Current state (verified 2026-09-25)

### 3.1 How persistence works today

| Fact | Evidence |
|---|---|
| One shared Prisma schema, 36 models, 1,064 lines | `prisma/schema.prisma` (datasource reads `TI_DATABASE_URL`, line 9–12) |
| Deploy syncs schema with `prisma db push --accept-data-loss`, **after** app containers are recreated, and **continues even if all 5 tries fail** | `deploy.yml:192` (recreate) then `deploy.yml:195–206` (push) |
| `prisma/migrations/0001–0004` exist but deploy never runs them | DEPLOYMENT_RCA.md:452–454 (switched to `db push`) |
| Prisma client is generated in the image | `Dockerfile:61–63` |
| Only 12 containers get `TI_DATABASE_URL`: api, ingestion, normalization, enrichment, ioc, actor, malware, vuln, graph, user-mgmt, customization, billing | `docker-compose.etip.yml:236…988`. **alerting, integration, drp, hunting, analytics, caching, onboarding, reporting have none** |
| Billing is the only finished dual-mode migration | `apps/billing-service/src/repository.ts` (4 repo classes), `src/index.ts:25–33` (repos always passed), `src/services/plan-store.ts:190–225` |
| Billing pattern detail: on any DB error the store **silently falls back** to its in-memory Map, per call | `plan-store.ts:212–225` (`catch { /* fall through */ }`) |
| `@etip/shared-persistence` (`RedisJsonStore`) exists but **no app imports it** | `packages/shared-persistence/src/redis-json-store.ts`; grep of `apps/*/src` finds 0 users |
| `RedisJsonStore` keys expire after **7 days** by default and save with a 5 s debounce | `redis-json-store.ts:75–76` |
| Redis runs `--maxmemory 256mb --maxmemory-policy allkeys-lru` | `docker-compose.etip.yml:47–48` |

The last row matters: with `allkeys-lru`, Redis may delete **any** key when it fills up, including BullMQ job keys and any "durable" JSON we store there. Redis JSON is only safe for business data after the owner changes this (see §11, decision D1).

### 3.2 Store inventory

Legend: **PG** = Postgres table · **RJ** = Redis JSON (config/state) · **MEM** = keep in memory (cache/buffer/derived) · **FIX** = bug to fix first.

**alerting-service** (no DB today, stores are synchronous)

| Store | File:line | What it holds | Class |
|---|---|---|---|
| RuleStore | `src/services/rule-store.ts:39–40` | alert rules | PG |
| ChannelStore | `src/services/channel-store.ts:32–33` | email/Slack/webhook channels (Slack URL and webhook `secret` are secrets, `schemas/alert.ts:141–151`) | PG, encrypted config |
| AlertStore | `src/services/alert-store.ts:74–75` | alerts + lifecycle state | PG |
| AlertHistory | `src/services/alert-history.ts:20–21` (array) | audit trail of state changes (not on the roadmap list) | PG |
| EscalationStore | `src/services/escalation-store.ts:29–30` | escalation policies | PG |
| EscalationDispatcher.pending | `src/services/escalation-dispatcher.ts:29` | next escalation time per alert | PG (columns on `alerts`) |
| MaintenanceStore | `src/services/maintenance-store.ts:52–53` | maintenance windows | PG |
| AlertGroupStore | `src/services/alert-group-store.ts:34–37` | incident groups + active index | PG |
| DedupStore | `src/services/dedup-store.ts:17–18` | 5-min dedup fingerprints | PG (columns on `alerts`) |
| RuleEngine.eventBuffer | `src/services/rule-engine.ts:29` | threshold window buffer | MEM |
| Global IOC tenant registry | `src/index.ts:78–95` | a `Set` seeded with `'default-tenant'` | FIX later (not a UUID; not real subscriptions) |

Wiring: all created with `new` and no repo at `src/index.ts:31–41`. Store calls appear in 13 files (routes, worker, dispatcher, handler).

**integration-service** (no DB today, stores are synchronous)

| Store | File:line | What it holds | Class |
|---|---|---|---|
| IntegrationStore.integrations | `src/services/integration-store.ts:19` | integrations incl. credentials | PG, encrypted secrets |
| IntegrationStore.logs | `:20` | delivery logs | PG (30-day retention) |
| IntegrationStore.deliveries + deadLetterQueue | `:21`, `:23` | webhook deliveries and DLQ | PG (one table, `status`) |
| IntegrationStore.tickets | `:22` | Jira/ServiceNow tickets | PG |
| ExportScheduler.schedules + runHistory | `src/services/export-scheduler.ts:18–19` | export schedules and runs | PG |
| CredentialRotationService | `src/services/credential-rotation.ts:16–17` | rotation records | PG (audit) |
| AuditTrail | `src/services/audit-trail.ts:10` | integration audit entries | PG (audit) |
| AlertRoutingEngine, FieldMappingStore, TemplateEngine | `alert-routing-engine.ts:19`, `field-mapping-store.ts:16`, `template-engine.ts:32` | per-tenant config | RJ (or PG if D1 = no) |
| StixCollectionStore | `src/services/stix-collection-store.ts:16–17` | TAXII collections + objects | PG (defer to S157, see §11 D5) |
| Rate limiter, rate tracker, health history, retry stats | `rate-limiter.ts:16–18`, `rate-limit-tracker.ts:13–14`, `health-scoring.ts:15`, `webhook-retry.ts:14–15` | counters | MEM |

Credentials today (verified):
- An AES-256-GCM helper exists: `src/services/credential-encryption.ts` (format iv‖ciphertext‖tag, base64).
- It is only used by credential **rotation** (`credential-rotation.ts:50`). `createIntegration` stores `credentials`, `siemConfig.token/sharedKey/apiKey`, `ticketingConfig.password/apiToken` and `webhookConfig.secret` **in plain text** (`integration-store.ts:34–58`, `schemas/integration.ts:38–95`).
- `GET /integrations/:id` returns the whole object, secrets included (`src/routes/integrations.ts:71–73`). No masking anywhere.
- `TI_INTEGRATION_ENCRYPTION_KEY` defaults to `'etip-dev-encryption-key-change-me!'` (`src/config.ts:31`) and is **not set** in the `etip_integration` compose block (`docker-compose.etip.yml:811–850`). Production uses the dev default.
- The key is the first 32 characters of the string, not a derived or random key (`credential-encryption.ts:26`). `decryptCredentials` silently returns the ciphertext when decryption fails (`:103–107`).
- Export schedules have no timer. They only run from `POST …/run` (`src/routes/advanced.ts:205`). Noted, not fixed here.

**drp-service** (no DB today)

| Store | File:line | Class |
|---|---|---|
| DRPStore.assets | `src/schemas/store.ts:19` | PG |
| DRPStore.alerts | `:20` | PG |
| DRPStore.scans | `:21` | PG |
| DRPStore.takedowns | `:206` | PG |
| DRPStore.evidenceChains, aiEnrichments | `:24`, `:185` | PG (JSON columns on `drp_alerts`) |
| DRPStore.feedback | `:25` | PG |
| DRPStore.signals, signalStats | `:22–23` | MEM (capped). Stats can be rebuilt |
| DRPStore.correlations, assetRiskScores | `:228`, `:245` | MEM (derived, recompute on request) |

`new DRPStore()` at `src/index.ts:44`. **20 files** reach into the store (`routes/detection.ts` + 19 services). The roadmap sized this "M". It is **L → 2 sessions**.

**hunting-service** (no DB, no Redis today)

| Store | File:line | Class |
|---|---|---|
| HuntingStore.sessions, templates, correlationLeads | `src/schemas/store.ts:14–20` | RJ if D1 = yes, else PG |
| HypothesisEngine | `src/services/hypothesis-engine.ts:36` | same |
| EvidenceCollection | `src/services/evidence-collection.ts:44` | same |
| Collaboration comments + shares | `src/services/collaboration.ts:40–42` | same |
| HuntPlaybooks.executions | `src/services/hunt-playbooks.ts:47` | same |

**caching-service** — archive manifests

- `ArchiveStore` is a Map (`src/services/archive-store.ts:48–49`). After a restart the list is empty and `POST /archive/restore/:id` returns 404 (`src/routes/archive.ts:109–112`). The MinIO objects stay, become orphans, and `enforceRetention` never deletes them (it walks the Map, `archive-engine.ts:192–211`).
- **Bigger issue:** the archive job writes **fake records**. `runOnce()` calls `generateSampleRecords()` (`archive-engine.ts:104`, `238–250`, values like `sample-ioc-3`, `source: 'archive-engine-demo'`) for tenant `'default'` (`:94`) on the nightly cron (`src/index.ts:57`, `TI_ARCHIVE_CRON` default `0 2 * * *`). MinIO fills with demo data every night.
- Class: **no new table.** MinIO is the source of truth. Each object already carries `x-amz-meta-tenant`, `entity-type`, `record-count` (`archive-engine.ts:145–149`). Rebuild the index from MinIO on startup. First stop the fake job (§11 D4).

**analytics-service** — trend snapshots

- `TrendCalculator.snapshots` is a Map keyed by metric only (`src/services/trend-calculator.ts:30–31`).
- **Tenant leak (FIX):** `getDashboard(tenantId)` (`src/services/aggregator.ts:131`) calls `recordTrends(...)` (`:178`), which records `ioc.total`, `alert.open`, … **without a tenant** (`:390–401`). `GET /trends` (`src/routes/trends.ts:36–45`) then shows one mixed series to every tenant.
- Class: PG, one row per tenant + metric + day.

**onboarding** — module readiness

| Store | File:line | Class |
|---|---|---|
| ModuleReadinessChecker enabled/configured | `src/services/module-readiness.ts:24–26` | RJ (plain Redis key, same style as the wizard) |
| ChecklistPersistence snapshots | `src/services/checklist-persistence.ts:20` (comment says "In-memory for Phase 6") | RJ |
| DemoSeeder seeded flags | `src/services/demo-seeder.ts:163–164` | RJ (stops double seeding after restart) |
| WizardStore | `src/services/wizard-store.ts:25–31` | already Redis (`etip:{tenantId}:wizard`). Keep |
| IntegrationTester results | `src/services/integration-tester.ts:30` | MEM |

**Found but not on the roadmap list** (put on the backlog, §10):

| Service | Stores | Class |
|---|---|---|
| reporting-service | `report-store.ts:33`, `schedule-store.ts:26–27`, `template-store.ts:89` | PG. DECISION-027 named reporting as Postgres |
| customization | 17 Maps, e.g. `ai-model-store.ts:85` (tenant **Anthropic keys**), `dashboard-store.ts:43–45`, `module-toggle-store.ts:25`, `risk-weight-store.ts:52` | RJ per DECISION-027; BYOK keys need encryption |
| user-management-service | `team-store.ts:20`, `permission-store.ts:61`, `sso-service.ts:27`, `mfa-service.ts:22–23`, `break-glass-service.ts:34–35` | Check first. Login MFA already lives in Postgres (`users.mfa_secret`, `schema.prisma:79–80`), so some of these may be dead duplicates |
| admin-service | `tenant-store.ts:49–50`, `backup-store.ts:55–56`, `maintenance-store.ts:51` | Phase 2 S166 (W8) |
| correlation-engine | Redis checkpoint (`src/services/store-checkpoint.ts`) | OK once D1 fixes eviction |

## 4. Flow (after this step)

```
HTTP route / BullMQ worker
      │  (await)
      ▼
Store class (same public methods, now async)
      │  repo given? ──no──► in-memory Map  (unit tests only)
      │ yes
      ▼
<Service>Repo (Prisma)  ──► Postgres table with tenant_id
      │
      └─ DB error ──► AppError 503 (NOT a silent fallback to memory)
```

Config-type data (D1 = yes) uses `RedisJsonStore` with a long TTL instead of a repo.

Two changes from the billing pattern, on purpose: (1) **no per-call silent fallback in production** — if Postgres is down the request fails with 503, because a fallback writes to memory and loses it, the very bug we fix; the Map is only for tests (no repo). (2) **Methods become async** — alerting and integration stores are sync today, so every caller gets `await`.

## 5. Changes per module

### 5.0 Ops prerequisite (S154-0, ops module, S)

| File | Change |
|---|---|
| `.github/workflows/deploy.yml:186–206` | Run `prisma db push` **after infra starts and before app recreate**. Fail the deploy (don't continue) if all 5 tries fail |
| `scripts/check-memory-stores.sh` (new) | The CI guard from §7 |
| `scripts/memory-store-baseline.txt` (new) | Known legacy stores, each tagged with the session that removes it |
| `.github/workflows/deploy.yml` test job (`:66–80`) + `Makefile` `check` target | Run the guard |

### 5.1 alerting-service (S154 + S155)

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add 7 models from §6.1 (shared file; see §11 D2) |
| `apps/alerting-service/package.json` | Add `@prisma/client` (pnpm lockfile update) |
| `apps/alerting-service/src/prisma.ts` (new) | Copy of `billing-service/src/prisma.ts` |
| `apps/alerting-service/src/repository.ts` (new, split if >400 lines) | `RuleRepo`, `ChannelRepo`, `EscalationRepo`, `MaintenanceRepo` (S154); `AlertRepo`, `AlertHistoryRepo`, `AlertGroupRepo` (S155) |
| `src/services/channel-crypto.ts` (new) | AES-GCM for channel config (copy of integration helper, §5.2) |
| `src/services/{rule,channel,escalation,maintenance}-store.ts` | Optional repo in constructor, async methods (S154) |
| `src/services/{alert,alert-group,dedup}-store.ts`, `alert-history.ts`, `escalation-dispatcher.ts` | Same (S155). Dedup: look up `alerts` by `(tenantId, fingerprint)` where `lastSeenAt` is inside the window. Dispatcher: read `nextEscalationAt` from `alerts` on each tick instead of the `pending` Map |
| `src/routes/*.ts` (9 files), `src/workers/alert-worker.ts`, `src/handlers/global-ioc-alert-handler.ts` | Add `await` |
| `src/index.ts:31–41, 104–110` | Build repos when `TI_DATABASE_URL` is set; periodic unsuppress/purge become async |
| `src/config.ts` | `TI_DATABASE_URL` (optional), `TI_ALERTING_ENCRYPTION_KEY` (required in production) |
| `docker-compose.etip.yml` (etip_alerting ~`:1148`) | Add `TI_DATABASE_URL`, key, `depends_on: etip_postgres` |

### 5.2 integration-service (S156 + S157)

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add 6 models from §6.2 |
| `package.json`, `src/prisma.ts` (new), `src/repository.ts` (new) | As alerting |
| `src/services/credential-encryption.ts` | Key must be 32 random bytes given as base64 (`openssl rand -base64 32`). Add `keyVersion`. `decryptCredentials` throws instead of returning ciphertext |
| `src/config.ts:31` | No default when `TI_NODE_ENV=production`; fail at startup |
| `src/services/integration-store.ts` | Split each integration into `publicConfig` (URLs, index, project key) and `secretsEnc` (one encrypted JSON blob). Async + repo (S156: integrations, logs; S157: deliveries/DLQ, tickets) |
| `src/routes/integrations.ts:64–82` | Return masked secrets (`"****abc1"`), never the plain value |
| `src/services/export-scheduler.ts` | Repo for schedules and runs (S157) |
| `src/services/credential-rotation.ts`, `audit-trail.ts` | Repo (S157) |
| `src/services/{webhook-service,webhook-retry,ticketing-service,siem-adapter,health-dashboard,health-scoring,event-router}.ts`, `src/routes/{webhooks,export,p2-routes}.ts` | Add `await` |
| `docker-compose.etip.yml:811–850` | Add `TI_DATABASE_URL`, `TI_INTEGRATION_ENCRYPTION_KEY: ${TI_INTEGRATION_ENCRYPTION_KEY:?…}`. Raise memory from 256M to 384M (Prisma engine) |

There is no stored data to re-encrypt: today's data is lost on every restart anyway. Users re-enter credentials once after S156.

### 5.3 drp-service (S158a + S158b)

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add 5 models from §6.3 |
| `src/schemas/store.ts` | Becomes a thin async facade: same accessor names, backed by `src/repository.ts` (new) |
| 19 services + `routes/detection.ts` | Stop touching `store.assets`/`store.alerts` Maps directly; call facade methods with `await`. S158a: assets, alerts, scans (asset-manager, alert-manager, detectors, routes). S158b: takedowns, evidence, feedback, AI enrichment, exporter, bulk-triage |
| `src/index.ts:44`, `src/config.ts`, compose | DB URL + repo wiring |

### 5.4 hunting-service (S159)

If D1 = **yes** (Redis `noeviction`): one `RedisJsonStore` per store with `ttlDays: 3650`, keys `etip:hunting:sessions`, `…:templates`, `…:leads`, `…:hypotheses`, `…:evidence`, `…:collab`, `…:playbook-runs`. `restore()` in `src/index.ts` before `listen`; `scheduleCheckpoint()` after each write in the 5 files above. Add `@etip/shared-persistence` to `package.json`.
If D1 = **no**: Postgres like DRP (5 models: HuntSession, HuntTemplate, HuntEvidence, HuntComment, HuntHypothesis) — then this is L → 2.

### 5.5 Small ones (one S session each)

| Module | Files | Change |
|---|---|---|
| caching-service (S159b) | `src/services/archive-engine.ts`, `archive-store.ts`, `src/index.ts`, `src/config.ts` | `TI_ARCHIVE_ENABLED` default `false` (stops fake data). On startup, `listObjects('archive/')` + `statObject` to rebuild manifests. Add `date-range` and size to upload metadata. `restore` throws `AppError`, not `Error` (`:170`) |
| analytics-service (S159c) | `src/services/trend-calculator.ts`, `aggregator.ts`, `routes/trends.ts`, new `repository.ts`, compose | Key snapshots by `tenantId:metric`; routes pass tenant. Persist daily points to `analytics_trend_points` |
| onboarding (S159d) | `module-readiness.ts`, `checklist-persistence.ts`, `demo-seeder.ts`, `src/index.ts` | Use the existing Redis client: `etip:{tenantId}:modules`, `etip:{tenantId}:checklist`, `etip:{tenantId}:demo-seeded` |
| user-management-service (S159e) | `src/services/offboarding-purge-worker.ts:66–117` | Add `deleteMany({ where: { tenantId } })` for every new table. Cross-module by nature: it is the owner of the purge |

## 6. Data model (Prisma sketches)

Rules for all new models: `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`; `tenantId String @map("tenant_id") @db.Uuid` (no relation to `Tenant`, so the `Tenant` model is not touched; purge handles deletes); snake_case `@@map`; `createdAt`/`updatedAt`. Only **additive** changes later, because deploy uses `--accept-data-loss` (a rename drops the column).

### 6.1 alerting
```prisma
model AlertRule {             // alert_rules (full syntax shown once; others use short form)
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  name String @db.VarChar(200)
  severity String @db.VarChar(20)
  condition Json
  enabled Boolean @default(true)
  channelIds String[] @map("channel_ids") @db.Uuid
  escalationPolicyId String? @map("escalation_policy_id") @db.Uuid
  // + description, cooldownMinutes, tags, lastTriggeredAt, triggerCount, createdAt, updatedAt
  @@index([tenantId, enabled])
  @@map("alert_rules")
}
model AlertChannel {          // alert_channels
  id, tenantId, name VarChar(100), type VarChar(20)
  configEnc String @map("config_enc")      // AES-GCM of the full config JSON
  configMasked Json @map("config_masked")  // safe to return in the API
  keyVersion Int @default(1), enabled Boolean
  lastTestedAt DateTime?, lastTestSuccess Boolean?
  @@index([tenantId, type])
}
model AlertEscalationPolicy { id, tenantId, name, steps Json, repeatAfterMinutes Int, enabled; @@index([tenantId]) }   // alert_escalation_policies
model AlertMaintenanceWindow { id, tenantId, name, startAt, endAt, suppressAllRules Boolean, ruleIds String[] @db.Uuid, reason, createdBy; @@index([tenantId, startAt, endAt]) }  // alert_maintenance_windows
model Alert {                 // alerts
  id, tenantId, ruleId String? @db.Uuid, ruleName, severity VarChar(20), status VarChar(20)
  title, description, source Json
  fingerprint String @db.VarChar(16)        // was DedupStore
  dedupCount Int @default(1), lastSeenAt DateTime
  groupId String? @db.Uuid                  // was AlertGroup.alertIds
  acknowledgedBy/At, resolvedBy/At, suppressedUntil, suppressReason
  escalationLevel Int @default(0), escalatedAt DateTime?
  nextEscalationAt DateTime?                // was EscalationDispatcher.pending
  @@index([tenantId, status, createdAt])
  @@index([tenantId, fingerprint, lastSeenAt])
  @@index([status, suppressedUntil])
  @@index([nextEscalationAt])
}
model AlertHistoryEntry { id, tenantId, alertId @db.Uuid, action, fromStatus?, toStatus, actor, reason?, metadata Json, createdAt; @@index([alertId, createdAt]) }  // alert_history (append-only)
model AlertGroup { id, tenantId, fingerprint, ruleId, severity, title, firstAlertAt, lastAlertAt, status VarChar(10); @@index([tenantId, fingerprint, status]) }  // alert_groups
```
The per-tenant cap (`TI_ALERT_MAX_PER_TENANT`, `alert-store.ts:78–86`) becomes a `count()` check.

### 6.2 integration
```prisma
model Integration {           // integrations
  id, tenantId, name VarChar(100), type VarChar(30), enabled Boolean
  triggers String[], fieldMappings Json @map("field_mappings")
  publicConfig Json @map("public_config")   // webhook/siem/ticketing minus secrets
  secretsEnc String? @map("secrets_enc")    // credentials + token/sharedKey/apiKey/password/apiToken/secret
  keyVersion Int @default(1) @map("key_version")
  lastUsedAt DateTime?
  @@index([tenantId, type])
}
model IntegrationLog { id, tenantId, integrationId @db.Uuid, event, status, statusCode Int?, errorMessage?, attempt Int, payload Json, responseBody String?, createdAt; @@index([tenantId, integrationId, createdAt]) }   // integration_logs
model IntegrationDelivery {   // integration_deliveries (deliveries + DLQ)
  id, tenantId, integrationId, event, payload Json, attempts Int, maxAttempts Int
  status VarChar(20)          // pending | success | failure | dead_letter
  nextRetryAt DateTime?, lastError String?
  @@index([status, nextRetryAt])
  @@index([tenantId, status])
}
model IntegrationTicket { id, tenantId, integrationId, externalId, externalUrl, alertId, title, status, priority; @@unique([integrationId, externalId]); @@index([tenantId, alertId]) }
model ExportSchedule { id, tenantId, name, cronExpression, format, entityType, filters Json, enabled, limit Int, lastRunAt?, lastRunStatus?, lastRunError?, nextRunAt?; @@index([enabled, nextRunAt]) }
model ExportRun { id, tenantId, scheduleId @db.Uuid, runAt, status, error?, recordCount Int, format; @@index([scheduleId, runAt]) }
```
(`WebhookSubscription`, `schema.prisma:1043`, is the api-gateway public webhook feature — a different table.)

### 6.3 drp
```prisma
model DrpAsset { id, tenantId, type VarChar(30), value VarChar(500), displayName, enabled, scanFrequencyHours Int, lastScannedAt?, alertCount Int, criticality Float, tags String[], createdBy; @@unique([tenantId, type, value]); @@index([tenantId, enabled]) }
model DrpAlert {
  id, tenantId, assetId @db.Uuid, type, severity, status, title, description
  evidence Json, confidence Float, confidenceReasons Json, signalIds String[]
  assignedTo String?, triageNotes String, tags String[], detectedValue String, sourceUrl String?
  aiEnrichment Json?, evidenceChain Json?, resolvedAt DateTime?
  @@index([tenantId, status, createdAt]); @@index([tenantId, assetId]); @@index([tenantId, type, detectedValue])
}
model DrpScan { id, tenantId, assetId, scanType, status, findingsCount, alertsCreated, startedAt, completedAt?, durationMs; @@index([tenantId, assetId, startedAt]) }
model DrpTakedown { id, tenantId, alertId, platform, status, subject, body, contactName, contactEmail, evidence Json; @@index([tenantId, status]) }
model DrpAlertFeedback { id, tenantId, alertId, verdict, reason?, userId, createdAt; @@index([tenantId, alertId]) }
```

### 6.4 analytics
```prisma
model AnalyticsTrendPoint { tenantId @db.Uuid, metric VarChar(50), day DateTime @db.Date, value Float, updatedAt; @@id([tenantId, metric, day]); @@map("analytics_trend_points") }
```

## 7. The rule and how CI enforces it

**Rule:** no business data in process memory. A class-level `Map`, `Set` or array is allowed only for a cache (has a TTL or size cap), a rate limiter, a short buffer, or data derived from a persisted source. Mark it on the same line: `// memory-ok: cache|rate-limit|buffer|derived — <why>`.

**Guard** (`scripts/check-memory-stores.sh`, runs in the CI test job and `make check`):
```bash
#!/usr/bin/env bash
# Fails when a class field holds a Map/Set/array without a memory-ok tag
set -euo pipefail
hits=$(grep -rnE '^\s*(private|protected|public|readonly)[^=]*=\s*(new (Map|Set)\b|\[\])' \
         apps/*/src --include='*.ts' | grep -v 'memory-ok:' || true)
new=$(comm -23 <(echo "$hits" | cut -d: -f1,3- | sed 's/[[:space:]]\+/ /g' | sort -u) \
               <(sort -u scripts/memory-store-baseline.txt))
if [ -n "$new" ]; then echo "In-memory store without 'memory-ok:' tag:"; echo "$new"; exit 1; fi
```
- The baseline lists today's legacy stores (path + line text, no line numbers). The pattern matches **156** lines in `apps/*/src` today; tag the real caches, baseline the rest, and CI is green on day one.
- It is a **ratchet**: each migration session deletes its lines from the baseline. New untagged Maps fail CI. The `/review` skill asks: "new `memory-ok` tag — is it really a cache?"

## 8. Tests

- **Unit:** existing tests run with no repo (Map mode). Only `await` changes.
- **Repo tests:** mock `PrismaClient` like `apps/billing-service/tests/dual-mode-stores.test.ts`; field mapping both ways, tenant filter on every query.
- **Crypto:** round trip; wrong key or tampered tag throws; API never returns a secret; no key in production stops startup.
- **Restart test (per module):** create data through app instance 1, read it back through a **new** instance 2 sharing the same repo.
- **Dedup:** same event on two app instances → one alert, `dedupCount = 2`.
- **Analytics:** tenant A's dashboard call must not change tenant B's trend.
- **Guard:** a fixture with an untagged Map makes the script exit 1.

## 9. Acceptance checks (run on the VPS after each deploy)

```bash
docker exec etip_postgres psql -U etip_user -d etip -c "\dt alert*|integration*|drp_*|export_*|analytics_*"   # tables exist
R=https://intelwatch.in/api/v1/alerts/rules; A="Authorization: Bearer $JWT"   # real tenant JWT
curl -s -H "$A" $R | jq .total; docker restart etip_alerting; sleep 20; curl -s -H "$A" $R | jq .total   # same number
docker exec etip_postgres psql -U etip_user -d etip -c "SELECT count(*) FROM integrations WHERE secrets_enc LIKE '%token%'"  # 0
curl -s -H "$A" https://intelwatch.in/api/v1/integrations | grep -c '\*\*\*\*'   # >0: secrets masked
docker logs etip_alerting --since 1h 2>&1 | grep -ci "fall.*back\|in-memory"   # 0
bash scripts/check-memory-stores.sh && echo OK
```

## 10. Session breakdown

| S | Module | Work | Size |
|---|---|---|---|
| 154-0 | ops | Deploy: schema push before app recreate, fail on push failure. Add guard + baseline | S |
| 154 | alerting-service | Models (7) + rules, channels (encrypted), escalations, maintenance → Postgres | L (≈12 files) |
| 155 | alerting-service | Alerts, history, groups, dedup, dispatcher, worker → Postgres | L (≈10 files) |
| 156 | integration-service 🔒 | Models (6) + integrations, logs; encryption fixes; masking; compose key | L |
| 157 | integration-service | Deliveries/DLQ, tickets, export schedules/runs, rotation, audit; Redis JSON for routing/mapping/templates | L |
| 158a | drp-service | Models (5) + assets, alerts, scans | L |
| 158b | drp-service | Takedowns, evidence, feedback, AI enrichment, export, bulk triage | M |
| 159 | hunting-service | Redis JSON (D1 yes) or Postgres (D1 no) | M (or L) |
| 159b | caching-service | Stop fake archive; rebuild index from MinIO | S |
| 159c | analytics-service | Tenant-keyed trends (bug) + persistence | S |
| 159d | onboarding | Module readiness, checklist, demo flag → Redis | S |
| 159e | user-management-service | Add new tables to offboarding purge | S |
| backlog | reporting-service (M), customization (L), user-management-service (L, audit duplicates first), correlation-engine (after D1) | — | — |

"L" here is above the CLAUDE.md M budget. Each is still one module. If the owner wants strict M, split S154/S155/S156/S157 in two again (store layer, then callers).

## 11. Owner decisions needed

| # | Question | Recommendation |
|---|---|---|
| D1 | Redis `allkeys-lru` can evict BullMQ jobs and any Redis JSON data. Switch to `noeviction` and raise `maxmemory` to 512 MB? | **Yes.** BullMQ needs `noeviction` anyway. Caches already use TTLs. Without this, put hunting in Postgres |
| D2 | Each migration session edits the shared `prisma/schema.prisma`. Allow that inside a module session (billing did)? | Yes, only additive models for that module |
| D3 | On DB error: fail with 503 (recommended) or keep billing's silent fallback? | Fail. Later, fix billing the same way |
| D4 | The caching archive writes fake records every night. Turn it off until it archives real data? | Yes, `TI_ARCHIVE_ENABLED=false` |
| D5 | Is `StixCollectionStore` (integration) the data behind the public TAXII 2.1 server? | Check in S157; if yes, Postgres |
| D6 | Add backlog items (reporting, customization, user-management) as Phase 1b before step 4, or after? | Reporting before step 4 (user-visible loss). Others after |
| D7 | Users must re-enter integration credentials once after S156. OK? | Yes; nothing survives today anyway |

## 12. Risks

| Risk | Mitigation |
|---|---|
| `db push --accept-data-loss` drops a column on a rename | Only additive changes. Rename = add, copy, drop over two deploys |
| New code starts before its table exists (push runs after recreate today) | S154-0 moves the push first |
| Sync → async change misses an `await`, route returns a Promise | TypeScript `no-floating-promises` in lint for these apps; tests on each route |
| Prisma adds ~50–80 MB per container on a 16 GB VPS | Raise limits to 384M; watch Grafana. Step 7 later shares one process |
| Losing the encryption key loses all integration secrets | Keep the key in the VPS `.env` and in the owner's password manager. `keyVersion` allows rotation |
| Tables without RLS policies | Step 4 adds policies for every new table; the CI catalog check fails if any `tenant_id` table has none |
| Hot paths (alert worker) get slower with DB round trips | Indexes above; batch history writes; measure alerts/sec before and after |
