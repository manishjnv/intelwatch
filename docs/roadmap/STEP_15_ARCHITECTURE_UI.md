# Step 15 — Architecture & UI: Threat Exposure & Detection Posture

**Status:** design spec, not started. Implements the approved v2 product spec (`docs/roadmap/STEP_15_SIEM_INTEGRATIONS.md`, owner-approved 2026-09-28). This doc is the HOW; that doc is the WHAT — read it first. Written 2026-09-28 from the code as it exists that day; line numbers drift, re-check before editing.

**Read alongside this doc:** `docs/roadmap/STEP_15_SIEM_INTEGRATIONS.md` (§1–§11, referenced throughout as "v2 spec"), `docs/research/SIEM_POSTURE_MARKET_RESEARCH.md`, `docs/roadmap/STEP_03_PERSISTENCE.md`, `STEP_04_DB_ROLE_RLS.md`, `STEP_07_CONSOLIDATE_RUNTIME.md`, `STEP_09_CONNECTOR_PLUGINS.md`, `STEP_10_AGENT_FOUNDATION.md`, `STEP_14_MORE_FEATURES.md` §F6, `docs/DECISIONS_LOG.md`.

---

## 1. Summary + design principles

The v2 spec's flow (§1) is ①Ingest→②Normalize→③Relevance→④Deliver→⑤Assess→⑥Advise→⑦Track. ETIP already owns ①②④ end to end and most of the raw material for ⑤ (vulnerability-intel KEV/EPSS, threat-actor-intel TTPs, drp-service assets, ioc-intelligence/es-indexing search). What is genuinely new is ③⑤⑥⑦: relevance scoring, verdict computation, advisory generation/delivery/tracking, and the SIEM read/sightings/asset connectors that feed them.

**Design principles for this step:**

1. **No new service unless the domain data genuinely has no home.** Verdicts, advisories and relevance are new tenant-facing analytical entities with no existing owner — see §2's explicit decision. Everything else (connector plumbing, IOC data, actor/vuln data, asset data) stays with its existing owner and is reached by API, never a new duplicate table.
2. **Connectors are plumbing, the verdict/advisory is the product** (v2 spec's framing, §0). Keep that split in the service boundaries too: connector code lives in integration-service (Step 9's plug-in shape), verdict/advisory logic lives in the new service.
3. **Build on Step 9's connector interface**, not a parallel one. A SIEM read connector is the same shape as a sink connector with the direction flipped (`poll`/`fetch` instead of `send`) — see §3 of Step 9's spec, extended in §4 below.
4. **Reuse delivery machinery.** Advisory delivery is not a new notification system — it rides reporting-service's template engine and alerting-service's channel/notifier infra (v2 spec §2, closing line).
5. **RLS from day one.** The new service is greenfield, so it is built directly on Step 4's tenant-Prisma-extension pattern (`etip_app` role, `tenantContext`) instead of retrofitting it later like every existing service must.
6. **Honest about cadence.** No widget claims real-time. Every posture widget states its own refresh cadence (v2 spec §3b) instead of implying one dashboard-wide freshness.
7. **Never silently green.** Confidence sits next to every verdict, coverage number and posture score; missing/stale data downgrades confidence, never gets treated as "0 = safe" (v2 spec §3a, §8 pitfalls).

---

## 2. Service ownership map

### 2.1 Per-capability table

