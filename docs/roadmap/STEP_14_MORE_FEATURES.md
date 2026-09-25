# Step 14 — F5 Sandbox · F6 ATT&CK heatmap · F7 Vendor risk · F8 India focus · F9 Browser extension

**Roadmap:** docs/ROADMAP_S149_PLUS.md §3 step 14, Phase 5 F5–F9 · **Needs:** Step 9 (connector plug-in interface) and Step 10 (agent foundation) where noted
**Status:** spec, not started. Written 2026-09-25. "Current state" rows checked against the repo on that date.
**Pick order:** by customer demand. Each feature is independent. Shorter than Steps 10–13 on purpose; expand in the session's plan mode.

---

## F5 — Sandbox link (ANY.RUN / Hybrid Analysis / Triage) in malware-intel

**Goal.** From an IOC (hash or URL) or a malware family page, look up or submit to a sandbox, store the report summary, and feed the network IOCs it finds back into the pipeline.

**Competitor reference.** Mandiant/Google TI (built-in sandbox), Recorded Future (owns Triage), CrowdStrike Falcon Sandbox (Hybrid Analysis).

**Current state (verified).**

| Area | Today | File |
|---|---|---|
| Sandbox code | None. Only text mentions: hunting heuristics "Submit to sandbox", scoring weight `sandbox_detection` | `apps/hunting-service/src/services/ai-suggestions.ts:44`, `apps/malware-intel/src/scoring.ts:34` |
| malware-intel | Family-level profiles only (`MalwareProfile`: no hashes, no samples, no TTP list). 27 routes, no queue, no `bullmq` dep | `prisma/schema.prisma:527`, `apps/malware-intel/src/routes/malware.ts`, `package.json` |
| Hash IOCs | `IocType` has `hash_md5/sha1/sha256/sha512`, `url` | `prisma/schema.prisma:330` |
| Pipeline entry | Ingestion pushes to `etip-normalize`; normalization consumes it | `apps/ingestion/src/workers/feed-fetch.ts:106`, `apps/normalization/src/workers/normalize-worker.ts:28` |

**Flow.**
```
IOC detail / malware page → "Sandbox" button
  POST /api/v1/malware/sandbox {provider, kind:'hash'|'url', value, iocId?}
    ├─ TLP check: tlp red/amber → blocked unless provider supports private runs and tenant allows it
    ├─ hash → provider SEARCH (existing public report)       — no detonation, we never hold files
    └─ url  → provider SUBMIT (detonate URL)                  — needs tenant opt-in
  → SandboxReport(pending) → queue etip-sandbox-poll (every 30 s, max 20 min)
  → summary saved: verdict, score, family tags, ATT&CK IDs, contacted IPs/domains/URLs, dropped hashes
  → extracted IOCs → etip-normalize job (source 'sandbox:<provider>', tenant-private)  [Feed→Normalize rule]
```

**Backend changes (malware-intel).** `src/sandbox/providers/{anyrun,hybrid-analysis,triage}.ts` behind one `SandboxProvider` interface (`search(hash)`, `submitUrl(url)`, `status(id)`, `summary(id)`) — this is the Step 9 plug-in shape. Endpoints to verify in-session against current docs: ANY.RUN `api.any.run/v1/analysis` (`Authorization: API-Key …`); Hybrid Analysis `hybrid-analysis.com/api/v2` (`api-key` header; `/search/hash`, `/submit/url`, `/report/{id}/summary`); Triage `tria.ge/api/v0` (Bearer; `/search?query=sha256:…`, `/samples`, `/samples/{id}/overview.json`). Also `src/sandbox/service.ts`, `src/sandbox/poll-worker.ts` (add `bullmq`), `src/routes/sandbox.ts`, config keys `TI_ANYRUN_API_KEY`, `TI_HYBRID_ANALYSIS_API_KEY`, `TI_TRIAGE_API_KEY`. Agent tool `sandbox_lookup` (read) and `sandbox_submit_url` (write → approval).

**Data model.**
```prisma
model SandboxReport { id String @id @db.Uuid @default(dbgenerated("gen_random_uuid()"))
  tenantId String @map("tenant_id") @db.Uuid;  provider String @db.VarChar(20);  kind String @db.VarChar(5)
  value String @db.Text;  iocId String? @map("ioc_id") @db.Uuid;  externalId String? @map("external_id")
  status String @db.VarChar(12);  verdict String? @db.VarChar(20);  score Int?
  summary Json @default("{}");  reportUrl String? @map("report_url");  createdAt DateTime @default(now()) @map("created_at")
  @@index([tenantId, value]) @@map("sandbox_reports") }
```

