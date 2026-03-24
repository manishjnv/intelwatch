# Reporting Service (Module 21)

**Port:** 3021 | **Status:** ✅ Deployed | **Tests:** 199 | **Queue:** etip-report-generate

## Features

| Feature | File | Description |
|---------|------|-------------|
| Report Generation | services/report-store.ts | In-memory CRUD, pagination, FIFO eviction (100/tenant), 30-day expiry |
| 5 Report Types | schemas/report.ts | daily, weekly, monthly, custom, executive |
| BullMQ Worker | workers/report-worker.ts | Consumes QUEUES.REPORT_GENERATE, retry 3x, exponential backoff |
| Cron Scheduling | services/schedule-store.ts | node-cron lifecycle, enable/disable, run tracking |
| Template Engine | services/template-engine.ts | P0 #2: reusable section rendering, JSON/HTML/PDF output |
| Data Aggregator | services/data-aggregator.ts | P0 #1: centralized data collector (IOC/feed/actor/malware/vuln/cost) |
| Report Versioning | schemas/report.ts | P0 #4: configVersion field for comparable re-runs |
| Export Validation | services/template-engine.ts | P0 #5: Zod schemas per format, graceful JSON fallback |
| Schedule Persistence | services/schedule-store.ts | P0 #3: cron-based recurring reports with callbacks |

## API Endpoints (20)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Liveness probe (includes queue name) |
| GET | /ready | Readiness probe |
| POST | /api/v1/reports | Request new report (enqueues to BullMQ) |
| GET | /api/v1/reports | List reports (paginated, filterable by type/status) |
| GET | /api/v1/reports/:id | Get report status + metadata |
| GET | /api/v1/reports/:id/download | Download report (JSON/HTML content-type) |
| DELETE | /api/v1/reports/:id | Soft-delete report |
| POST | /api/v1/reports/schedule | Create recurring schedule |
| GET | /api/v1/reports/schedule | List schedules for tenant |
| PUT | /api/v1/reports/schedule/:id | Update schedule |
| DELETE | /api/v1/reports/schedule/:id | Delete schedule + stop cron |
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
  → TemplateEngine.render() (JSON/HTML/PDF)
  → ReportStore.updateStatus(completed, result)

Cron Schedule → ScheduleStore callback → create report → enqueue
```