| v2 capability | Owner | Why | Depends on |
|---|---|---|---|
| Relevance matching (industry/geo/tech-stack/peer/asset) | **NEW `exposure-service`** | New tenant-facing analytical entity (`ThreatRelevance`), no existing owner | customization (org-profile, new — §2.3), threat-actor-intel, vulnerability-intel, drp-service, ingestion feeds |
| Verdict computation (decision table, confidence) | **NEW `exposure-service`** | Core new domain logic, pure function over data from 4 other services | ioc-intelligence/es-indexing (sightings/IOCs), integration-service (ExternalRule/Incident coverage), vulnerability-intel (CVE status), drp-service (exposure) |
| Advisory generation (content, dedup, checklist) | **NEW `exposure-service`** | Ties relevance + verdict into one artifact | verdict + relevance above |
| Advisory delivery (render + send) | **reporting-service** (template/render) + **alerting-service** (email/Telegram/Slack channel dispatch) + **integration-service** (ticket/SIEM-notable channel) | v2 spec §2 explicitly says reuse existing delivery machinery, not build a new one | exposure-service produces the `Advisory`; these three render/send it |
| Action tracking (owner/due/status) | **`exposure-service`** (`AdvisoryAction` sub-model) | Co-located with the `Advisory` it belongs to | — |
| SIEM read connectors (rules, incidents, data-source health) | **integration-service** | Same `Integration` record and connector shape as existing SIEM push (Step 9 §4.1), only the direction and `poll` method differ | Step 9 connector-sdk, Step 3 (integration-service Postgres) |
| Sightings intake + retro IOC re-scan | **integration-service** (intake: webhook or scheduled read-connector query) → **ioc-intelligence** (confidence update via existing `PUT /:id/lifecycle`) | Intake is connector-shaped (inbound webhook / scheduled pull); the confidence change belongs to the IOC's own owner, not a new copy | integration-service `Sighting` table, ioc-intelligence lifecycle API |
| Vuln-scanner / asset connectors | **integration-service** pulls (connector plumbing) → **drp-service** owns the resulting asset record | drp-service already models internet-facing assets (`DrpAsset`, Step 14 F7); a second parallel `Asset` table would duplicate it | integration-service, drp-service |
| IOC→watchlist sync | **integration-service** | Already does SIEM push of IOCs (P1, S166 in progress) — this is the same mechanism aimed at watchlists specifically | — |
| Rule→technique mapping | **integration-service** (owns `ExternalRule`, computes/stores technique tags; AI fallback via customization's AI config) | Mapping is a property of the pulled rule, stored where the rule is stored | threat-actor-intel (technique catalog), customization (AI subtask routing) |
| Coverage computation (ATT&CK/actor/IOC coverage) | **`exposure-service`** | Aggregates across 3+ services — no single owner fits | integration-service (`ExternalRule`), ioc-intelligence/es-indexing, threat-actor-intel |
| Posture score | **`exposure-service`** | Composite of the coverage widgets above | all coverage inputs |
| Sigma rule drafting | **`exposure-service`** (uses pySigma; output handed to integration-service's ticketing/PR delivery, P6) | Tied to a specific coverage gap / verdict remediation — same domain as verdict | integration-service (delivery), customization (AI routing) |

### 2.2 Owner decision — new service vs. extending an existing one

The v2 spec asks this to be decided explicitly. Trade-offs:

| Option | For | Against |
|---|---|---|
| **New `exposure-service` (recommended)** | Clean domain boundary matching the existing pattern (ioc-intelligence/threat-actor-intel/vulnerability-intel each own one narrow domain rather than being bolted onto ingestion/normalization); greenfield service can adopt Step 4's RLS pattern from day one instead of retrofitting it; Step 7's consolidation target is ~7 **deployables**, not ~7 `apps/*` packages — this service can join an existing deployable group (e.g. alongside correlation/graph/hunting, or integrations) once Step 7 lands, at zero extra container cost | One more container today (24th), before Step 7 ships; one more `apps/*` package to wire into `tsconfig.build.json`/Dockerfile/lockfile (New Package Checklist) |
| Extend **correlation-engine** | Conceptually close (entity/campaign matching) | Fully in-memory today (DECISION-022), lowest priority in Step 3's persistence backlog (§10, "after D1"); verdict/advisory data needs durable, indexed, relational storage with history — a much heavier persistence need than correlation's ephemeral entity graph; would force correlation-engine's persistence migration ahead of its own roadmap slot |
| Extend **integration-service** | Owns the connectors that feed verdicts (rules, incidents, sightings) already | Mixes two different responsibilities: narrow connector/plumbing (Step 9's stated goal for this service) and analytical/product logic (relevance scoring, verdict decision table, advisory copy). Growing it this way works against Step 9's own plan to keep integration-service to `SourceConnector`/`SinkConnector` plumbing only |

**Recommendation: new `apps/exposure-service`.** Marked as Open Decision #1 (§11) — needs explicit owner sign-off before P2 backend work starts, since it adds a container ahead of Step 7.

### 2.3 Blocking prerequisite found while mapping ownership

**Tenant org-profile (industry, geo, tech stack) has no server-side home today.** It exists only as a Zustand store with `persist` middleware writing to `localStorage` key `etip_org_profile` (`apps/frontend/src/stores/org-profile-store.ts`, type in `apps/frontend/src/types/org-profile.ts`) — per-browser, never synced to any backend, not tenant-scoped server-side. `customization` (the natural home — it already owns tenant config: module toggles, AI model selection, risk weights, dashboard layout, notification preferences) has no industry/geo/tech-stack field anywhere. A separate, disconnected `OrgProfileSchema` exists in `apps/onboarding/src/schemas/onboarding.ts` (industry as a plain string, no enum) used only to validate the onboarding wizard's POST body — not traced to a durable store.

**This blocks relevance matching from using real per-tenant industry/geo/tech-stack data.** It must be fixed before or alongside P2's relevance-matching work — see the backend prerequisite in §10 and Open Decision #2 (§11).

---

## 3. Event & queue flow

Existing queue/event names (from `packages/shared-utils/src/queues.ts` / `events.ts`, verified 2026-09-28) reused below: `INTEGRATION_PUSH`, `WEBHOOK_DELIVERY`, `VULN_PUBLISHED`, `ACTOR_UPDATED`, `CORRELATION_MATCH`, `IOC_UPDATED`, `GLOBAL_IOC_CRITICAL`, `GLOBAL_IOC_UPDATED`, `QUEUE_ALERT`, `DRP_ALERT_CREATED`. None of these carry a verdict/advisory/sighting/coverage concept — new ones are listed separately (§3.4) as a shared-utils change needing approval, per CLAUDE.md ("Import queue/event names from shared-utils — never hardcode").

### 3.1 Flow (a) — new KEV / actor / campaign lands → relevance → verdict → advisory → delivery

```
1. vulnerability-intel processes a new KEV/high-EPSS entry (existing CISA KEV connector pipeline)
      → emits VULN_PUBLISHED (existing event)
   [or] threat-actor-intel updates a campaign/actor profile → ACTOR_UPDATED (existing)
   [or] correlation-engine clusters a new campaign → CORRELATION_MATCH (existing)
2. exposure-service's relevance worker consumes these (new consumer, existing events)
      → for each active tenant, checks org-profile match (industry/geo/tech-stack/peer/asset)
      → match found → write ThreatRelevance row → enqueue EXPOSURE_VERDICT_COMPUTE (new)
3. Verdict worker (exposure-service) gathers, per tenant+threat:
      sightings          ← ioc-intelligence / es-indexing search
      detection coverage ← integration-service ExternalRule (tenant's connected SIEM)
      exposure           ← drp-service Asset + vulnerability-intel CVE status
      → applies the decision table (v2 spec §3a) → writes ThreatVerdict (+ history row)
      → emits VERDICT_COMPUTED (new)
4. Advisory worker (exposure-service) listens for VERDICT_COMPUTED where the verdict crosses
   a threshold (Exposed / Prone to exploit / Compromised) → builds Advisory (dedup check
   across sources, v2 spec §2 "no generic noise") → emits ADVISORY_GENERATED (new)
5. Delivery: reporting-service renders the advisory template (reuse the 5-report-type template
   engine); alerting-service dispatches through configured AlertChannel rows (email/Telegram/
   Slack, extended for an 'advisory' notification kind) or integration-service delivers a ticket/
   SIEM notable → ADVISORY_DELIVERED (new) per channel attempt
```

### 3.2 Flow (b) — sighting arrives → IOC confidence up → verdict flips → flash advisory

```
1. Customer SIEM pushes a webhook, or integration-service's SIEM read connector polls it
      → integration-service normalizes into a Sighting row (MISP 3-state: TP/FP/expiration)
      → emits SIGHTING_RECEIVED (new)
2. ioc-intelligence consumes SIGHTING_RECEIVED → raises IOC confidence via the existing
   PUT /:id/lifecycle transition → emits IOC_UPDATED (existing, unchanged shape)
3. exposure-service's verdict worker also consumes SIGHTING_RECEIVED → immediate, high-
   priority EXPOSURE_VERDICT_COMPUTE for that tenant+threat pair (decision table's "Sighting:
   Yes" branch now hits) → verdict flips to Exposed/Compromised → VERDICT_COMPUTED
   {urgency: 'flash'}
4. Advisory worker sees urgency=flash → bypasses the digest batch → sent immediately on every
   configured channel (v2 spec §2 urgency tiers) → ADVISORY_DELIVERED
```

### 3.3 Flow (c) — scheduled connector sync → coverage recompute

```
1. BullMQ repeatable job per Integration (integration-service; "scheduled query" pattern,
   v2 spec §5) pulls rules/incidents/health from the SIEM, or asset/vuln data from a scanner
   connector → writes ExternalRule / ExternalIncident / (via drp-service API) Asset+
   AssetVulnerability → emits CONNECTOR_SYNC_COMPLETED (new; CONNECTOR_SYNC_FAILED on error)
2. exposure-service consumes CONNECTOR_SYNC_COMPLETED → enqueues EXPOSURE_COVERAGE_RECOMPUTE
   (new) for that tenant → recomputes ATT&CK/actor/IOC coverage + posture score → writes
   PostureSnapshot (daily rollup row) → emits COVERAGE_RECOMPUTED (new)
3. integration-service's rule-health worker (P4) computes the Picus three-lens score from
   ExternalIncident data on the same cadence, independent of exposure-service
```

### 3.4 shared-utils additions (needs owner approval — Tier 1 frozen package)

| Kind | Name | Purpose |
|---|---|---|
| Queue | `EXPOSURE_RELEVANCE_MATCH` | relevance worker job |
| Queue | `EXPOSURE_VERDICT_COMPUTE` | verdict worker job (also used for the flash/high-priority path) |
| Queue | `EXPOSURE_ADVISORY_GENERATE` | advisory worker job |
| Queue | `EXPOSURE_COVERAGE_RECOMPUTE` | coverage/posture recompute job |
| Queue | `CONNECTOR_SYNC` | integration-service scheduled read-connector pull (rules/incidents/assets/vulns) |
| Queue | `SIGHTING_INGEST` | integration-service inbound sighting normalization |
| Event | `THREAT_RELEVANCE_MATCHED` | relevance worker → verdict worker handoff |
| Event | `VERDICT_COMPUTED` | carries `{tenantId, threatId, verdict, confidence, urgency}` |
| Event | `ADVISORY_GENERATED` | |
| Event | `ADVISORY_DELIVERED` | per-channel delivery result |
| Event | `SIGHTING_RECEIVED` | |
| Event | `CONNECTOR_SYNC_COMPLETED` / `CONNECTOR_SYNC_FAILED` | |
| Event | `COVERAGE_RECOMPUTED` | |

---

## 4. API design

All routes under `/api/v1`, JWT auth via the existing gateway/nginx `service-auth.inc` pattern (each `/api/v1/<svc>` nginx `location` proxies to `etip_<svc>:<port>`, api-gateway itself does not proxy — it only owns auth/billing/admin/public-API concerns). A new `location /api/v1/exposure` block + `upstream` entry is needed in `docker/nginx/conf.d/default.conf`, matching the existing per-service pattern exactly.

| Method + path | Owner | Auth / role | Request / response sketch | Pagination |
|---|---|---|---|---|
| `GET /api/v1/exposure/threats-relevant-to-me` | exposure-service | tenant JWT, analyst+ | `?verdict=&severity=` → `{data:[{threatId, identity, verdict, confidence, updatedAt}]}` | cursor, default 50 / max 500 |
| `GET /api/v1/exposure/verdicts/:id` | exposure-service | analyst+ | full verdict card: sightings, coverage per TTP, exposure, CVE status, confidence, ranked remediation, mitigation checklist | — |
| `POST /api/v1/exposure/backfill` | exposure-service | **super_admin only** | `{tenantId?, dryRun}` — reuses the S155 gateway search-backfill pattern (per-tenant paged, audited) | — |
| `GET /api/v1/exposure/advisories` | exposure-service | analyst+ | `?status=&urgency=` list | default 50 / max 500 |
| `GET /api/v1/exposure/advisories/:id` | exposure-service | analyst+ | full advisory incl. action checklist | — |
| `POST /api/v1/exposure/advisories/:id/ack` | exposure-service | analyst+ | acknowledge | — |
| `PATCH /api/v1/exposure/advisories/:id/actions/:actionId` | exposure-service | analyst+ (assign: tenant_admin) | `{status, assignedTo?, dueDate?}` | — |
| `GET /api/v1/exposure/posture` | exposure-service | analyst+ | composite dashboard payload, one field per v2 §3b widget, each carrying its own `refreshedAt` + `confidence` | — |
| `GET /api/v1/exposure/coverage/attack-navigator` | exposure-service | analyst+ | ATT&CK Navigator layer JSON (v4.5 spec); builds on ioc-intelligence's existing `GET /api/v1/ioc/attack-coverage` (Step 14 F6) + integration-service `ExternalRule` data | — |
| `GET/POST /api/v1/integrations` | integration-service (existing, extended) | tenant_admin (write), analyst (read) | add `direction: 'push'|'read'|'bidirectional'` field (additive) | |
| `POST /api/v1/integrations/:id/test` | integration-service (existing) | tenant_admin | mandatory before Save (v2 spec §6) | — |
| `POST /api/v1/integrations/:id/sync-now` | integration-service (new) | tenant_admin | manual trigger of the CONNECTOR_SYNC job | — |
| `GET /api/v1/integrations/:id/health` | integration-service (new) | analyst+ | last success/failure, counters (extends the existing S166 push-connector card pattern) | — |
| `POST /api/v1/integrations/:id/sightings-webhook` | integration-service (new) | tenant_admin | webhook config for SIEM-side push | — |
| `POST /api/v1/public/sightings` | api-gateway public API (new) | API key, scope `sighting:write` | STIX Sighting or plain webhook body → forwarded to integration-service | — |

---

## 5. Data model

Rules follow Step 3's established convention exactly (`tenantId String @map("tenant_id") @db.Uuid`, no FK to `Tenant`, snake_case `@@map`, `createdAt`/`updatedAt`, additive-only changes because the VPS deploy runs `prisma db push --accept-data-loss`, not `migrate`). All exposure-service tables get RLS policies from day one (Step 4's `policies.sql` + `NULLIF` pattern), not retrofitted later — this is the main practical benefit of a greenfield service.

**Dependency on Step 3 / Step 4:** integration-service does not yet have its own Postgres connection (verified: no `TI_DATABASE_URL` in its compose block) — `ExternalRule`, `ExternalIncident` and `Sighting` land there only once Step 3's S156–157 sessions give integration-service a database (per Step 3 §5.2, §6.2). Until then, P2's SIEM read connectors can run but their pulled data has nowhere durable to land — **P2's SIEM-rule-pull work should either follow S156/157, or exposure-service temporarily owns a thin `ExternalRule` cache table itself and integration-service takes ownership when its own persistence lands** (flagged as Open Decision #6, §11).

| Model | Owner | Purpose | Key fields | Indexes / tenant scoping | Retention |
|---|---|---|---|---|---|
| `Integration` | integration-service (existing, extend) | one configured connector | `+direction` (new field) | tenant_id, RLS (Step 4) | — |
| `SyncCursor` | integration-service | resumable pull position | connectorId, resource, cursor | unique(connectorId, resource) | — |
| `ExternalRule` | integration-service | rule pulled from customer SIEM | source, externalId, name, enabled, techniques[], dataSources[], lastFired | tenant_id, RLS | until connector deleted |
| `ExternalIncident` | integration-service | incident/alert pulled from SIEM | ruleRef, outcome, timestamps | tenant_id, RLS | 90 days (v2 spec has no stated retention; recommend matching `IntegrationLog`'s 30-day pattern ×3 for trend calc — Open Decision) |
| `Sighting` | integration-service | MISP-style sighting | iocOrRuleRef, type (TP/FP/expiration), source, org, seenAt | tenant_id, RLS; index(iocOrRuleRef, seenAt) | per tenant data-retention policy |
| `Asset` / `AssetVulnerability` | drp-service (extend `DrpAsset`, not a new table) | internet-facing asset + its CVE exposure | reuse `DrpAsset` fields + new `DrpAssetVulnerability(assetId, cveId, status)` | tenant_id, RLS (already applies to `DrpAsset`) | — |
| `ThreatRelevance` | **exposure-service (new)** | why a threat matches a tenant | threatRef, tenantId, matchReasons[] (industry/geo/tech/peer/asset), score, computedAt | tenant_id, RLS; index(tenantId, threatRef) | 90 days (matches conversation-style retention elsewhere) |
| `ThreatVerdict` + history | **exposure-service (new)** | computed per-threat per-tenant verdict | threatRef, tenantId, verdict enum, confidence, componentRefs (sightings/coverage/exposure/cve), computedAt | tenant_id, RLS; index(tenantId, verdict, computedAt); append-only history table `ThreatVerdictHistory` | 1 year (audit-adjacent) |
| `Advisory` | **exposure-service (new)** | generated customer advisory | tenantId, threatRef, verdictRef, urgency, dedupKey, channelsSent[] | tenant_id, RLS; unique(tenantId, dedupKey) | per tenant retention policy |
| `AdvisoryAction` | **exposure-service (new)** | one checklist item | advisoryId, description, ownerId?, dueDate?, status | index(advisoryId) | with parent `Advisory` |
| `PostureSnapshot` | **exposure-service (new)** | daily rollup feeding widgets + trend lines | tenantId, day, widgetScores Json, overallScore | `@@id([tenantId, day])` (same pattern as Step 3's `AnalyticsTrendPoint`) | 13 months (trend) |

---

## 6. Computation details

**Relevance scoring** (weights owner-tunable, defaults to start):

```
score = 0.30·industryMatch + 0.20·geoMatch + 0.20·techStackMatch
      + 0.15·peerMatch      + 0.15·assetMatch     (each term 0–1, weighted sum 0–1)
```
`industryMatch`/`geoMatch`/`techStackMatch` come from the tenant's org-profile (§2.3) matched against the threat's declared targeting; `peerMatch` from feed/CERT-In/ransomware-leak mentions of named organizations in the same sector; `assetMatch` from drp-service's declared assets running the affected software/version. A match with `score` above a configurable threshold produces a `ThreatRelevance` row; below it, nothing is generated (v2 spec §2 "no generic noise").

**Verdict engine as a pure function** (testable in isolation, no I/O):

```ts
function computeVerdict(input: {
  sighting: boolean;
  detectionCoverage: 'none' | 'partial' | 'full';   // exists→enabled→validated, 3-state (v2 spec §3a)
  exposed: boolean;                                  // internet-facing, affected software present
  vulnStatus: 'patched' | 'unpatched' | 'mitigated' | 'actively_exploitable';
  dataAge: { assetDays: number; vulnScanDays: number; ruleValidated: boolean };
}): { verdict: Verdict; confidence: 'high' | 'medium' | 'low'; missingReason?: string }
```
Implements the decision table from v2 spec §3a top-to-bottom, first match wins. Confidence: `high` only if `assetDays < 30 && vulnScanDays < 14 && ruleValidated`; otherwise `medium`/`low` naming the specific stale/missing input — never silently high.

**Recompute triggers:** event-driven (flows a/b in §3) for immediate changes, plus a **nightly cron** per tenant to catch drift (stale-data downgrades, scheduled connector syncs that didn't land a discrete event). **Caching:** each posture widget is cached in Redis with a TTL matching its own stated recompute cadence (v2 spec §3b: 15 min for log-source/rule health, daily for coverage/exposure/trend) — **this deliberately does not use the blanket "dashboard 48hr" TTL from CLAUDE.md's Architecture Constants**, because a 48-hour-stale posture score would silently violate the "never silently green" principle; flagged as Open Decision #7 (§11) since it's an explicit exception to a documented constant.

**Idempotency:** verdict/coverage recompute jobs use a versioned jobId, same pattern as `iocIndexJobId()` from DECISION-033 — `exposure-verdict:${tenantId}:${threatId}:${hourBucket}` — so near-simultaneous triggering events don't stack duplicate recomputes.

**Backfill:** a one-time job, run through the new `POST /api/v1/exposure/backfill` route, enumerates each tenant's org-profile against recent (default 90-day) KEV/high-EPSS vulns and actor campaigns, computing initial relevance+verdicts — directly modeled on the existing `POST /api/v1/gateway/search/backfill` route (super_admin only, per-tenant paged, `dryRun`, audited) shipped in S155.

---

## 7. Scale & reliability

- **Volume estimate per tenant:** tens of relevant threats/week at Starter/Teams scale (bounded by relevance threshold, not raw feed volume); each triggers at most one verdict recompute chain. SIEM read connectors: hourly rule/incident pulls, daily asset/vuln pulls (batch, per v2 spec §4 "near-real-time vs daily, honestly stated").
- **Rate limits per connector:** inherit Step 9's `safeFetch` timeout/body-size defaults; SIEM-specific request budgets set per connector type (Sentinel/Elastic query quotas documented at connector build time).
- **Retries/backoff/DLQ:** connector syncs are BullMQ jobs with exponential backoff, same shape as the existing webhook retry engine; a sync that exhausts retries marks the `Integration` unhealthy (surfaced in the health indicator, §4) rather than silently going stale.
- **Per-tenant fairness:** reuse ingestion's existing per-tenant BullMQ fairness counter (P3-7) for the new `EXPOSURE_*` and `CONNECTOR_SYNC` queues so one tenant's large connector backlog can't starve others.
- **AI cost gates:** Sigma rule drafting (P6) and any AI-assisted rule→technique mapping fallback route through customization's existing AI budget/subtask config — never a direct, ungated model call (mirrors Step 10's `AgentSpendDaily` cap pattern, though this step does not itself require Step 10).
- **Observability:** every connector and every exposure-service worker registers Prometheus metrics via the existing `registerMetrics(app, '<service>')` helper (shared-utils); Grafana panel per connector: last success, failure count, sync duration.
- **Failure modes:**

| Failure | Effect | Mitigation |
|---|---|---|
| SIEM read connector auth expires | Coverage data goes stale | Health indicator flips unhealthy; posture confidence downgrades automatically (stale-data rule, §6) |
| Relevance worker backlog | Advisories delayed, not lost | Per-tenant fairness queue; nightly cron catches anything missed |
| Verdict recompute storm (many sightings at once) | Redundant compute | Versioned idempotent jobId (§6) collapses duplicates |
| Advisory dedup key collision (real bug) | Two advisories for one threat | `@@unique([tenantId, dedupKey])` constraint at the DB, not just app logic |
| drp-service asset data absent | Exposure branch of decision table can't resolve | Verdict falls to `low` confidence with explicit "no asset data" reason, never assumed safe |

---

## 8. Security & privacy (design requirements)

- Read connectors use **least-privilege, read-only** credentials; the exact minimal role per SIEM (Sentinel Reader + Log Analytics Reader; Elastic Kibana Rules-feature Read + ES read on `.alerts-security.alerts-*`) is confirmed against current vendor docs at connector-build time, and Splunk/QRadar/Chronicle equivalents are confirmed before those connectors ship (v2 spec §9, §6; market-research §6 flags these as UNVERIFIED until then).
- Connector credentials are **encrypted at rest with a rotatable, versioned key**, masked in the UI and API, never logged.
- Outbound calls from every connector go through Step 9's `safeFetch` (SSRF-safe: blocks loopback/private/link-local addresses, re-checks redirects, enforces timeout and response-size caps).
- Every connector and every exposure-service tenant table is isolated per tenant via Step 4's RLS (`etip_app` role, tenant-only policies).
- Only metadata is transferred by any connector — no raw logs, no PII beyond what an incident record carries, stripped/redacted before storage.
- Each connector requires **explicit tenant consent** before it runs; sightings intake requires the tenant to have configured the webhook themselves.
- Every sync, push and advisory delivery is **audit-logged** (`AuditLog`, same hash-chain infra as the rest of the platform).
- Rate limits and backoff apply per connector (§7); each tenant/connector pair has a **kill switch**.
- Data retention follows the tenant's policy (§5 per-model retention column).
- **Plan gating for every new route in this step is enforced server-side**, not only in the UI — new `FEATURE_KEYS` entries (§9a) are checked by the existing quota-enforcement middleware the same way every other gated route is, not bypassed at the proxy layer.
- **TLP handling:** advisory content and any LLM-assisted step (Sigma drafting, rule-mapping fallback) drop `tlp:red` rows by default; any AI-facing text is treated as untrusted input the same way Step 10's tool layer treats feed text (defense in depth even though this step doesn't require agent-service).

---

## 9. UI design

### 9a. Information architecture

New top-level sidebar entry **"Threat Exposure"** (route `/exposure`), peer to `/iocs` and `/graph` — this is analyst daily-use, not admin configuration, so it does not go under Command Center (matching the existing split: analyst-facing entity pages are top-level nav; admin/config screens are Command Center tabs). Posture/coverage/advisories live as sub-tabs of that same route via `PillSwitcher` (same component already used for Command Center sub-navigation), not separate top-level routes — keeps the sidebar from growing past its current density.

**Connections** (the Integrations tab rebuild, v2 spec §6/§7 P1) stays inside Command Center, extending the existing `/integrations` → `/command-center#<tab>` legacy redirect already in `App.tsx` — this is config/setup, consistent with every other admin surface.

New `FeatureGate` keys (added to `packages/shared-types/src/plan.ts` `FEATURE_KEYS` — Tier 1, needs approval): `threat_exposure` (board + verdicts, P2), `detection_posture` (posture dashboard + SIEM read connectors, P2), `advisory_channels_extended` (Telegram/Slack/Teams/ticketing beyond email, P3). Locking follows the existing DECISION-035 rule exactly: locked only on an explicit `enabled:false`, never on a missing/loading entry.

**Visibility:** tenant_admin and analyst see Threat Exposure, Posture, and Advisories (read; analyst cannot assign/approve connector writes). Only tenant_admin can create/edit/test a connector (Connections page write actions). super_admin does not get a cross-tenant view inside these pages — cross-tenant is Command Center → Clients (existing `TenantOverridePanel` pattern), keeping the same boundary Step 10 already established for tool-layer tenant isolation.

### 9b. Screens

**1. Threat Exposure board** — purpose: list of relevant threats with verdict chips + filters (v2 spec §3a).
```
┌ PageStatsBar: [Exposed 3] [Prone 1] [Detectable-only 5] [Protected 21] ─ refresh ┐
├ FilterBar: search | verdict▾ | severity▾ | date range                          ┤
├ DataTable (SplitPane.left, expandable row per threat) ───────────────────────  ┤
│  ⚠ Exposed   CVE-2026-xxxx via Actor "X"   sightings:2  coverage:none  ▸        │
│  ⚑ Prone     CVE-2026-yyyy  KEV, unpatched  exposed:3 assets           ▸        │
│  ✓ Protected ...                                                       ▸        │
└──────────────────────────────────────────────────────────────────────────────  ┘
```
Components reused: `PageStatsBar`/`CompactStat`, `FilterBar`, `DataTable` (expandable-row pattern from IocListPage), `SplitPane` (right pane = verdict detail, screen 2), `SeverityBadge`, `EntityChip`. Data source: `GET /api/v1/exposure/threats-relevant-to-me`. States via `QueryStateView` (`resource="relevant threats"`); empty state: "No relevant threats yet — connect a SIEM read connector or wait for the next feed cycle" (never a blank table). 375px: `SplitPane`'s existing mobile overlay behavior — the detail becomes a full-screen sheet, matching the memory rule (`feedback_mobile_first.md`).

**2. Verdict detail drawer/page** — purpose: evidence for one verdict.
```
┌ SplitPane.right (or full page on deep link) ──────────────────────┐
│ Threat identity · confidence: MEDIUM (no EASM data — DRP only)    │
│ ── Sightings ──────────────  2 fresh, 0 stale                     │
│ ── Detection coverage per TTP ── T1059 exists→enabled→validated   │
│ ── Exposed assets ─────────  3 internet-facing (EntityChip list)  │
│ ── CVE status ─────────────  unpatched (KEV, EPSS 0.94)           │
│ ── Ranked remediation ─────  1) Patch CVE-X  2) Enable rule Y     │
│ ── Mitigations checklist ──  ☐ Patch   ☑ Block IOCs  ☐ Add rule   │
└─────────────────────────────────────────────────────────────────┘
```
Data source: `GET /api/v1/exposure/verdicts/:id`. Confidence + missing-data banner is always rendered, never hidden on high confidence. 375px: full-screen sheet (same SplitPane overlay), sections stack vertically.

**3. Advisory inbox + detail** — purpose: proactive alerting, action tracking (v2 spec §2).
```
┌ PillSwitcher: [All] [Flash] [Digest] [Acknowledged] ──────────────┐
├ DataTable: urgency chip | title | verdict | actions outstanding ▸┤
└────────────────────────────────────────────────────────────────┘
   detail: what happened + why relevant | verdict summary | action checklist
           (owner/due/status per item, reuses AlertChannel-style config for delivery log)
```
Data source: `GET /api/v1/exposure/advisories`, `/:id`. Action items use the same owner/due/status pattern already established in `AccessReviewPanel`/`ComplianceReportsPanel` (Command Center) — reuse that row shape rather than inventing a new one. 375px: card list instead of table (existing `hidden md:block`/`md:hidden` convention from skills/20-UI-UX.md).

**4. Posture overview dashboard** — purpose: always-on widgets (v2 spec §3b).
```
┌ CompactStat row: Overall score | Log-source health | ATT&CK coverage | ...     ┐
├ Grid of widget cards, each showing its OWN refresh cadence + confidence label  ┤
│  [ATT&CK coverage — daily]  [Actor coverage — on change]  [IOC coverage — live]│
│  [Rule health — 15 min]     [Asset/vuln exposure — daily] [Trend sparkline]    │
└─────────────────────────────────────────────────────────────────────────────  ┘
```
New widgets follow the existing dashboard widget pattern (`GeoThreatWidget`, `ThreatScoreWidget` already exist and are org-profile-aware) — 1–2 summary tiles surface on the main `/dashboard`, the full grid lives at `/exposure` (posture tab). Every card states its cadence and confidence inline — never a bare number. Data source: `GET /api/v1/exposure/posture`.

**5. ATT&CK / actor coverage views** — extends Step 14 F6's `AttackTechniqueMatrix` (already exists) rather than building a new matrix component: add a `counts`/coverage-state prop sourced from `GET /api/v1/exposure/coverage/attack-navigator`, reuse the existing "Export layer" JSON button. Actor coverage reuses the same matrix filtered to one actor's TTPs (existing per-actor `GET /api/v1/actors/:id/mitre-heatmap` route already does the actor side; exposure-service adds the "ranked by relevance" ordering on top).

**6. Connections page (Integrations tab rebuild)** — Command Center tab, purpose: connector catalogue + setup wizard.
```
┌ ConfigurationTab (Command Center) → "Connections" ────────────────┐
│ TAXII card (existing, S166)                                       │
│ Connector catalogue: [Sentinel] [Elastic] [Splunk] [Qualys] ...   │
│   → Setup wizard: pick → credential (read-only default) → Test    │
│     (blocks Save on failure) → Save                                │
│ Connector health list: name | last success | last failure | ⚙     │
└────────────────────────────────────────────────────────────────  ┘
```
Extends the existing S166 push-connector card pattern (already live in Command Center) rather than a new component tree. Data source: `GET/POST /api/v1/integrations`, `/:id/test`, `/:id/health`.

**7. Notification preferences** — extends the existing Command Center notification-preferences area (customization's existing `notification preferences` module) with advisory-specific channel toggles (flash vs digest cadence, per-channel on/off) — no new page, a new section within the existing settings screen.

### 9c. Frontend architecture

- **Routes:** `/exposure` (board, default sub-tab), `/exposure` + hash-style `PillSwitcher` state for posture/coverage/advisories sub-views (matches the Command Center hash pattern already in use) — kept as one lazy-loaded page component (`ExposurePage.tsx`) rather than 4 separate routes, consistent with `App.tsx`'s existing one-page-per-module convention.
- **Hooks:** one `use-exposure-*` hook per data source (`use-exposure-verdicts`, `use-exposure-advisories`, `use-exposure-posture`), each calling `api()`/`apiList()` directly — **never** `.then(r => r.data)` (RCA #45: `api()` already unwraps `{data}`; this exact bug hit 17 hooks in S161b and must not repeat here).
- **Query keys:** `['exposure', 'verdicts', filters]`, `['exposure', 'advisories', filters]`, `['exposure', 'posture']` — namespaced under `'exposure'` so cache invalidation on advisory-ack or connector-test doesn't collide with unrelated queries.
- **Polling vs. live:** confirmed **no SSE or WebSocket client exists anywhere in the frontend today** (`apps/websocket` is an empty scaffold). This step does not stand one up — it uses TanStack Query `refetchInterval` per widget, matching each widget's own stated cadence (15 min for log-source/rule health, on-page-load + manual refresh for daily widgets). Standing up real push transport is out of scope here; flagged only as a future option, not a dependency.
- **State:** server data lives in TanStack Query only; local UI state (selected filter, active sub-tab) is component state, not Zustand — the org-profile Zustand store's real fix is moving to a backend-synced source (§2.3), not adding a second client-only store for this feature.
- **Tests:** every new hook is tested against the **real backend response shape** (mocked at the HTTP layer, not a fabricated shape), per `feedback_real_backend_shapes.md` — this is exactly the class of bug RCA #45 found repeatedly when hooks assumed a shape the backend didn't send.

---

## 10. Build sequence mapped to v2 phases

P1 (S166, real push connectors + TAXII + outbound safety) is already in progress and unaffected by this doc.

### P2 — MVP "Am I affected?" (v2 spec §7)

| Item | Area | Files/scope | Size |
|---|---|---|---|
| **Prerequisite:** persist tenant org-profile | customization | new `OrgProfile` model + API; frontend Zustand store becomes a thin cache synced to it | M |
| `apps/exposure-service` scaffold | new service | package.json, tsconfig (composite+references), app.ts, health route — New Package Checklist | M |
| Prisma models: `ThreatRelevance`, `ThreatVerdict`(+history), `Advisory`, `AdvisoryAction` | shared (ask) | `prisma/schema.prisma` additive models | S |
| Relevance worker | exposure-service | consumes `VULN_PUBLISHED`/`ACTOR_UPDATED`/`CORRELATION_MATCH`, scores, writes `ThreatRelevance` | M |
| Verdict engine (pure function) + worker | exposure-service | `src/verdict/decision-table.ts` (pure, unit-testable) + worker wiring | M |
| Basic advisory generation | exposure-service | relevance+verdict+checklist, in-app + email only | M |
| ONE vuln-scanner connector | integration-service | first of Qualys/Tenable/Nessus/OpenVAS (Open Decision, v2 spec §11) | M |
| SIEM rule pull, Sentinel or Elastic | integration-service | least-privilege read connector (Step 9 shape, `poll` direction) | L |
| ATT&CK/actor coverage widgets | exposure-service | reuses Step 14 F6's `GET /api/v1/ioc/attack-coverage` | S/M |
| Frontend: Threat Exposure board + verdict detail | frontend | `ExposurePage.tsx`, `use-exposure-verdicts.ts`, `VerdictDetailDrawer.tsx` | M |
| Frontend: posture summary tiles on dashboard | frontend | 1–2 new widget components, org-profile-aware pattern | S |
| Frontend: advisory inbox (in-app + email) | frontend | `AdvisoryInboxPage.tsx` (or `ExposurePage` sub-tab) | M |
| shared-utils queue/event additions | shared (ask) | §3.4 table | S |
| `FEATURE_KEYS` additions | shared-types (ask) | `threat_exposure`, `detection_posture` | S |
| Tests | all above | connector contract tests (Step 9 pattern), verdict decision-table unit tests, relevance scoring tests, hook shape tests | (with each item) |

### P3 — Sightings + tracking

Inbound sightings/webhook (integration-service, M) · retro IOC re-scan (integration-service scheduled query, M) · IOC→watchlist sync (integration-service, S) · advisory action tracking UI (frontend, M) · extra channels — Telegram/Slack/Teams/ticketing (alerting-service + integration-service, M each, one at a time per Open Decision).

### P4 — Rule health

Incidents pull + Picus three-lens (integration-service, L) · Splunk/QRadar read connectors (integration-service, L each, after their UNVERIFIED credentials are confirmed per market research §6).

### P5 — Asset/EASM/EDR + composite score

Asset/EASM connectors (integration-service→drp-service, L) · EDR connector (integration-service, M) · composite posture score + trend widgets (exposure-service, M).

### P6 — Detection-as-code + peer benchmark

Sigma drafts via pySigma, disabled/PR-only (exposure-service, L) · peer benchmark with published methodology (exposure-service, L, only if Open Decision on data policy is resolved) · on-prem Bridge agent (new, L) · BAS/validation partnership integration (L, only if "partner" is chosen over "build").

Every item above respects CLAUDE.md's task-sizing rubric (≤20 files/session, one module per session) and the roadmap docs' own S/M/L convention (S/M/L = session-size, matching STEP_09/STEP_10/STEP_14's usage).

---

## 11. Open decisions for owner

1. **New `exposure-service` vs. extending correlation-engine/integration-service** (§2.2). *Recommendation: new service.*
2. **Where tenant org-profile (industry/geo/tech-stack) lives server-side** (§2.3) — extend customization (recommended, it already owns tenant config) vs. a table inside exposure-service vs. finishing the disconnected onboarding `OrgProfileSchema` path. *Recommendation: customization.*
3. **Asset/vuln-scanner data ownership** — extend drp-service's existing `DrpAsset` (recommended, avoids a duplicate Asset model) vs. a new `Asset` table under integration-service.
4. **Sightings ownership** — integration-service (recommended, connector-shaped inbound data) vs. exposure-service.
5. **Rule→technique mapping ownership** — integration-service, which owns `ExternalRule` (recommended) vs. exposure-service.
6. **`ExternalRule`/`ExternalIncident`/`Sighting` timing vs. Step 3** — *Resolved by S166 PR B:* integration-service gets its own Prisma client and an `integrations` table (write-through cache, approved 2026-09-28), so these models can be added to integration-service directly when the SIEM read connectors are built — no temporary table needed.
7. **Posture-widget cache TTL exception** (§6) — per-widget TTL matching its stated recompute cadence, explicitly deviating from CLAUDE.md's blanket "dashboard 48hr" constant. *Recommendation: approve the exception; a 48h-stale posture score violates the "never silently green" rule.*
8. **New top-level sidebar route `/exposure` vs. folding entirely into Command Center** (§9a). *Recommendation: new top-level route — analyst daily-use, same tier as `/iocs`/`/graph`.*
9. Carried forward from the v2 spec (§11), still open: first SIEM read connector — Sentinel or Elastic — and which vuln scanner to pair it with; plan-gating tiers for read connectors and advisory channels beyond email; advisory-channel build order beyond email (Telegram vs. Slack/Teams/ticketing); marketplace apps (Sentinel Content Hub, Splunkbase) now or P6; BAS/validation partnership vs. a lighter internal validator; peer-benchmark data policy and methodology disclosure.

---

*File path: `docs/roadmap/STEP_15_ARCHITECTURE_UI.md`*
