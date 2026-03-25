# Admin Ops Service — Module 22

**Status:** ✅ Feature-Complete (5 core + 5 P0 + queue monitor) | **Tests:** 158 | **Port:** 3022 | **Session:** 60

Platform administration service for ETIP. System health monitoring, maintenance windows, backup/restore, tenant administration, audit dashboard, and operational intelligence.

---

## Features

| Feature | Files | Description |
|---------|-------|-------------|
| System Health | `services/health-store.ts`, `routes/system-health.ts` | 18 registered services; live status, metrics snapshot (CPU/memory/disk via process.memoryUsage()), dependency graph |
| Maintenance Windows | `services/maintenance-store.ts`, `routes/maintenance.ts` | CRUD with status derived from startsAt/endsAt; force-activate/deactivate; scope: full/partial/service |
| Backup & Restore | `services/backup-store.ts`, `routes/backup.ts` | Trigger snapshot (full/incremental/schema); mark complete with size+path; initiate restore from completed backup only |
| Tenant Administration | `services/tenant-store.ts`, `routes/tenants.ts` | CRUD; suspend with reason; reinstate; change plan; usage overview; auto-creates TenantUsage on create |
| Audit Dashboard | `services/audit-store.ts`, `routes/audit.ts` | Max 10,000 events (reverse-chron, unshift); pagination; stats by actor/resource/time; CSV export |
| P0 #6: Dependency Map | `services/health-store.ts` | GET /system/dependency-map — nodes+edges for all services and infra |
| P0 #7: Alert Rules | `services/alert-rules-store.ts`, `routes/p0-features.ts` | 5 default rules seeded (CPU, memory, disk, error-rate, uptime); evaluate() checks thresholds |
| P0 #8: Scheduled Maintenance | `services/scheduled-maintenance-store.ts`, `routes/p0-features.ts` | Cron expression validation (regex); create/list/toggle/delete; enabled/disabled toggle |
| P0 #9: Tenant Analytics | `services/tenant-analytics-store.ts`, `routes/p0-features.ts` | Per-tenant usage analytics (7d/30d/90d); registerTenant() lazy-init; simulated daily trend |
| P0 #10: Admin Activity Log | `services/admin-activity-store.ts`, `routes/p0-features.ts` | Max 5,000 entries; filter by adminId; pagination; POST /activity to log actions |
| Queue Monitor | `routes/queue-monitor.ts` | Live BullMQ queue depths via ioredis LLEN+ZCARD; 14 canonical queues (etip-*); injectable RedisQueueClient interface for testing; never 500s on Redis errors |

---

## API Endpoints (28 total)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe |
| GET | `/api/v1/admin/system/health` | Full system health dashboard |
| GET | `/api/v1/admin/system/services` | Service list with statuses |
| GET | `/api/v1/admin/system/metrics` | CPU/memory/disk snapshot |
| GET | `/api/v1/admin/system/dependency-map` | Service/infra dependency map |
| GET | `/api/v1/admin/maintenance` | List maintenance windows (filter by status) |
| POST | `/api/v1/admin/maintenance` | Create maintenance window |
| GET | `/api/v1/admin/maintenance/:id` | Get single window |
| PUT | `/api/v1/admin/maintenance/:id` | Update window |
| DELETE | `/api/v1/admin/maintenance/:id` | Delete window |
| POST | `/api/v1/admin/maintenance/:id/activate` | Force-activate window |
| POST | `/api/v1/admin/maintenance/:id/deactivate` | Complete/deactivate window |
| GET | `/api/v1/admin/backups` | List backup records (newest first) |
| POST | `/api/v1/admin/backups/trigger` | Trigger new backup (full/incremental/schema) |
| GET | `/api/v1/admin/backups/:id` | Get backup details |
| POST | `/api/v1/admin/backups/:id/restore` | Initiate restore (backup must be completed) |
| GET | `/api/v1/admin/tenants` | List tenants (filter by status, plan) |
| POST | `/api/v1/admin/tenants` | Create tenant |
| GET | `/api/v1/admin/tenants/:id` | Get tenant details |
| PUT | `/api/v1/admin/tenants/:id/suspend` | Suspend tenant with reason |
| PUT | `/api/v1/admin/tenants/:id/reinstate` | Reinstate suspended tenant |
| PUT | `/api/v1/admin/tenants/:id/plan` | Change tenant plan |
| GET | `/api/v1/admin/tenants/:id/usage` | Tenant usage overview |
| DELETE | `/api/v1/admin/tenants/:id` | Delete tenant |
| GET | `/api/v1/admin/audit` | List audit events (filter + paginate) |
| GET | `/api/v1/admin/audit/stats` | Aggregate audit statistics |
| POST | `/api/v1/admin/audit/export` | Export audit log as CSV |
| GET | `/api/v1/admin/alert-rules` | List alert rules |
| POST | `/api/v1/admin/alert-rules` | Create alert rule |
| PUT | `/api/v1/admin/alert-rules/:id` | Update alert rule |
| DELETE | `/api/v1/admin/alert-rules/:id` | Delete alert rule |
| GET | `/api/v1/admin/maintenance/scheduled` | List scheduled maintenance jobs |
| POST | `/api/v1/admin/maintenance/scheduled` | Create scheduled job (cron validated) |
| GET | `/api/v1/admin/tenants/:id/analytics` | Per-tenant analytics (7d/30d/90d) |
| GET | `/api/v1/admin/activity` | Admin activity log (filter by adminId) |
| POST | `/api/v1/admin/activity` | Log admin action |
| GET | `/api/v1/admin/queues` | Live BullMQ queue depths (14 queues: waiting/active/failed/completed + updatedAt) |

---

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `TI_ADMIN_PORT` | `3022` | Service port |
| `TI_ADMIN_HOST` | `0.0.0.0` | Bind host |
| `TI_JWT_SECRET` | required | JWT verification (min 32 chars) |
| `TI_SERVICE_JWT_SECRET` | required | Service-to-service JWT (min 16 chars) |
| `TI_REDIS_URL` | required | Redis connection URL |
| `TI_CORS_ORIGINS` | `https://ti.intelwatch.in` | Allowed CORS origins |
| `TI_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `TI_RATE_LIMIT_MAX` | `200` | Max requests per window |
| `TI_LOG_LEVEL` | `info` | Pino log level |

---

## Architecture Notes

- **In-memory store** (DECISION-013): all 9 stores use Maps. State resets on restart.
- **Fastify plugin pattern** (DECISION-012): all routes use DI deps pattern.
- **No Prisma**: admin-service is an ops/monitoring layer, not a data persistence layer.
- **validate() helper**: all route handlers use `validate(Schema, body)` — safeParse converts ZodError → AppError(400). Never throws raw ZodError.
- **BackupStore sort**: sequence counter `_seq` offsets `createdAt` by `seq` ms to guarantee stable sort when multiple records created within same millisecond.
- **TenantAnalyticsStore**: requires `registerTenant(id)` before `getAnalytics(id)`. Route handler auto-registers on first analytics request.
