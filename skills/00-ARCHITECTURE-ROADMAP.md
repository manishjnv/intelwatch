# SKILL: Architecture Document & Phased Implementation Roadmap
**ID:** 00-architecture-roadmap | **Version:** 3.0
**This is the single source of truth for all architectural decisions.**

---

## SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    ETIP — System Architecture                    │
├──────────────┬──────────────────────────────────────────────────┤
│   INTERNET   │  Threat Feeds | Dark Web | OSINT | Commercial    │
├──────────────┼──────────────────────────────────────────────────┤
│    EDGE      │  Cloudflare (DDoS) → Nginx (SSL/Proxy)           │
├──────────────┼──────────────────────────────────────────────────┤
│  API GATEWAY │  Auth | Rate Limit | Route | Audit | Tenant      │
├──────────────┼──────────────────────────────────────────────────┤
│   SERVICES   │                                                   │
│              │  Ingestion → Normalization → AI Enrichment        │
│              │  IOC | ThreatActor | Malware | Vuln | DRP        │
│              │  Graph | Correlation | Hunting                    │
│              │  User | Customization | Integration | Admin       │
│              │  Onboarding | Billing                             │
├──────────────┼──────────────────────────────────────────────────┤
│  EVENT BUS   │  BullMQ + Redis (async pipelines)                │
├──────────────┼──────────────────────────────────────────────────┤
│    CACHE     │  Redis L1 (48hr dashboard) + CDN L2              │
├──────────────┼──────────────────────────────────────────────────┤
│   STORAGE    │                                                   │
│              │  PostgreSQL (relational, multi-tenant RLS)        │
│              │  Elasticsearch (search + full-text)               │
│              │  Neo4j (graph relationships)                      │
│              │  Redis (cache + queues + sessions)                │
│              │  S3/MinIO (cold archive + files)                  │
├──────────────┼──────────────────────────────────────────────────┤
│   FRONTEND   │  React 18 + TypeScript + Vite (SPA)              │
├──────────────┼──────────────────────────────────────────────────┤
│  MONITORING  │  Prometheus + Grafana + ELK + Uptime Robot        │
├──────────────┼──────────────────────────────────────────────────┤
│    CI/CD     │  GitHub Actions → GHCR → Hostinger VPS           │
└──────────────┴──────────────────────────────────────────────────┘
```

---

## TECHNOLOGY STACK — CANONICAL

### Backend
| Component | Technology | Version | Reason |
|---|---|---|---|
| Runtime | Node.js | 20 LTS | Stable, wide ecosystem |
| Framework | Fastify | 4.x | Faster than Express, built-in schema validation |
| ORM | Prisma | 5.x | Type-safe, migrations, multi-DB |
| Graph DB | Neo4j | 5.x | Best-in-class graph queries |
| Search | Elasticsearch | 8.x | Full-text + faceted search |
| Cache/Queue | Redis | 7.x | Sessions, cache, BullMQ |
| Queue | BullMQ | 4.x | Reliable job processing |
| Auth | Passport.js | 0.7.x | SSO/SAML/OIDC/Google |
| AI | Anthropic SDK | Latest | Claude AI enrichment |
| Validation | Zod | 3.x | Runtime + TypeScript types |
| Logging | Pino | 9.x | Structured JSON logging |
| Archive | MinIO / S3-compatible | - | Cold storage for 60+ day data |

### Frontend
| Component | Technology | Version | Reason |
|---|---|---|---|
| Framework | React | 18.x | Industry standard |
| Language | TypeScript | 5.x | Type safety |
| Build | Vite | 5.x | Fast HMR |
| State (server) | TanStack Query | 5.x | Cache, sync, pagination |
| State (client) | Zustand | 4.x | Lightweight global state |
| UI Kit | shadcn/ui | Latest | Composable, accessible |
| Styling | Tailwind CSS | 3.x | Utility-first |
| Tables | TanStack Table | 8.x | Virtualized, sortable |
| Graph Viz | React Flow + D3 | Latest | Interactive knowledge graph |
| Charts | Recharts + D3 | Latest | Custom + standard charts |
| 3D Effects | Framer Motion | 10.x | Smooth 3D card effects |
| Tooltips | Floating UI | Latest | Accessible, precise |
| Forms | React Hook Form + Zod | Latest | Validated forms |
| Mobile | Responsive Tailwind | - | Mobile-first breakpoints |

---

## DATA ARCHITECTURE DECISIONS

### Multi-Tenancy
- **Strategy:** PostgreSQL Row-Level Security (RLS) + `tenant_id` on every table
- **Isolation:** Each tenant's data is fully isolated at DB query level
- **Redis:** Keys namespaced as `{tenantId}:{resourceType}:{id}`
- **Elasticsearch:** Index per tenant: `etip_{tenantId}_iocs`
- **Neo4j:** All nodes include `tenantId` property; queries always filter by tenantId

### Data Lifecycle (Feed Intel)
```
0-60 days:   HOT storage (PostgreSQL + ES) — fast queries, full features
60-180 days: WARM → auto-archive to MinIO/S3 (compressed Parquet/JSONL)
180+ days:   COLD — available on-demand via archive retrieval API
```

### Caching Strategy
```
L1 — Redis (48hr TTL):
  - Dashboard widget data
  - IOC search result pages
  - Enrichment results (per IOC type TTL)
  - User session data (15min)
  - Feed metadata (30min)