**Frontend.** "Sandbox" section in IOC detail + malware detail: provider picker, status, verdict badge, top network IOCs, link to provider report.

**Tests.** Provider adapters with recorded JSON fixtures; TLP gate; poll timeout; extracted IOCs job shape equals ingestion's normalize job; rate limit per provider.

**Acceptance.** Known-bad SHA-256 → existing public report found on at least one provider in < 10 s; URL submit waits for approval, completes, and its contacted domains appear as IOCs after normalization.

**Sessions.** 14.5a prisma (ask) S · 14.5b malware-intel providers + service + routes (one provider first) M · 14.5c poll worker + normalize hand-off + 2 more providers M · 14.5d frontend S.

**Owner decisions.** Which provider(s) and who pays (platform key vs tenant key) · allow URL detonation at all · Triage is owned by Recorded Future, a competitor — acceptable?

**Risks.** Public sandboxes make submissions public → TLP gate, default "lookup only" · free API quotas are small → per-tenant daily limit · we never download or store malware binaries.

---

## F6 — ATT&CK Navigator heatmap per tenant (frontend + one small endpoint)

**Goal.** One matrix page showing which ATT&CK techniques appear in the tenant's intel (IOCs, actors, enrichment), coloured by count and severity, with click-through to the evidence and export as an ATT&CK Navigator layer.

**Competitor reference.** Most Tier-1 TIPs; MITRE ATT&CK Navigator layer format is the common exchange.

**Current state (verified).**

| Area | Today | File |
|---|---|---|
| Matrix UI | `AttackTechniqueMatrix` — tactic columns, severity colours, links to mitre.org. Used in actor detail; actor page falls back to `DEMO_MITRE` | `apps/frontend/src/components/attack/AttackTechniqueMatrix.tsx`, `pages/ThreatActorListPage.tsx:49` |
| Technique fields | `Ioc.mitreAttack[]` (written by normalization from extraction), `ThreatActorProfile.ttps[]`, AI triage `mitre_techniques` stored inside `enrichmentData` JSON. `MalwareProfile` has **no** technique list (only `killChainPhases`, `capabilities`) | `prisma/schema.prisma:414,484,527`; `apps/normalization/src/service.ts:457` |
| Per-actor heatmap | `GET /api/v1/actors/:id/mitre-heatmap` | `apps/threat-actor-intel/src/routes/actors.ts:188` |
| Technique catalog | Only ~30 curated techniques with names/tactics | `packages/shared-normalization/src/attack-weighting.ts` |
| Tenant-wide aggregate | None | — |

**Flow.** `/attack` page → `GET /api/v1/ioc/attack-coverage?days=30` → `[{techniqueId, iocCount, actorCount, maxSeverity}]` → matrix with full catalog → click cell → IOC list filtered by technique → "Export layer" builds Navigator JSON in the browser.

**Backend change (ioc-intelligence, S).** `GET /api/v1/ioc/attack-coverage` — SQL `unnest(mitre_attack)` grouped count over the tenant's `iocs` (last N days), plus actor `ttps` via the actors API. Must use the tenant from the JWT.

