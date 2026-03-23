# QA Checklist — Backend Features → UI Visibility

**Last updated:** 2026-03-24 (Session 46)
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
| - | Enrichment status (enriched/partial/pending/failed) | [B] 253 tests | [U] | /enrichment → EnrichmentPage.tsx | Real page, shows pending queue + status |
| - | enrichedToday dashboard stat | [B] /api/v1/enrichment/stats | [U] | DashboardPage.tsx:123 | Wired to real API via useDashboardStats → enrichedToday |
| - | Trigger manual enrichment | [B] POST /trigger | [U] | EnrichmentPage.tsx | Play button per pending IOC |
| - | Pending enrichment list | [B] GET /pending | [U] | EnrichmentPage.tsx | Table of IOCs awaiting enrichment |

### 15 Accuracy Improvements (Sessions 21–23)

| # | Feature | Backend | UI | Where to Display | Notes |
|---|---------|---------|-----|-----------------|-------|
| 1 | Structured Evidence Chain | [B] scoreJustification, evidenceSources[], uncertaintyFactors[] | [U] | IocListPage.tsx → EnrichmentDetailPanel | Evidence table: provider → dataPoint → interpretation |
| 2 | MITRE ATT&CK Techniques | [B] mitreTechniques[] (T-code validated) | [U] | IocListPage.tsx → EnrichmentDetailPanel | Badges with T-codes |
| 3 | False Positive Detection | [B] isFalsePositive, falsePositiveReason, severity→INFO | [U] | IocListPage.tsx → EnrichmentDetailPanel | FP badge + reason shown |
| 4 | Confidence Feedback Loop | [B] Wires aiScore → IOC.confidence | [P] | IOC list confidence column | Confidence updates visible indirectly |
| 5 | Budget Enforcement Gate | [B] 90% rule-based fallback, 100% skip | [U] | EnrichmentPage.tsx budget gauge | Budget gauge shows spent/limit/% |
| 6 | Redis Enrichment Cache | [B] Type-specific TTLs, cache hit tracking | [U] | EnrichmentPage.tsx | Cache hit rate section |
| 7 | Malware Families + Actors | [B] malwareFamilies[], attributedActors[] | [P] | FlipDetailCard badges | Shown in flip card only, not in main table or filters |
| 8 | Recommended Actions | [B] recommendedActions[] (action + priority) | [U] | IocListPage.tsx → EnrichmentDetailPanel | Actionable cards: immediate/short_term/long_term |
| 9 | STIX 2.1 Labels | [B] stixLabels[] | [U] | IocListPage.tsx → EnrichmentDetailPanel | Badges with STIX vocabulary labels |
| 10 | Enrichment Quality Score | [B] enrichmentQuality (0-100) | [U] | IocListPage.tsx → EnrichmentDetailPanel | Quality gauge per IOC |
| 11 | Prompt Caching | [B] cache_control ephemeral, cacheReadTokens | [U] | EnrichmentPage.tsx | Cache hit rate + token savings |
| 12 | Geolocation | [B] countryCode, isp, usageType, isTor | [U] | IocListPage.tsx → EnrichmentDetailPanel | Country flag + ISP + Tor badge (IP only) |
| 13 | Batch Enrichment API | [B] POST /batch, GET /batch/:batchId | [U] | EnrichmentPage.tsx | Batch enrich form with progress |
| 14 | Cost Persistence | [B] Redis flush/reload every 60s | [-] | - | Transparent — no UI needed |
| 15 | Re-enrichment Scheduler | [B] Hourly scan, type-specific TTLs | [U] | EnrichmentPage.tsx | Scheduler status + next scan time |

