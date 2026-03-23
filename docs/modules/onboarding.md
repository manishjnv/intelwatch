# Onboarding Service (Module 18)

**Port:** 3018 | **Status:** ✅ Deployed | **Tests:** 190 | **Endpoints:** 32

## Features

| Feature | File | Description |
|---------|------|-------------|
| Setup Wizard | `services/wizard-store.ts` | 8-step flow: welcome → org → team → feeds → integrations → dashboard → readiness → launch |
| Data Source Connectors | `services/connector-validator.ts` | 8 types (RSS, STIX/TAXII, REST, CSV, Splunk, Sentinel, Elastic, webhook) |
| Pipeline Health Check | `services/health-checker.ts` | 6-stage pipeline monitoring (ingest → normalize → enrich → IOC → graph → correlate) |
| Module Readiness | `services/module-readiness.ts` | 14-module dependency graph, enable/disable with validation |
| Progress Tracker | `services/progress-tracker.ts` | 8 readiness checks, completion scoring |
| Prerequisite Validation (P0) | `services/prerequisite-validator.ts` | Transitive dep chain, config prereqs |
| Demo Data Seeding (P0) | `services/demo-seeder.ts` | 150 IOCs, 10 actors, 20 malware, 50 CVEs, 5 alerts (tagged DEMO) |
| Integration Testing (P0) | `services/integration-tester.ts` | DNS → TCP → auth → data pull multi-step test |
| Checklist Persistence (P0) | `services/checklist-persistence.ts` | Versioned snapshots (max 10), save/resume |
| Welcome Dashboard (P0) | `services/welcome-dashboard.ts` | Quick actions, 6 guided tips, tour tracking |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| GET | `/ready` | Service readiness |
| GET | `/api/v1/onboarding/wizard` | Get wizard state |
| POST | `/api/v1/onboarding/wizard/org-profile` | Set org profile |
| POST | `/api/v1/onboarding/wizard/team-invite` | Invite team members |
| POST | `/api/v1/onboarding/wizard/complete-step` | Complete a step |
| POST | `/api/v1/onboarding/wizard/skip-step` | Skip optional step |
| POST | `/api/v1/onboarding/wizard/dashboard-prefs` | Set dashboard prefs |
| POST | `/api/v1/onboarding/wizard/reset` | Reset wizard |
| GET | `/api/v1/onboarding/connectors/types` | List data source types |
| GET | `/api/v1/onboarding/connectors` | List data sources |
| POST | `/api/v1/onboarding/connectors` | Add data source |
| POST | `/api/v1/onboarding/connectors/validate` | Validate without saving |
| POST | `/api/v1/onboarding/connectors/:id/test` | Test connection |
| POST | `/api/v1/onboarding/connectors/:id/integration-test` | Full integration test |
| GET | `/api/v1/onboarding/connectors/:id/test-result` | Last test result |
| POST | `/api/v1/onboarding/connectors/test-all` | Test all sources |
| GET | `/api/v1/onboarding/pipeline/health` | Pipeline health |
| GET | `/api/v1/onboarding/pipeline/stages` | List stages |
| GET | `/api/v1/onboarding/pipeline/readiness` | Readiness checks |
| GET | `/api/v1/onboarding/modules` | List module readiness |
| GET | `/api/v1/onboarding/modules/:mod` | Single module readiness |
| POST | `/api/v1/onboarding/modules/:mod/enable` | Enable module |
| POST | `/api/v1/onboarding/modules/:mod/disable` | Disable module |
| GET | `/api/v1/onboarding/modules/prerequisites/rules` | Prerequisite rules |
| GET | `/api/v1/onboarding/modules/:mod/dependencies` | Dependency chain |
| GET | `/api/v1/onboarding/welcome` | Welcome dashboard |
| GET | `/api/v1/onboarding/welcome/tips` | Guided tips |
| POST | `/api/v1/onboarding/welcome/seed-demo` | Seed demo data |
| GET | `/api/v1/onboarding/welcome/demo-status` | Demo seed status |
| DELETE | `/api/v1/onboarding/welcome/demo-data` | Clear demo data |
| GET | `/api/v1/onboarding/welcome/demo-available` | Available demo counts |
| POST | `/api/v1/onboarding/welcome/tour-complete` | Mark tour done |
| GET | `/api/v1/onboarding/welcome/should-show` | Show welcome? |
| POST | `/api/v1/onboarding/welcome/save-state` | Save checklist |
| GET | `/api/v1/onboarding/welcome/saved-state` | Load saved state |

## Config

| Var | Default | Purpose |
|-----|---------|---------|
| TI_ONBOARDING_PORT | 3018 | Service port |
| TI_ONBOARDING_HOST | 0.0.0.0 | Bind host |
| TI_JWT_SECRET | (required) | JWT verification |
| TI_SERVICE_JWT_SECRET | (required) | Service-to-service auth |
| TI_CORS_ORIGINS | http://localhost:3002 | Allowed origins |
| TI_RATE_LIMIT_MAX | 200 | Max requests per window |
| TI_LOG_LEVEL | info | Pino log level |