L2 — Browser cache (SWR):
  - Static assets (1 year, immutable)
  - API responses with ETag/Last-Modified

L3 — CDN (Cloudflare):
  - Frontend bundle
  - Public API responses where applicable
```

---

## PHASED IMPLEMENTATION ROADMAP

### PHASE 1 — Foundation (Weeks 1–2)
**Goal:** Working infrastructure, auth, and empty shell

| Task | Module | Priority |
|---|---|---|
| Project scaffold (monorepo setup) | 00-master | P0 |
| Docker + Nginx + VPS setup | 03-devops | P0 |
| Shared packages (types, utils, auth, normalization, enrichment) | 00-master | P0 |
| API Gateway (routing, auth middleware, rate limiting) | 00-master | P0 |
| User service (register, login, JWT, refresh) | 16-user-management | P0 |
| Google SSO + Admin code login | 16-user-management | P0 |
| Admin dashboard shell (empty but navigable) | 22-admin-platform | P1 |
| Basic frontend shell + routing | 20-ui-ux | P0 |
| CI/CD pipeline (GitHub Actions → VPS) | 03-devops | P0 |
| Centralized docs structure | 01-docs | P0 |

**Exit criteria:** User can register, login via Google/email, see empty dashboard. CI/CD deployed to VPS.

---

### PHASE 2 — Data Pipeline (Weeks 3–4)
**Goal:** Intelligence flows from feed → normalized → enriched → stored

| Task | Module | Priority |
|---|---|---|
| Normalization engine (all entity types) | 05-normalization | P0 |
| AI Enrichment service (Claude + VT + AbuseIPDB) | 06-ai-enrichment | P0 |
| Ingestion service (STIX, MISP, CSV, JSON, REST) | 04-ingestion | P0 |
| BullMQ pipeline wiring (normalize → enrich → store) | 21-module-integration | P0 |
| Feed management API + UI (add/enable/schedule feeds) | 04-ingestion | P0 |
| Caching layer (Redis L1 setup) | 23-caching-archival | P1 |

**Exit criteria:** A free OSINT feed (AlienVault OTX) can be activated, ingested, normalized, enriched, and stored end-to-end.

---

### PHASE 3 — Core Intelligence Modules (Weeks 5–8)
**Goal:** All primary intelligence modules functional

| Task | Module | Priority |
|---|---|---|
| IOC module (CRUD, search, pivot, lifecycle) | 07-ioc | P0 |
| Entity highlighting + clickable everywhere | 20-ui-ux | P0 |
| Threat Actor module | 08-threat-actor | P0 |
| Malware module + IOC extraction | 09-malware | P0 |
| Vulnerability module (CVE + EPSS + KEV) | 10-vulnerability | P0 |
| Top stats bar + page stats bars | 20-ui-ux | P0 |
| Elasticsearch indexing + full-text search | 07-ioc | P0 |
| Global search (Cmd+K) | 20-ui-ux | P1 |
| Investigation view (entity relationship sidebar) | 14-hunting | P1 |

**Exit criteria:** Analysts can search IOCs, view threat actors, browse malware and CVEs. All entities are clickable. Stats bars visible.

---

### PHASE 4 — Advanced Intelligence (Weeks 9–12)
**Goal:** Graph, correlation, hunting, DRP all operational

| Task | Module | Priority |
|---|---|---|
| Neo4j graph service (nodes + relationships) | 12-threat-graph | P0 |
| Graph visualization (React Flow + D3) | 12-threat-graph | P0 |
| Correlation engine (rule-based + AI) | 13-correlation | P0 |
| Threat hunting workspace | 14-hunting | P0 |
| Digital Risk Protection | 11-drp | P1 |
| Feed data archival (60-day rule) | 23-caching-archival | P1 |
| Investigation view (full) | 14-hunting | P0 |

**Exit criteria:** Analysts can explore knowledge graph, run correlations, and work investigations.

---

### PHASE 5 — Platform & Integrations (Weeks 13–16)
**Goal:** Enterprise-ready integrations and customization

| Task | Module | Priority |
|---|---|---|
| ServiceNow ITSM + CMDB connectors | 15-enterprise-integration | P0 |
| Splunk + Sentinel SIEM connectors | 15-enterprise-integration | P0 |
| Generic webhook connector | 15-enterprise-integration | P0 |
| RBAC fine-grained permissions | 16-user-management | P0 |
| SSO (SAML 2.0 + OIDC) for customers | 16-user-management | P0 |
| Module customization panel | 17-customization | P0 |
| AI model + token customization admin | 22-admin-platform | P0 |
| MFA (TOTP) | 16-user-management | P0 |
| Infra monitoring dashboard (admin) | 22-admin-platform | P0 |
| Emergency break-glass account (offline hardware-backed admin) | 16-user-management | P0 |
| mTLS client certificate auth for server-to-server integrations | api-gateway | P1 |
| HMAC inbound request signing (AWS Sig v4 style) | api-gateway | P1 |

---

### PHASE 6 — Growth & Monetization (Weeks 17–20)
**Goal:** Onboarding, billing, free-to-paid conversion

| Task | Module | Priority |
|---|---|---|
| Onboarding wizard (8 steps) | 18-onboarding | P0 |
| Free/Starter/Pro/Enterprise tier enforcement | 19-free-to-paid | P0 |
| Stripe billing integration | 19-free-to-paid | P0 |
| Upgrade prompts (contextual) | 19-free-to-paid | P0 |
| Demo data seeding | 18-onboarding | P0 |
| WebAuthn / Passkeys (FIDO2) — third MFA option alongside TOTP | 16-user-management | P1 |
| OAuth app management — user settings panel for connected third-party apps | 16-user-management | P2 |

---

### PHASE 7 — Performance & Production Hardening (Weeks 21–24)
**Goal:** Production-grade performance, security hardening, mobile, and accessibility

| Task | Module | Priority |
|---|---|---|
| Dashboard caching (48hr Redis) | 23-caching-archival | P0 |
| Archive retrieval API (on-demand) | 23-caching-archival | P0 |
| Mobile optimization (375px breakpoint) | 20-ui-ux | P0 |
| 3D hover effects + animations | 20-ui-ux | P1 |
| Full tooltip + inline help system | 20-ui-ux | P0 |
| Load testing (k6) | 02-testing | P0 |
| Accessibility audit (WCAG 2.1 AA) | 20-ui-ux | P1 |
| Circuit breaker per downstream service (opossum) | api-gateway | P0 |
| Adaptive / risk-based auth (geo + device + time anomaly scoring) | 16-user-management | P1 |
| Session anomaly alerts (new country / IP block detection) | 16-user-management | P1 |
| App-layer bot / scraper fingerprinting (headless browser detection) | api-gateway | P2 |

---

## UNIQUE SELLING POINTS vs. COMPETITORS

| USP | How ETIP Does It Better |
|---|---|
| **AI at every layer** | Claude enriches every entity, every module — not just select IOC types |
| **Plug-and-play modules** | <400 line files, each module independently deployable |
| **Entity-first UX** | Every entity clickable, highlighted, searchable inline + internet |
| **Unified data pipeline** | Mandatory normalize → enrich → graph → correlate pipeline (no raw data ever stored) |
| **Best-in-class graph** | Neo4j + React Flow with N-hop exploration, path finding, cluster analysis |
| **Performance-first** | 48hr dashboard cache, 60-day archival, ES for search — never slow |
| **Full customization** | AI model selection, risk score weights, module activation, per-tenant feature flags |
| **Admin intelligence** | Real-time infra monitoring, AI usage tracking, token budget management |
| **Onboarding** | Demo data seeded in 60 seconds, readiness checker, guided wizard |
| **Zero-friction SSO** | Google SSO + admin code login + customer SAML/OIDC — every auth method |

---

## ARCHITECTURAL DECISIONS LOG

| Date | Decision | Rationale |
|---|---|---|
| v3.0 | Fastify over Express | 2x throughput, built-in schema validation |
| v3.0 | MinIO for archival | S3-compatible, self-hostable on VPS |
| v3.0 | Parquet for cold archive | 10x compression vs JSON, columnar for analytics |
| v3.0 | BullMQ over Kafka | Sufficient throughput for initial scale, simpler ops |
| v3.0 | Pino over Winston | Structured JSON, lower overhead |
| v3.0 | TanStack Query v5 | Best-in-class server state, deduplication, caching |
| v3.0 | Framer Motion for 3D | CSS 3D transforms are fragile; Framer is cross-browser |
| v3.0 | Floating UI for tooltips | Accessible, auto-placement, no collision |

---

## PROPOSED NEW MODULES (3)
> Added from Strategic Architecture Review v1.0 — Sections 5 & 7 (P2)

### Module 24: playbook-service (Phase 5)

**Purpose:** Low-code if-then automation engine triggered by intelligence events.

**Core Components:**
- Playbook Designer — visual drag-and-drop builder in frontend
- Trigger Engine — listens to BullMQ events from all modules
- Action Executor — calls integration-service, user-service, or external APIs
- Execution Logger — full audit trail with step-by-step results
- Template Library — pre-built playbooks for common scenarios

**Data Flow:**
```
Event (ioc.created, alert.triggered, correlation.match)
  → Trigger Engine evaluates all active playbooks
  → Matching playbook steps execute sequentially
  → Each step: condition check → action → log → next step
  → Final: status update + notification