### Cost Transparency (Differentiator A)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Aggregate cost stats | [B] GET /cost/stats | [U] | EnrichmentPage.tsx | Headline + provider/type bar charts |
| - | Per-IOC cost breakdown | [B] GET /cost/ioc/:id | [U] | IocListPage.tsx → EnrichmentDetailPanel | Provider table: VT $0, AbuseIPDB $0, Haiku $X |
| - | Tenant budget status | [B] GET /cost/budget | [U] | EnrichmentPage.tsx | Budget gauge: spent/limit, % used |
| - | Cost by provider chart | [B] byProvider in stats | [U] | EnrichmentPage.tsx | Bar chart |
| - | Cost by IOC type chart | [B] byIOCType in stats | [U] | EnrichmentPage.tsx | Bar chart |

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
| - | IOC detail view | [B] 15 endpoints | [U] | IocListPage.tsx → EnrichmentDetailPanel | Enrichment panel with all fields wired |
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

---

## Phase 4: Advanced Intelligence (Sessions 25–33)

## Module 11: DRP Service (Port 3011)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Asset CRUD + monitoring | [B] 310 tests, 36 endpoints | [U] | DRPDashboardPage.tsx | Asset list, add/edit/delete |
| - | Alert triage | [B] | [U] | DRPDashboardPage.tsx | Alert queue with TP/FP controls |
| - | Typosquat detection | [B] 7 methods, composite scoring | [U] | DRPDashboardPage.tsx | Detection results per asset |
| - | CertStream monitor | [B] | [U] | DRPDashboardPage.tsx | Certificate transparency feed |

## Module 12: Threat Graph (Port 3012)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Graph traversal + path finder | [B] 294 tests, 32 endpoints | [U] | ThreatGraphPage.tsx | Visual graph with path finder |
| - | Add node / edge | [B] | [U] | ThreatGraphPage.tsx | Node creation form |
| - | STIX export | [B] | [U] | ThreatGraphPage.tsx | Export button |
| - | Neo4j-backed storage | [B] | [U] | ThreatGraphPage.tsx | Live graph data from Neo4j |

## Module 13: Correlation Engine (Port 3013)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Rule management + evaluation | [B] 166 tests, 20 endpoints | [U] | CorrelationPage.tsx | Rule list, create/edit |
| - | TP/FP feedback | [B] | [U] | CorrelationPage.tsx | Feedback controls per alert |
| - | AI pattern detection | [B] | [U] | CorrelationPage.tsx | AI-detected correlation patterns |
| - | Correlation decay | [B] | [U] | CorrelationPage.tsx | Decay status visible |

## Module 14: Threat Hunting (Port 3014)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Create hunt + hypotheses | [B] 222 tests, 47 endpoints | [U] | HuntingWorkbenchPage.tsx | Hunt creation wizard |
| - | Hunt status controls | [B] | [U] | HuntingWorkbenchPage.tsx | Start/pause/complete controls |
| - | Evidence management | [B] | [U] | HuntingWorkbenchPage.tsx | Evidence attach per hypothesis |
| - | Hunt reporting | [B] | [U] | HuntingWorkbenchPage.tsx | Summary export |

---

## Phase 5: Enterprise Features (Sessions 34–38)

## Module 15: Enterprise Integration (Port 3015)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Integration CRUD | [B] 335 tests, 58 endpoints | [U] | IntegrationPage.tsx | Connector list, add/configure |
| - | Webhook management | [B] | [U] | IntegrationPage.tsx | Webhook setup + test |
| - | OAuth flows | [B] | [U] | IntegrationPage.tsx | OAuth connect buttons |
| - | SIEM / SOAR connectors | [B] | [U] | IntegrationPage.tsx | Integration cards per type |

## Module 16: User Management (Port 3016)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | User CRUD + roles | [B] 185 tests, 32 endpoints | [U] | UserManagementPage.tsx | User table, invite, role assignment |
| - | MFA management | [B] | [U] | UserManagementPage.tsx | MFA status per user |
| - | Audit trail | [B] | [U] | UserManagementPage.tsx | Activity log tab |
| - | SSO configuration | [B] | [U] | UserManagementPage.tsx | SSO settings section |

## Module 17: Customization (Port 3017)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Branding + themes | [B] 159 tests, 35 endpoints | [U] | CustomizationPage.tsx | Logo upload, color picker |
| - | Dashboard layout config | [B] | [U] | CustomizationPage.tsx | Widget drag-and-drop config |
| - | Notification preferences | [B] | [U] | CustomizationPage.tsx | Alert channel settings |
| - | Custom fields | [B] | [U] | CustomizationPage.tsx | Schema extension UI |

