# Admin Service — Module 22

Platform administration service for ETIP. System health monitoring, maintenance mode, backup management, tenant administration, and audit dashboard.

## Port
`3022`

## Endpoints (28 total)

### System Health
- `GET /health` — liveness probe
- `GET /ready` — readiness probe
- `GET /api/v1/admin/system/health` — full system health dashboard
- `GET /api/v1/admin/system/services` — service list with statuses
- `GET /api/v1/admin/system/metrics` — CPU/memory/disk snapshot
- `GET /api/v1/admin/system/dependency-map` — P0 #6: service/infra dependency map

### Maintenance Mode
- `GET /api/v1/admin/maintenance` — list maintenance windows
- `POST /api/v1/admin/maintenance` — create window
- `GET /api/v1/admin/maintenance/:id` — get window
- `PUT /api/v1/admin/maintenance/:id` — update window
- `DELETE /api/v1/admin/maintenance/:id` — delete window
- `POST /api/v1/admin/maintenance/:id/activate` — force-activate
- `POST /api/v1/admin/maintenance/:id/deactivate` — complete/deactivate

### Backup & Restore
- `GET /api/v1/admin/backups` — list backup records
- `POST /api/v1/admin/backups/trigger` — trigger snapshot
- `GET /api/v1/admin/backups/:id` — get backup details
- `POST /api/v1/admin/backups/:id/restore` — initiate restore

### Tenant Administration
- `GET /api/v1/admin/tenants` — list tenants (filter by status, plan)
- `POST /api/v1/admin/tenants` — create tenant
- `GET /api/v1/admin/tenants/:id` — get tenant
- `PUT /api/v1/admin/tenants/:id/suspend` — suspend
- `PUT /api/v1/admin/tenants/:id/reinstate` — reinstate
- `PUT /api/v1/admin/tenants/:id/plan` — change plan
- `GET /api/v1/admin/tenants/:id/usage` — usage overview
- `DELETE /api/v1/admin/tenants/:id` — delete tenant

### Audit Dashboard
- `GET /api/v1/admin/audit` — list audit events (filter + paginate)
- `GET /api/v1/admin/audit/stats` — aggregate statistics
- `POST /api/v1/admin/audit/export` — export CSV

### P0 Improvements
- `GET /api/v1/admin/alert-rules` — P0 #7: list alert rules
- `POST /api/v1/admin/alert-rules` — create alert rule
- `PUT /api/v1/admin/alert-rules/:id` — update alert rule
- `DELETE /api/v1/admin/alert-rules/:id` — delete alert rule
- `GET /api/v1/admin/maintenance/scheduled` — P0 #8: scheduled maintenance jobs
- `POST /api/v1/admin/maintenance/scheduled` — create scheduled job
- `GET /api/v1/admin/tenants/:id/analytics` — P0 #9: tenant usage analytics
- `GET /api/v1/admin/activity` — P0 #10: admin activity log
- `POST /api/v1/admin/activity` — log admin action

## Environment Variables

```bash
TI_ADMIN_PORT=3022
TI_ADMIN_HOST=0.0.0.0
TI_JWT_SECRET=<min 32 chars>
TI_SERVICE_JWT_SECRET=<min 16 chars>
TI_REDIS_URL=redis://...
TI_CORS_ORIGINS=https://ti.intelwatch.in
TI_RATE_LIMIT_WINDOW_MS=60000
TI_RATE_LIMIT_MAX=200
TI_LOG_LEVEL=info
```

## Architecture Notes

- **In-memory store** (DECISION-013): all stores use Maps. State resets on restart.
- **Fastify plugin pattern** (DECISION-012): all routes follow the Fastify plugin architecture.
- **No Prisma**: admin-service is a monitoring/ops layer, not a data persistence layer.
- Migrate to DB-backed stores when horizontal scaling is required.