```

**Integration Points:**
- Consumes events from: all modules via BullMQ (uses `EVENTS` from 00-MASTER)
- Calls: integration-service (SIEM/ITSM), user-service (notifications), graph-service
- Produces: `playbook.execution.started`, `playbook.step.complete`, `playbook.execution.complete`

**Key Endpoints:**
```
POST   /api/v1/playbooks           → Create playbook
GET    /api/v1/playbooks           → List playbooks
PUT    /api/v1/playbooks/:id       → Update playbook
DELETE /api/v1/playbooks/:id       → Disable playbook (soft delete)
POST   /api/v1/playbooks/:id/test  → Dry-run with sample event
GET    /api/v1/playbooks/:id/runs  → Execution history
```

**Constraints:**
- Max 100 active playbooks per tenant
- Dangerous actions (block IP, create ticket) require `humanApproval: true` flag
- RBAC: only `admin` and `analyst` roles can create playbooks
- All executions are audited via `SOC2AuditWriter`

**Path:** `/apps/playbook-service/`

---

### Module 25: copilot-service (Phase 9)

**Purpose:** Conversational AI assistant for threat intelligence analysts.

**Core Components:**
- NL Query Parser — converts analyst questions to structured queries
- Graph Query Generator — NL → Neo4j Cypher via Claude
- Search Query Generator — NL → Elasticsearch DSL via Claude
- Response Synthesizer — combines multi-source results into analyst-friendly answers
- Context Manager — maintains conversation history per session (in Redis, 30 min TTL)

**Data Flow:**
```
Analyst: "What threat actors targeted healthcare in Q1?"
  → NL Parser extracts: entity=threat_actor, sector=healthcare, time=Q1
  → Graph Query: MATCH (a:ThreatActor)-[:TARGETS]->(v:Victim {industry:"healthcare"})
  → ES Query: threat_actors WHERE campaigns.timeframe IN Q1
  → Synthesizer: combines graph + ES results into narrative answer
  → Optional: generate hunting queries, create report, produce Sigma rules
