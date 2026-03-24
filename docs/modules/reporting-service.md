# Reporting Service (Module 21)

**Port:** 3021 | **Status:** ✅ Deployed | **Tests:** 217 | **Queue:** etip-report-generate

## Features

| Feature | File | Description |
|---------|------|-------------|
| Report Generation | services/report-store.ts | In-memory CRUD, pagination, FIFO eviction (100/tenant), 30-day expiry |
| 5 Report Types | schemas/report.ts | daily, weekly, monthly, custom, executive |
| 4 Export Formats | schemas/report.ts | json, html, csv, pdf (placeholder) |
| BullMQ Worker | workers/report-worker.ts | Consumes QUEUES.REPORT_GENERATE, retry 3x, exponential backoff |
| Cron Scheduling | services/schedule-store.ts | node-cron lifecycle, enable/disable, run tracking |
| Template Engine | services/template-engine.ts | Section rendering, JSON/HTML/CSV/PDF output |
| Data Aggregator | services/data-aggregator.ts | Centralized data collector (IOC/feed/actor/malware/vuln/cost) |
| Retention Cron | services/retention-cron.ts | Hourly auto-purge of expired reports (prevents memory leak) |
| Report Cloning | routes/reports.ts | POST /:id/clone duplicates config into new pending report |
| Bulk Operations | routes/reports.ts, schedules.ts | Bulk-delete reports (up to 50), bulk-toggle schedules |
| Report Comparison | services/report-comparator.ts | Period-over-period diff: risk score delta, section metric changes |
| Report Versioning | schemas/report.ts | configVersion field for comparable re-runs |
| CSV Export | services/template-engine.ts | Enterprise tabular format with metadata headers + nested flattening |

## API Endpoints (25)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Liveness probe (includes queue name) |
| GET | /ready | Readiness probe |
| POST | /api/v1/reports | Request new report (enqueues to BullMQ) |
| GET | /api/v1/reports | List reports (paginated, filterable by type/status) |
| GET | /api/v1/reports/:id | Get report status + metadata |
| GET | /api/v1/reports/:id/download | Download report (JSON/HTML/CSV content-type) |
| POST | /api/v1/reports/:id/clone | Clone report config into new pending report |
| GET | /api/v1/reports/:id/compare/:otherId | Period-over-period structured diff |
| POST | /api/v1/reports/bulk-delete | Bulk soft-delete (up to 50 IDs) |
| DELETE | /api/v1/reports/:id | Soft-delete report |
| POST | /api/v1/reports/schedule | Create recurring schedule |
| GET | /api/v1/reports/schedule | List schedules for tenant |
| PUT | /api/v1/reports/schedule/:id | Update schedule |
| DELETE | /api/v1/reports/schedule/:id | Delete schedule + stop cron |
| PUT | /api/v1/reports/schedule/bulk-toggle | Bulk enable/disable schedules |
| GET | /api/v1/reports/templates | List 5 default templates |
| GET | /api/v1/reports/stats | Generation stats (count, avg time, by status/type) |

## Config

| Var | Default | Purpose |
|-----|---------|---------|
| TI_SERVICE_PORT | 3021 | HTTP port |
| TI_SERVICE_HOST | 0.0.0.0 | Bind address |
| TI_REDIS_URL | redis://localhost:6379/0 | BullMQ + worker connection |
| TI_REPORT_RETENTION_DAYS | 30 | Report expiry |
| TI_REPORT_MAX_PER_TENANT | 100 | FIFO eviction threshold |
| TI_JWT_SECRET | (required) | Auth |
| TI_SERVICE_JWT_SECRET | (required) | Service-to-service auth |

## Pipeline

```
Request → Zod validate → ReportStore.create(pending)
  → BullMQ enqueue (QUEUES.REPORT_GENERATE)
  → Worker picks up → status=generating
  → DataAggregator.aggregate() (IOC/feed/actor/malware/vuln/cost stats)
  → TemplateEngine.render() (JSON/HTML/CSV/PDF)
  → ReportStore.updateStatus(completed, result)

Cron Schedule → ScheduleStore callback → create report → enqueue
RetentionCron → hourly purgeExpired() → removes expired reports from memory
```
