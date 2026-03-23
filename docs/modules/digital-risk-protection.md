# Digital Risk Protection Service (Module 11)
**Port:** 3011 | **Status:** 🔨 FEATURE-COMPLETE (15/15 improvements + accuracy) | **Tests:** 310

## Features

| Feature | File | Description |
|---------|------|-------------|
| Asset Management | `services/asset-manager.ts` | CRUD, validation, normalization, lifecycle for monitored assets (domain, brand, email, social, app) |
| Alert Management | `services/alert-manager.ts` | CRUD, status transitions (open→investigating→resolved/false_positive), triage, assignment |
| Typosquatting Detection | `services/typosquat-detector.ts` | 12 algorithms: homoglyph, insertion, deletion, transposition, TLD variant, combosquatting, bitsquatting, keyboard proximity, vowel-swap, repetition, hyphenation, subdomain |
| Typosquat Constants | `services/typosquat-constants.ts` | HOMOGLYPHS (Cyrillic/Greek), COMBO_KEYWORDS, KEYBOARD_ADJACENCY, VOWELS, TLD_RISK_SCORES |
| Similarity Scoring | `services/similarity-scoring.ts` | Jaro-Winkler, soundex, normalized Levenshtein, TLD risk, composite risk score |
| CertStream Monitor | `services/certstream-monitor.ts` | Real-time certificate transparency monitoring, fuzzy matching, rate limiting, burst detection |
| Domain Enricher | `services/domain-enricher.ts` | WHOIS/DNS/SSL enrichment adapter (simulated in dev, pluggable for production) |
| Dark Web Monitoring | `services/dark-web-monitor.ts` | Simulated feeds (paste, forum, marketplace, telegram, IRC), keyword matching |
| Credential Leak Detection | `services/credential-leak-detector.ts` | Email/domain breach monitoring, 10 simulated breaches, severity classification |
| Attack Surface Scanning | `services/attack-surface-scanner.ts` | Port scan, cert transparency, DNS enumeration (simulated) |
| #1 Confidence Scoring | `services/confidence-scorer.ts` | Multi-signal weighted scoring with human-readable reason summaries |
| #2 Signal Tracking | `services/signal-aggregator.ts` | Per-signal TP/FP tracking, success rate stats |
| #3 Evidence Chain | `services/evidence-chain.ts` | Linked audit trail from detection signal → alert creation |
| #4 Alert Deduplication | `services/alert-deduplication.ts` | Cross-type dedup with similarity thresholds, corroboration boost |
| #5 Severity Classification | `services/severity-classifier.ts` | Multi-factor: confidence, asset criticality, type risk, signal density, repeat |
| Graph Integration | `services/graph-integration.ts` | HTTP + service JWT to threat-graph, retry with exponential backoff |
| #6 Batch Typosquat | `services/batch-typosquat.ts` | Multi-domain scan, cross-domain dedup, consolidated report |
| #7 AI Alert Enrichment | `services/ai-enrichment.ts` | Simulated Haiku enrichment for hosting/contacts/actions, budget-gated |
| #8 Bulk Alert Triage | `services/bulk-triage.ts` | Triage by IDs or filter, batch status/severity/assign/tags |
| #9 Trending Risk Analysis | `services/trending-analysis.ts` | Time-series buckets, rolling average, z-score anomaly, trend detection |
| #10 Social Impersonation | `services/social-impersonation.ts` | Handle variations, name/handle/avatar similarity, Levenshtein |
| #11 Takedown Generation | `services/takedown-generator.ts` | Templated docs for registrar/hosting/social/app_store platforms |
| #12 Alert Export | `services/alert-exporter.ts` | CSV, JSON, STIX 2.1 bundle export with filters |
| #13 Rogue App Detection | `services/rogue-app-detector.ts` | Name/icon similarity, multi-store scan (Google Play, Apple, 3rd-party) |
| #14 Risk Aggregation | `services/risk-aggregator.ts` | Weighted composite score per asset, criticality amplification, trend |
| #15 Cross-Correlation | `services/cross-correlation.ts` | Shared hosting, temporal clusters, multi-vector, graph push |

