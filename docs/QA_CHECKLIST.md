# QA Checklist — Backend Features → UI Visibility

**Last updated:** 2026-03-22 (Session 23)
**Rule:** Update this file after every implementation session via /session-end.
**Rule:** A feature is "DONE" only when it is visible and functional in the browser, not just coded.

---

## Status Legend

- `[B]` = Backend only (coded + tested, not in UI)
- `[U]` = UI wired (displayed in browser, functional)
- `[-]` = Not started
- `[P]` = Partial (some data shown, not complete)

---

## Module 06: AI Enrichment Service (Port 3006)

### Core Enrichment Pipeline

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Enrichment status (enriched/partial/pending/failed) | [B] 253 tests | [-] | /enrichment → ComingSoonPage | Replace ComingSoonPage with real page |
| - | enrichedToday dashboard stat | [B] /api/v1/enrichment/stats | [-] | DashboardPage.tsx:120 | Hardcoded to 0 — wire to real API |
| - | Trigger manual enrichment | [B] POST /trigger | [-] | - | Button on IOC detail → queue enrichment |
| - | Pending enrichment list | [B] GET /pending | [-] | - | Table of IOCs awaiting enrichment |

### 15 Accuracy Improvements (Sessions 21–23)

| # | Feature | Backend | UI | Where to Display | Notes |
|---|---------|---------|-----|-----------------|-------|
| 1 | Structured Evidence Chain | [B] scoreJustification, evidenceSources[], uncertaintyFactors[] | [-] | IOC detail panel | Show evidence table: provider → dataPoint → interpretation |
| 2 | MITRE ATT&CK Techniques | [B] mitreTechniques[] (T-code validated) | [-] | IOC detail panel | Badges linking to MITRE website |
| 3 | False Positive Detection | [B] isFalsePositive, falsePositiveReason, severity→INFO | [-] | IOC list + detail | FP badge/icon on list row, reason in detail |
| 4 | Confidence Feedback Loop | [B] Wires aiScore → IOC.confidence | [P] | IOC list confidence column | Confidence updates visible indirectly |
| 5 | Budget Enforcement Gate | [B] 90% rule-based fallback, 100% skip | [-] | Cost dashboard | Show when fallback was triggered |
| 6 | Redis Enrichment Cache | [B] Type-specific TTLs, cache hit tracking | [-] | Cost dashboard | Cache hit rate metric |
| 7 | Malware Families + Actors | [B] malwareFamilies[], attributedActors[] | [P] | FlipDetailCard badges | Shown in flip card only, not in main table or filters |
| 8 | Recommended Actions | [B] recommendedActions[] (action + priority) | [-] | IOC detail panel | Actionable cards: immediate/short_term/long_term |
| 9 | STIX 2.1 Labels | [B] stixLabels[] | [-] | IOC detail panel | Badges with STIX vocabulary labels |
| 10 | Enrichment Quality Score | [B] enrichmentQuality (0-100) | [-] | IOC list + detail | Quality gauge/badge per IOC |
| 11 | Prompt Caching | [B] cache_control ephemeral, cacheReadTokens | [-] | Cost dashboard | Show token savings from caching |
| 12 | Geolocation | [B] countryCode, isp, usageType, isTor | [-] | IOC detail (IP only) | Country flag + ISP + Tor badge |
| 13 | Batch Enrichment API | [B] POST /batch, GET /batch/:batchId | [-] | Enrichment management page | Bulk enrich UI with progress tracking |
| 14 | Cost Persistence | [B] Redis flush/reload every 60s | [-] | - | Transparent — ensures cost data survives restarts |
| 15 | Re-enrichment Scheduler | [B] Hourly scan, type-specific TTLs | [-] | Enrichment management page | Show next scan time, stale IOC count |

### Cost Transparency (Differentiator A)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Aggregate cost stats | [B] GET /cost/stats | [-] | Cost dashboard page | Headline: "301 IOCs enriched for $0.12" |
| - | Per-IOC cost breakdown | [B] GET /cost/ioc/:id | [-] | IOC detail panel | Provider table: VT $0, AbuseIPDB $0, Haiku $X |
| - | Tenant budget status | [B] GET /cost/budget | [-] | Cost dashboard page | Budget gauge: spent/limit, % used |
| - | Cost by provider chart | [B] byProvider in stats | [-] | Cost dashboard page | Pie/bar chart |
| - | Cost by IOC type chart | [B] byIOCType in stats | [-] | Cost dashboard page | Pie/bar chart |