```

**Integration Points:**
- Reads from: graph-service, ioc-service, threat-actor-service, hunting-service, ES
- Calls: Claude API (Sonnet for NL understanding, Haiku for classification)
- Produces: `copilot.query.completed`, `copilot.rule.generated`

**Key Endpoints:**
```
POST   /api/v1/copilot/query       → Natural language query
GET    /api/v1/copilot/history      → Conversation history
POST   /api/v1/copilot/sigma       → Generate Sigma rule from NL description
POST   /api/v1/copilot/yara        → Generate YARA rule from NL description
DELETE /api/v1/copilot/session      → Clear session context
```

**Initial deployment:** Phase 4 as `POST /api/v1/hunt/nl-query` in hunting-service.
Extract to standalone `copilot-service` when complexity grows (Phase 9).

**Path:** `/apps/copilot-service/`

---

### Module 26: supply-chain-service (Phase 9)

**Purpose:** Monitor third-party vendor security posture and supply chain threats.

**Core Components:**
- Vendor Registry — track all third-party relationships
- Security Scoring Engine — outside-in assessment from observable data
- Breach Monitor — alerts when vendor appears in breach data
- Compliance Tracker — vendor questionnaire management
- Risk Dashboard — portfolio-level view of third-party risk

**Data Flow:**
```
Vendor domain/ASN registered
  → ASM scan (exposed services, certificates, DNS)
  → Dark web check (breaches, credential leaks)
  → CVE match (public-facing technology stack)
  → Score calculation → alert if threshold exceeded
