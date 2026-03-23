# Digital Risk Protection Service (Module 11)
**Port:** 3011 | **Status:** 🔨 WIP (P0 complete, P1/P2 pending) | **Tests:** 158

## Features

| Feature | File | Description |
|---------|------|-------------|
| Asset Management | `services/asset-manager.ts` | CRUD, validation, normalization, lifecycle for monitored assets (domain, brand, email, social, app) |
| Alert Management | `services/alert-manager.ts` | CRUD, status transitions (open→investigating→resolved/false_positive), triage, assignment |
| Typosquatting Detection | `services/typosquat-detector.ts` | 5 algorithms: homoglyph, insertion, deletion, transposition, TLD variant |
| Dark Web Monitoring | `services/dark-web-monitor.ts` | Simulated feeds (paste, forum, marketplace, telegram, IRC), keyword matching |
| Credential Leak Detection | `services/credential-leak-detector.ts` | Email/domain breach monitoring, 10 simulated breaches, severity classification |
| Attack Surface Scanning | `services/attack-surface-scanner.ts` | Port scan, cert transparency, DNS enumeration (simulated) |
| #1 Confidence Scoring | `services/confidence-scorer.ts` | Multi-signal weighted scoring with human-readable reason summaries |
| #2 Signal Tracking | `services/signal-aggregator.ts` | Per-signal TP/FP tracking, success rate stats |
| #3 Evidence Chain | `services/evidence-chain.ts` | Linked audit trail from detection signal → alert creation |
| #4 Alert Deduplication | `services/alert-deduplication.ts` | Cross-type dedup with similarity thresholds, corroboration boost |
| #5 Severity Classification | `services/severity-classifier.ts` | Multi-factor: confidence, asset criticality, type risk, signal density, repeat |
| Graph Integration | `services/graph-integration.ts` | HTTP + service JWT to threat-graph, retry with exponential backoff |

## API (25 endpoints)

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