---

## Phase 6: Operations & Growth (Sessions 39–45)

## Module 18: Onboarding (Port 3018)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | 8-step wizard | [B] 190 tests, 32 endpoints | [U] | OnboardingPage.tsx | Step-by-step wizard with progress |
| - | Pipeline health check | [B] | [U] | OnboardingPage.tsx | Service health indicators |
| - | Module readiness view | [B] | [U] | OnboardingPage.tsx | Module readiness grid |
| - | Quick start checklist | [B] | [U] | OnboardingPage.tsx | Actionable checklist items |

## Module 19: Billing (Port 3019)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Plan cards (Free/Starter/Teams/Enterprise) | [B] 149 tests, 28 endpoints | [U] | BillingPage.tsx | Pricing v3: ₹9,999/₹18,999/₹49,999 |
| - | Usage metering | [B] | [U] | BillingPage.tsx | Per-resource usage bars |
| - | Upgrade / downgrade flow | [B] | [U] | BillingPage.tsx | Plan change with Razorpay |
| - | Invoice history | [B] | [U] | BillingPage.tsx | Invoice list with download |
| - | Coupon codes | [B] | [U] | BillingPage.tsx | Coupon input at checkout |

## Module 22: Admin Ops (Port 3022)

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | System health dashboard | [B] 147 tests, 28 endpoints | [U] | AdminOpsPage.tsx | Service health + metrics |
| - | Maintenance mode | [B] | [U] | AdminOpsPage.tsx | Toggle + scheduled windows |
| - | Backup / restore | [B] | [U] | AdminOpsPage.tsx | Backup trigger + restore list |
| - | Tenant admin | [B] | [U] | AdminOpsPage.tsx | Tenant list + impersonate |
| - | Audit log | [B] | [U] | AdminOpsPage.tsx | Filterable audit trail |

---

## Dashboard

| # | Feature | Backend | UI | Route/Component | Notes |
|---|---------|---------|-----|-----------------|-------|
| - | Total IOCs | [B] | [U] | DashboardPage.tsx | Stat card |
| - | Active Feeds | [B] | [U] | DashboardPage.tsx | Stat card |
| - | Critical IOCs | [B] | [U] | DashboardPage.tsx | Stat card |
| - | Enriched Today | [B] /enrichment/stats | [U] | DashboardPage.tsx:123 | Wired to enrichment API (falls back to 0) |
| - | Severity distribution chart | [B] | [U] | DashboardPage.tsx | Pie chart |
| - | IOC type distribution chart | [B] | [U] | DashboardPage.tsx | Bar chart |

---

## Known Gaps (Backend Built, UI Missing)

| # | Feature | Module | Where it belongs | Priority |
|---|---------|--------|-----------------|----------|
| 1 | Campaign detection | Module 07 IOC Intel | IOC list page — campaign badge/filter | P1 |
| 2 | MITRE ATT&CK mapping (actor detail) | Module 08 Threat Actor | Actor detail panel | P1 |
| 3 | IOC linkage on actors | Module 08 Threat Actor | Actor detail → linked IOC list | P1 |
| 4 | IOC linkage on malware | Module 09 Malware Intel | Malware detail → linked IOC list | P1 |
| 5 | IOC extraction results | Module 09 Malware Intel | Malware detail → extracted IOCs | P1 |
| 6 | Enrichment quality distribution chart | Module 06 | Dashboard or EnrichmentPage | P2 |
| 7 | Cost summary widget | Module 06 | Dashboard | P2 |
| 8 | IOC lifecycle management UI | Module 05 | IocListPage — lifecycle state transitions | P2 |

---

## How to Update This File

After every implementation session:
1. Change `[-]` → `[B]` when backend feature is coded + tested
2. Change `[B]` → `[P]` when partial UI exists (data shown but incomplete)
3. Change `[P]` → `[U]` when feature is fully visible and functional in browser
4. Add new rows for new features
5. Update "Last updated" date and session number