---

## Module 04: Ingestion Service (Port 3004)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Feed CRUD | [B] 276 tests | [U] | FeedListPage.tsx | Working — list, add, enable/disable |
| - | Feed status + health | [B] /feeds | [U] | FeedListPage.tsx | Status badges, last fetch, failures |
| - | Feed scheduling | [B] Cron-based scheduler | [U] | FeedListPage.tsx | Schedule column visible |
| - | Article ingestion count | [B] totalItemsIngested | [U] | FeedListPage.tsx | Displayed per feed |

## Module 05: Normalization Service (Port 3005)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | IOC normalization + dedup | [B] 139 tests | [P] | IocListPage.tsx | IOCs displayed but no normalization metadata |
| - | Confidence decay (6h cron) | [B] Lifecycle transitions | [P] | IocListPage.tsx confidence column | Confidence values visible, decay transparent |
| - | IOC lifecycle states | [B] 7-state FSM | [P] | IocListPage.tsx lifecycle column | States shown but no lifecycle management UI |

## Module 07: IOC Intelligence (Port 3007)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | IOC search + filters | [B] 119 tests | [U] | IocListPage.tsx | Search, type filter, severity filter |
| - | IOC detail view | [B] 15 endpoints | [P] | FlipDetailCard | Basic fields only, no enrichment detail |
| - | Campaign detection | [B] | [-] | - | Not surfaced in UI |

## Module 08: Threat Actor Intel (Port 3008)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Actor profiles + search | [B] 190 tests | [U] | ThreatActorListPage.tsx | Full list with filters |
| - | MITRE ATT&CK mapping | [B] | [-] | - | Not surfaced in actor detail |
| - | IOC linkage | [B] | [-] | - | Not surfaced in UI |

## Module 09: Malware Intel (Port 3009)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Malware profiles + search | [B] 149 tests | [U] | MalwareListPage.tsx | Full list with filters |
| - | IOC extraction | [B] | [-] | - | Not surfaced in UI |

## Module 10: Vulnerability Intel (Port 3010)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | CVE search + EPSS + KEV | [B] 119 tests | [U] | VulnerabilityListPage.tsx | Full list with CVSS, EPSS, KEV badges |
| - | Exploit availability | [B] | [U] | VulnerabilityListPage.tsx | Boolean badge in table |

## Dashboard

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Total IOCs | [B] | [U] | DashboardPage.tsx | Stat card |
| - | Active Feeds | [B] | [U] | DashboardPage.tsx | Stat card |
| - | Critical IOCs | [B] | [U] | DashboardPage.tsx | Stat card |
| - | Enriched Today | [B] /enrichment/stats | [-] | DashboardPage.tsx:120 | **HARDCODED TO 0** — wire to API |
| - | Severity distribution chart | [B] | [U] | DashboardPage.tsx | Pie chart |
| - | IOC type distribution chart | [B] | [U] | DashboardPage.tsx | Bar chart |

---

## UI Sessions Required

### Session A: Enrichment Detail Panel (unfreeze IOC detail)
Wire enrichment data to IOC detail view:
- Evidence chain table
- MITRE technique badges
- FP detection badge + reason
- Recommended actions cards
- STIX labels
- Quality score gauge
- Geolocation (IP only): flag + ISP + Tor
- Cost breakdown table

### Session B: Enrichment Management Page (replace ComingSoonPage)
Build `/enrichment` page:
- Enrichment stats (total/enriched/pending)
- Pending queue with manual trigger
- Re-enrichment scheduler status
- Batch enrichment form
- Cost dashboard (headline, budget gauge, provider/type charts)
- Cache hit rate

### Session C: Dashboard Wiring
- Wire `enrichedToday` to real `/api/v1/enrichment/stats`
- Add enrichment quality distribution chart
- Add cost summary widget

---

## How to Update This File

After every implementation session:
1. Change `[-]` → `[B]` when backend feature is coded + tested
2. Change `[B]` → `[P]` when partial UI exists (data shown but incomplete)
3. Change `[P]` → `[U]` when feature is fully visible and functional in browser
4. Add new rows for new features
5. Update "Last updated" date and session number