**Frontend changes.** `src/data/attack-enterprise.json` (trimmed catalog: id, name, tactic list — build with a script from MITRE's `enterprise-attack.json`, ~100 KB, sub-techniques roll up to parents), `pages/AttackCoveragePage.tsx` + route `/attack` + sidebar link, extend `AttackTechniqueMatrix` with a `counts` prop (colour scale), `lib/navigator-layer.ts` (layer JSON export). Remove `DEMO_MITRE` fallback while there (honest UI, Step 5).

**Tests.** Aggregation SQL tenant filter; layer JSON matches Navigator schema fields (`name, domain:'enterprise-attack', techniques[{techniqueID, score, comment}]`); matrix renders unknown IDs in an "Other" column.

**Acceptance.** Tenant with IOCs tagged T1059/T1566 sees those cells coloured with correct counts; exported layer opens in the public ATT&CK Navigator.

**Sessions.** 14.6a ioc-intelligence endpoint S · 14.6b frontend page + catalog + export M.

**Owner decisions.** Include global (feed-wide) techniques or only the tenant's own IOCs · ATT&CK version to pin.

**Risks.** Sparse data (most IOCs have empty `mitreAttack`) → show "coverage from N IOCs" honestly; auto-enrich (Step 5) fills more.

---

## F7 — Third-party / vendor risk (reuse DRP engines) in drp-service

**Goal.** Tenants list their vendors (name + domains). ETIP watches those domains for typosquats, exposed services, certificate issues, leaks and mentions in threat feeds, and keeps a 0–100 vendor risk score with history.

**Competitor reference.** SecurityScorecard, BitSight, Recorded Future Third-Party Intelligence, Cyble, CloudSEK.

**Current state (verified) — important.**

| Engine | Real or simulated | File |
|---|---|---|
| Typosquat candidates (homoglyph, insertion, bitsquat, …) | **Real** permutations; but "is registered" is `Math.random() < 0.3` | `apps/drp-service/src/services/typosquat-detector.ts:260-266` |
| Attack surface scan | **Simulated** ports, certs, DNS (`simulatePortScan`, `Math.random`) | `services/attack-surface-scanner.ts:120-208` |
| Dark web monitor | **Simulated** sources | `services/dark-web-monitor.ts:32,129` |
| Credential leaks | **Simulated** breach DB (`source: 'simulated-breach-db'`) | `services/credential-leak-detector.ts:19,43` |
| Domain enricher DNS | **Simulated** ("production would use dns.resolve()") | `services/domain-enricher.ts:89` |
| CertStream | Matcher real; comment says it connects to certstream in production, no socket code found | `services/certstream-monitor.ts:49` |
| Asset types | `domain, brand_name, email_domain, social_handle, mobile_app` — no vendor concept | `schemas/drp.ts:5` |
| Persistence | In memory until Step 3 (S158) | `schemas/store.ts` |

So "reuse DRP engines" first means **making them real**. Otherwise vendor scores are random numbers.

**Flow.**
```
POST /api/v1/drp/vendors {name, domains[], criticality}
  daily job per vendor domain:
   ├─ typosquat permutations → real DNS resolve (node:dns) → registered look-alikes
   ├─ certificate transparency (crt.sh query or CertStream) → new/expiring certs, look-alike certs
   ├─ exposed services (Shodan/Censys if key set; else skip, never simulate)
   ├─ feed mentions: search GlobalArticle/IOCs for vendor name/domains (breach/ransomware leak posts)
   └─ CISA KEV / vuln-intel match on vendor's declared products (optional)
  → VendorFinding rows → score = weighted sum, capped 100 → VendorScoreHistory
  → drop ≥ 15 points → DRP alert + event vendor.risk.changed (playbook trigger)
```

**Backend changes (drp-service).** First, per engine: replace simulation with real lookups or return `unsupported` (never random). Then `services/vendor-registry.ts`, `services/vendor-scorer.ts`, `routes/vendors.ts`, job in the existing scan loop. Shared (ask): events `vendor.risk.changed`, `vendor.breach.detected`.

**Data model.**
```prisma
model Vendor { id String @id @db.Uuid @default(dbgenerated("gen_random_uuid()"))
  tenantId String @map("tenant_id") @db.Uuid;  name String @db.VarChar(200);  domains String[]
  criticality String @db.VarChar(10);  score Int @default(0);  lastScannedAt DateTime? @map("last_scanned_at")
  @@unique([tenantId, name]) @@map("vendors") }
model VendorFinding { id String @id @db.Uuid @default(dbgenerated("gen_random_uuid()"))
  tenantId String @map("tenant_id") @db.Uuid;  vendorId String @map("vendor_id") @db.Uuid
  kind String @db.VarChar(30);  severity String @db.VarChar(10);  evidence Json;  source String @db.VarChar(40)
  firstSeen DateTime @default(now()) @map("first_seen");  resolvedAt DateTime? @map("resolved_at")
  @@index([tenantId, vendorId]) @@map("vendor_findings") }
model VendorScoreHistory { vendorId String @map("vendor_id") @db.Uuid;  day DateTime @db.Date;  score Int
  @@id([vendorId, day]) @@map("vendor_score_history") }
```

**API.** `GET/POST /api/v1/drp/vendors`, `GET/PUT/DELETE /:id`, `GET /:id/findings`, `GET /:id/score-history`, `POST /:id/scan`, `POST /vendors/import` (CSV). **Frontend:** DRP page "Vendors" tab: table (score, trend sparkline, top finding), vendor detail, CSV import.

**Tests.** No `Math.random` in any engine used by vendors (lint test); DNS/crt.sh adapters with fixtures; score math; alert on drop; tenant isolation.

**Acceptance.** Add a vendor with a known registered look-alike domain → finding appears after one scan with real DNS evidence; score history shows one point per day.

**Sessions.** 14.7a drp-service: real DNS + typosquat registration (remove random) M · 14.7b drp-service: crt.sh/CertStream real feed M · 14.7c prisma (ask) S · 14.7d drp-service vendor registry + scorer + routes M · 14.7e frontend tab M.

**Owner decisions.** Paid data sources (Shodan/Censys, breach data) budget · plan gating (Enterprise only?) · show vendors a "disputed finding" flow later or never.

**Risks.** Legal: only passive, public data about vendors (no active port scanning of third parties without consent) · false positives on look-alike domains → confidence + review · simulated engines still used by DRP pages → fix them anyway (Step 5 "honest UI").

---

## F8 — India focus: CERT-In advisories feed, DPDP / RBI mapping in reports

**Goal.** (1) Ingest CERT-In advisories and vulnerability notes as a global feed. (2) Reports can add an "India regulatory mapping" section that links findings to CERT-In reporting duties, DPDP Act 2023 duties and RBI/SEBI cyber rules.

**Competitor reference.** Cyble and CloudSEK (India-focused threat intel), local MSSPs. Global TIPs rarely map to Indian rules.

**Current state (verified).**

| Area | Today | File |
|---|---|---|
| India sources | None. No `cert-in`, `dpdp`, `rbi`, `sebi` anywhere in code | grep → nothing |
| Global catalog | 10 seeded OSINT feeds (CISA KEV, NVD, OTX, URLhaus, …) | `apps/ingestion/src/services/global-catalog-seeder.ts` |
| Connectors | RSS, REST, TAXII, MISP, NVD, CISA KEV, … — `ConnectorResult {articles[]}` shape | `apps/ingestion/src/connectors/rss.ts`, `cisa-kev.ts` |
| Reports | 5 types, template sections from `AggregatedData`. **Report store is in memory** (`new Map`) — not listed in roadmap W4/W14 | `apps/reporting-service/src/services/report-store.ts:33`, `data-aggregator.ts` |

**Flow.**
```
CERT-In site (advisories CIAD-…, vulnerability notes CIVN-…)
  → ingestion connector 'cert-in' (RSS if available, else list-page parser)  [Step 9 plug-in]
  → GlobalArticle (+ CVE IOCs extracted) → normal pipeline
Report generate (type executive/monthly, option indiaMapping:true)
  → data-aggregator adds findings by category → static mapping table → section "India regulatory mapping"
```

**Backend changes.** ingestion: `src/connectors/cert-in.ts` (parse list page → title, ID, date, severity, CVEs, link; polite rate, 6 h interval), catalog seed entry "CERT-In Advisories" (region tag `IN`). reporting-service: `src/data/india-reg-map.json` (category → obligations, each with source + clause text short), `services/india-mapping.ts`, new template section type `india_regulatory`. Mapping rows to start: CERT-In Directions 28 Apr 2022 (report listed incident types within 6 h; keep logs 180 days); DPDP Act 2023 (personal-data breach → inform the Data Protection Board and affected people; verify timelines against the DPDP Rules in force); RBI IT governance / cyber security directions for regulated entities; SEBI CSCRF for market entities. **Legal review before release.**

**Data model.** None for the feed (uses `GlobalFeedCatalog`/`GlobalArticle`). Reports: add `options.indiaMapping` to the report request schema. Tenant setting `sector` (bank/NBFC/market/other) to choose rows — store in customization.

**Frontend.** Report builder: "India regulatory mapping" toggle; catalog shows the CERT-In feed with an India flag.

**Tests.** Connector against saved HTML/RSS fixtures (ID, date, CVE extraction); dedup by advisory ID; mapping picks rows by finding category + sector; section renders in HTML/PDF.

**Acceptance.** New CERT-In advisory appears in the catalog feed within 6 h with its CVEs linked; a monthly report for a bank tenant shows the mapping section with sources.

**Sessions.** 14.8a ingestion connector + seed M · 14.8b reporting-service mapping section M (after reporting persistence) · 14.8c frontend toggle S. **Also add** "reporting-service report store → Postgres" to roadmap Phase 1 (missing today).

**Owner decisions.** Confirm CERT-In terms of use for automated fetching · who signs off the legal mapping text · which sectors first (recommend banks/NBFCs).

**Risks.** Site layout changes break the parser → health check alert + fixture tests · wrong legal statements → "guidance, not legal advice" label + review.

---

## F9 — Browser extension: highlight IOCs/CVEs on any page with the ETIP verdict

**Goal.** A Chrome/Edge (Manifest V3) extension that finds IOCs and CVEs on the current page, looks them up in the user's ETIP tenant, and highlights them with severity and a hover card linking back to ETIP.

**Competitor reference.** Recorded Future Browser Extension, ThreatConnect Integrations extension, VirusTotal VT4Browsers.

**Current state (verified).**

| Area | Today | File |
|---|---|---|
| Public API | `/api/v1/public/*` with `X-API-Key` (prefix `etip_`, bcrypt, Redis 60 s cache, scopes) and plan rate limits | `apps/api-gateway/src/routes/public/index.ts`, `plugins/api-key-auth.ts` |
| Bulk lookup | `POST /api/v1/public/iocs/lookup` — up to 100 values, scope `ioc:read`, excludes TLP:RED, returns `{found[], notFound[]}` | `apps/api-gateway/src/routes/public/bulk.ts:19-61` |
| Lookup limits | Queries the tenant `Ioc` table only (not `GlobalIoc` overlays); lowercases every value (URL paths are case-sensitive) | `bulk.ts:30-43` |
| CVE | `cve` is an `IocType`, so CVEs stored as IOCs are found; vuln-intel profiles are not | `prisma/schema.prisma:341` |
| IOC regexes | 20+ patterns, but inside the ingestion app (not a package) | `apps/ingestion/src/workers/ioc-patterns.ts` |
| Workspace | `pnpm-workspace.yaml` includes `apps/*`, `packages/*` | root |

**Flow.**
```
content script: walk text nodes → regex (IOCs + CVE-\d{4}-\d+) → refang hxxp/[.] → dedupe → ≤100
  → message to service worker
service worker: POST https://intelwatch.in/api/v1/public/iocs/lookup  X-API-Key  (cache 15 min in chrome.storage.session)
  → results → content script wraps matches in <mark> (colour by severity) + hover card
hover card: type, severity, confidence, tags, lastSeen → "Open in ETIP" (/iocs?id=… — deep link from Step 11)
```

**Package.** New `apps/browser-extension` (TypeScript, Vite build to `dist/`, zip artifact in CI): `manifest.json` (MV3, `host_permissions: ["https://intelwatch.in/*"]`, `storage`, `activeTab`), `src/content/scan.ts`, `src/content/highlight.ts`, `src/background/lookup.ts`, `src/options/Options.tsx` (API key, allow/deny sites, on/off), `src/shared/patterns.ts`. Not part of the backend Docker image; still add its `package.json` COPY line to the Dockerfile deps stage so `--frozen-lockfile` stays happy (New Package Checklist).

**Backend changes (api-gateway, ask).** (1) Lookup also checks the tenant's subscribed `GlobalIoc` rows via overlay, and keeps case for URL paths. (2) Optional `POST /api/v1/public/vulnerabilities/lookup` for CVEs from vuln-intel. (3) New API-key scope `extension` = read-only lookup (so a leaked key cannot export data).

**Data model.** None.

**Tests.** Pattern tests (defanged forms; version strings like `1.2.3.4` must pass IP validation before lookup), MV3 message flow with mocked `chrome.*`, highlighter never touches `input`/`textarea`/`contenteditable`, cache hit path, 429 back-off.

**Acceptance.** On a public threat report page, known tenant IOCs are highlighted within 2 s; nothing is sent when the site is on the deny list; the key only works for lookup.

**Sessions.** 14.9a shared-normalization: move IOC patterns into a package export (ask) S · 14.9b api-gateway lookup fixes + `extension` scope M · 14.9c browser-extension package M · 14.9d CI zip + store listing S.

**Owner decisions.** Chrome Web Store / Edge Add-ons publisher account · Firefox now or later · plan gating (all plans with API access?).

**Risks.** Privacy: send only extracted indicators, never page text or URLs of the page; opt-in per site; clear privacy note · rate limits on busy pages → batch + cache · store review delays.