## API (36 endpoints)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/drp/assets` | alert:create | Create monitored asset |
| GET | `/api/v1/drp/assets` | alert:read | List assets (paginated, filter by type) |
| GET | `/api/v1/drp/assets/stats` | alert:read | Asset statistics |
| GET | `/api/v1/drp/assets/:id` | alert:read | Get single asset |
| PUT | `/api/v1/drp/assets/:id` | alert:update | Update asset |
| DELETE | `/api/v1/drp/assets/:id` | alert:update | Delete asset |
| POST | `/api/v1/drp/assets/:id/scan` | alert:create | Trigger scan on single asset |
| POST | `/api/v1/drp/assets/scan-all` | alert:create | Trigger scan on all tenant assets |
| GET | `/api/v1/drp/alerts` | alert:read | List alerts (filter by type/status/severity) |
| GET | `/api/v1/drp/alerts/stats` | alert:read | Alert stats |
| GET | `/api/v1/drp/alerts/:id` | alert:read | Get alert with evidence |
| PATCH | `/api/v1/drp/alerts/:id/status` | alert:update | Change alert status |
| PATCH | `/api/v1/drp/alerts/:id/assign` | alert:update | Assign to analyst |
| POST | `/api/v1/drp/alerts/:id/triage` | alert:update | Triage (severity, notes, tags) |
| POST | `/api/v1/drp/alerts/:id/feedback` | alert:create | Submit TP/FP verdict |
| POST | `/api/v1/drp/detect/typosquat` | alert:create | Run typosquatting scan |
| POST | `/api/v1/drp/detect/darkweb` | alert:create | Run dark web scan |
| POST | `/api/v1/drp/detect/credentials` | alert:create | Run credential leak check |
| POST | `/api/v1/drp/detect/surface` | alert:create | Run attack surface scan |
| GET | `/api/v1/drp/detect/results/:scanId` | alert:read | Get scan results |
| GET | `/api/v1/drp/stats` | alert:read | Global DRP dashboard stats |
| GET | `/api/v1/drp/confidence/:alertId` | alert:read | Confidence breakdown |
| GET | `/api/v1/drp/signals` | alert:read | Signal success rates |
| GET | `/api/v1/drp/evidence/:alertId` | alert:read | Evidence chain |
| POST | `/api/v1/drp/detect/typosquat/batch` | alert:create | #6 Batch multi-domain typosquat scan |
| POST | `/api/v1/drp/alerts/:id/enrich` | alert:update | #7 AI alert enrichment (hosting, contacts, actions) |
| POST | `/api/v1/drp/alerts/bulk-triage` | alert:update | #8 Bulk triage by IDs or filter |
| GET | `/api/v1/drp/analytics/trending` | alert:read | #9 Trending risk analysis (z-score anomaly) |
| POST | `/api/v1/drp/detect/social` | alert:create | #10 Social media impersonation scan |
| POST | `/api/v1/drp/alerts/:id/takedown` | alert:create | #11 Generate takedown request document |
| GET | `/api/v1/drp/alerts/export` | alert:read | #12 Export alerts (CSV/JSON/STIX) |
| POST | `/api/v1/drp/detect/rogue-apps` | alert:create | #13 Rogue mobile app detection |
| GET | `/api/v1/drp/assets/:id/risk` | alert:read | #14 Per-asset composite risk score |
| POST | `/api/v1/drp/analytics/correlate` | alert:create | #15 Cross-alert correlation + graph push |
| GET | `/api/v1/drp/certstream/status` | alert:read | CertStream monitor health + stats |

## Config

| Var | Default | Purpose |
|-----|---------|---------|
| TI_DRP_PORT | 3011 | Service port |
| TI_DRP_HOST | 0.0.0.0 | Bind host |
| TI_DRP_MAX_TYPOSQUAT_CANDIDATES | 200 | Max candidates per scan |
| TI_DRP_SCAN_TIMEOUT_MS | 30000 | Scan timeout |
| TI_DRP_GRAPH_SYNC_ENABLED | false | Push alerts to graph |
| TI_DRP_MAX_ASSETS_PER_TENANT | 100 | Max monitored assets per tenant |
| TI_GRAPH_SERVICE_URL | http://localhost:3012 | Graph service URL |
| TI_DRP_AI_ENRICHMENT_ENABLED | false | Enable AI alert enrichment |
| TI_DRP_AI_MAX_BUDGET_PER_DAY | 5.0 | Max daily AI enrichment spend ($) |
| TI_DRP_AI_COST_PER_CALL | 0.01 | Cost per AI enrichment call ($) |
| TI_DRP_CERTSTREAM_ENABLED | false | Enable CertStream real-time monitor |
| TI_DRP_CERTSTREAM_URL | wss://certstream.calidog.io | CertStream WebSocket URL |
| TI_DRP_CERTSTREAM_MAX_MATCHES_PER_HOUR | 1000 | Rate limit for CertStream matches |