```

**Integration Points:**
- Reads from: drp-service (dark web), vuln-service (CVEs), graph-service (relationships)
- Produces: `vendor.risk.changed`, `vendor.breach.detected`

**Key Endpoints:**
```
POST   /api/v1/vendors              → Register vendor
GET    /api/v1/vendors              → List vendors with risk scores
GET    /api/v1/vendors/:id/risk     → Detailed risk breakdown
POST   /api/v1/vendors/:id/scan     → Trigger on-demand scan
GET    /api/v1/vendors/portfolio     → Portfolio risk summary
```

**Path:** `/apps/supply-chain-service/`

---

## UPDATED MODULE INVENTORY (v3.1)
> Added from Strategic Architecture Review v1.0 — Appendix A

| # | Module | Phase | Status | New? |
|---|--------|-------|--------|------|
| — | api-gateway | 1 | Planned | No |
| 04 | ingestion-service | 2 | Planned | No |
| 05 | normalization-service | 2 | Planned | No |
| 06 | enrichment-service | 2 | Planned | No |
| 07 | ioc-service | 3 | Planned | No |
| 08 | threat-actor-service | 3 | Planned | No |
| 09 | malware-service | 3 | Planned | No |
| 10 | vuln-service | 3 | Planned | No |
| 11 | drp-service | 4 | Planned | No |
| 12 | graph-service | 4 | Planned | No |
| 13 | correlation-service | 4 | Planned | No |
| 14 | hunting-service | 4 | Planned | No |
| 15 | integration-service | 5 | Planned | No |
| 16 | user-service | 5 | Planned | No |
| 17 | customization-service | 5 | Planned | No |
| 18 | onboarding-service | 6 | Planned | No |
| 19 | billing-service | 6 | Planned | No |
| 22 | admin-service | 6 | Planned | No |
| 20 | frontend | 8 | Planned | No |
| **24** | **playbook-service** | **5** | **Proposed** | **YES** |
| **25** | **copilot-service** | **9** | **Proposed** | **YES** |
| **26** | **supply-chain-service** | **9** | **Proposed** | **YES** |

---

## PHASE 9 — Market Differentiation (Months 13–24)
> Added from Strategic Architecture Review v1.0 — Section 7 (P2)

**Goal:** Features no competitor offers today. Establish ETIP as category-defining.

| Task | Module | Priority |
|---|---|---|
| Agentic threat hunting — Claude autonomous multi-step investigation | hunting-service | P0 |
| Predictive threat scoring — ML on exploitation patterns (EPSS-style) | vuln-service | P0 |
| Federated peer-to-peer intel sharing — anonymous cross-tenant | integration-service | P1 |
| NL → Sigma/YARA rule generation via Claude | copilot-service | P0 |
| Full confidence score explainability — audit trail per score component | shared-normalization | P0 |
| Multi-model hybrid pipeline — best model per subtask with benchmarks | enrichment-service | P1 |
| BYOK (Bring Your Own AI Key) — enterprise tenants use own API keys | enrichment-service | P0 |
| Supply chain intelligence module | supply-chain-service (NEW) | P1 |
| Embedded MITRE ATT&CK Navigator — auto-populated technique layers | frontend | P1 |
| Playbook automation engine — visual if-then builder | playbook-service (NEW) | P0 |
| ETIP as OIDC provider (outbound) — ETIP as IdP for customer security tools | 16-user-management | P1 |
| SMS / Email OTP as MFA fallback (after TOTP + WebAuthn ship) | 16-user-management | P2 |
| Device trust / remember-me (30d) — requires Phase 7 anomaly detection first | 16-user-management | P2 |
| GraphQL gateway endpoint — flexible querying for graph + correlation data | api-gateway | P1 |

**Exit criteria:** Agentic hunting produces autonomous investigation reports.
Sigma/YARA rules generate from natural language. BYOK operational for
enterprise tenants. Playbook engine executes automated response workflows.

---

## 5 UNIQUE DIFFERENTIATORS vs. ALL 20 COMPETITORS
> Added from Strategic Architecture Review v1.0 — Section 4.3

Features that **no competitor currently offers** at this depth:

| # | Differentiator | Description | Closest Competitor | ETIP Advantage |
|---|---|---|---|---|
| 1 | **BYOK (Bring Your Own AI Key)** | Enterprise tenants plug in their own Anthropic/OpenAI API keys for enrichment | None offer this | Full data sovereignty — tenant LLM traffic never touches ETIP keys. Removes AI cost as a barrier to enterprise adoption. |
| 2 | **Full Confidence Explainability** | Every confidence score decomposes into weighted components (feed reliability, corroboration, AI score, community, time-decay) with a complete audit trail | Recorded Future has basic scoring; none expose the full formula | Auditors and analysts can verify *why* an IOC is scored 85 — not just *that* it is. SOC 2 compliant by design. |
| 3 | **Multi-Model Hybrid Pipeline** | Route each enrichment subtask to the optimal model: Haiku for triage/classification, Sonnet for deep analysis, Batch API for bulk — with benchmark data per task type | Anomali has partial multi-model; none benchmark per-task | 50–80% cost reduction vs. single-model. Publish benchmark data as thought leadership content. |
| 4 | **Federated Peer-to-Peer Intel Sharing** | Built-in anonymous IOC sharing across tenants without external infrastructure (no separate MISP install required) | MISP requires separate infrastructure; ThreatConnect has Trusted Circles but requires their platform | Zero-setup sharing. Tenants opt-in with TLP enforcement. Community scoring feeds back into composite confidence. |
| 5 | **Open + Commercial Hybrid Model** | Free tier with STIX/TAXII open standards + paid enterprise with advanced AI, playbooks, and integrations | OpenCTI is open-only; Recorded Future is commercial-only | Captures both open-source community adoption AND enterprise revenue. Free tier drives organic growth; enterprise tier monetizes. |

---

## ARCHITECTURAL DECISIONS LOG (continued)

| Date | Decision | Rationale |
|---|---|---|
| v3.1 | Add playbook-service (Phase 5) | Gap A from competitor analysis — without playbooks ETIP is view-only |
| v3.1 | Add copilot-service (Phase 9) | Gap B — every Tier 1 competitor launched AI assistant in 2025 |
| v3.1 | Add supply-chain-service (Phase 9) | Gap D — third-party breaches doubled 2024→2025 |
| v3.1 | Phase 9 roadmap added | 10 differentiation features targeting months 13–24 |
| v3.1 | Composite confidence formula | Weighted 4-signal formula with exponential time-decay (see 05-NORMALIZATION) |
| v3.1 | IOC lifecycle state machine | 7-state FSM with enforced transitions (see 05-NORMALIZATION) |
| v3.1 | Service-to-service JWT (60s) | Zero-trust internal auth (see 00-MASTER) |
| v3.1 | Prompt injection defense | LLM input sanitization mandatory on all Claude API calls (see SKILL_SECURITY) |
| v3.1 | SOC 2 immutable audit logs | PostgreSQL trigger prevents UPDATE/DELETE; 7-year retention (see SKILL_SECURITY) |
| v3.1 | GDPR right-to-deletion API | Automated retention enforcement + deletion certificates (see SKILL_SECURITY) |
| v3.2 | Break-glass account (Phase 5 P0) | Single SAML/OIDC misconfiguration locks out all enterprise users without it |
| v3.2 | mTLS for SIEM integrations (Phase 5 P1) | Enterprise finance/gov customers require cert-based server-to-server auth |
| v3.2 | HMAC inbound request signing (Phase 5 P1) | Proof of request origin for high-assurance server-to-server API calls |
| v3.2 | WebAuthn / Passkeys (Phase 6 P1) | Next-gen MFA after TOTP; differentiator in security-conscious TI market |
| v3.2 | OAuth app management (Phase 6 P2) | Settings completeness required by onboarding wizard integration workflow |
| v3.2 | Circuit breaker via opossum (Phase 7 P0) | Prevents cascading failures under load; mandatory companion to k6 load tests |
| v3.2 | Adaptive auth (Phase 7 P1) | Requires 16 weeks login data for baselines; Phase 7 timing prevents false positives |
| v3.2 | Session anomaly alerts (Phase 7 P1) | Lightweight geo/IP comparison; precursor to full adaptive auth; MaxMind GeoIP |
| v3.2 | Bot fingerprinting (Phase 7 P2) | Protects rate-limit quotas from scraper traffic before real-scale load |
| v3.2 | ETIP as OIDC provider outbound (Phase 9 P1) | Platform stickiness play; only viable once large enterprise customer base exists |
| v3.2 | SMS/Email OTP MFA fallback (Phase 9 P2) | Security downgrade vs TOTP/WebAuthn; only needed for lost-authenticator edge case |
| v3.2 | Device trust / remember-me (Phase 9 P2) | Depends on Phase 7 anomaly detection to distinguish trusted vs untrusted devices |
| v3.2 | GraphQL gateway endpoint (Phase 9 P1) | REST insufficient for deeply nested graph/correlation data; add after Phase 4 maturity |
